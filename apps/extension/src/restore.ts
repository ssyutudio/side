// Step inside: bring the saved page to the front and put the user back where they stopped.
// Opens only the web URL the app sent; reports honestly how close it got.
import type { StepOpenPayload, StepOpenResult } from '@side/shared';
import { isWebUrl, urlOf } from './api';
import type { ChromeApi, TabLike } from './api';
import { RejectedError, chromeCall } from './journal';
import { restorePositionInPage, withTimeout } from './position';

export interface OpenOptions {
  loadTimeoutMs: number;
  restoreWaitMs: number;
}

const pageKey = (url: string) => url.split('#')[0];

/** URL that asks Chrome to scroll to and highlight `quote` (Text Fragments). */
export function textFragmentUrl(url: string, quote: string): string {
  const enc = encodeURIComponent(quote).replace(/-/g, '%2D');
  return `${pageKey(url)}#:~:text=${enc}`;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForLoad(api: ChromeApi, tabId: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    let tab: TabLike | null = null;
    try {
      tab = await api.tabs.get(tabId);
    } catch {
      return false;
    }
    if (tab.status === 'complete') return true;
    if (Date.now() >= deadline) return false;
    await sleep(200);
  }
}

async function canInject(api: ChromeApi, url: string): Promise<boolean> {
  try {
    return await api.permissions.contains({ origins: [new URL(url).origin + '/*'] });
  } catch {
    return false;
  }
}

export async function openStep(api: ChromeApi, p: StepOpenPayload, opts: OpenOptions): Promise<StepOpenResult> {
  if (!isWebUrl(p.url)) throw new RejectedError('Side only opens web pages.');
  let parsed: URL;
  try {
    parsed = new URL(p.url);
  } catch {
    throw new RejectedError('That address is not valid.');
  }

  const all = await chromeCall(() => api.tabs.query({}));
  const existing = all.find((t) => t.id !== undefined && !t.incognito && pageKey(urlOf(t)) === pageKey(parsed.href));
  let tab: TabLike;
  if (existing) {
    tab = (await chromeCall(() => api.tabs.update(existing.id as number, { active: true }))) ?? existing;
  } else {
    tab = await chromeCall(() => api.tabs.create({ url: parsed.href, active: true }));
  }
  const tabId = tab.id as number;
  await api.windows.update(tab.windowId, { focused: true }).catch(() => undefined);

  const loaded = await waitForLoad(api, tabId, opts.loadTimeoutMs);
  const pos = p.position;
  if (!pos) return { tabId, restored: 'top' };

  if (loaded && (await canInject(api, parsed.href))) {
    try {
      const res = await withTimeout(
        api.scripting.executeScript({ target: { tabId }, func: restorePositionInPage, args: [pos, opts.restoreWaitMs] }),
        opts.restoreWaitMs + 2000,
      );
      if (res?.[0]?.result === 'exact') return { tabId, restored: 'exact' };
    } catch {
      // Fall through to the sentence link.
    }
  }
  if (pos.quote) {
    await chromeCall(() => api.tabs.update(tabId, { url: textFragmentUrl(parsed.href, pos.quote as string) }));
    return { tabId, restored: 'text' };
  }
  return { tabId, restored: 'top' };
}
