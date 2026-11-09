// Step inside: bring the saved page to the front and put the user back where they stopped.
// Opens only the web URL the app sent; reports honestly how close it got.
import type { PagePosition, StepOpenPayload, StepOpenResult } from '@side/shared';
import { isWebUrl, urlOf } from './api';
import type { ChromeApi, TabLike } from './api';
import { RejectedError, chromeCall } from './journal';
import { restorePositionInPage, withTimeout } from './position';
import { showStoppedMarkerInPage } from './marker';
import { COPY } from './copy';

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

const MARKER_MS = 8000;

/** Best effort: a failure here never changes what Chrome confirmed. Needs permission for the site. */
async function markSpot(api: ChromeApi, tabId: number, url: string, pos: PagePosition, anchor: 'top' | 'center'): Promise<void> {
  try {
    if (!(await canInject(api, url))) return;
    await withTimeout(
      api.scripting.executeScript({ target: { tabId }, func: showStoppedMarkerInPage, args: [pos, { ms: MARKER_MS, anchor }] }),
      3000,
    );
  } catch {
    // The page refused or went away; the spot is still restored.
  }
}

export async function openStep(api: ChromeApi, p: StepOpenPayload, opts: OpenOptions): Promise<StepOpenResult> {
  if (!isWebUrl(p.url)) throw new RejectedError(COPY.onlyWebPages);
  let parsed: URL;
  try {
    parsed = new URL(p.url);
  } catch {
    throw new RejectedError(COPY.badAddress);
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
      if (res?.[0]?.result === 'exact') {
        await markSpot(api, tabId, parsed.href, pos, 'top');
        return { tabId, restored: 'exact' };
      }
    } catch {
      // Fall through to the sentence link.
    }
  }
  if (pos.quote) {
    await chromeCall(() => api.tabs.update(tabId, { url: textFragmentUrl(parsed.href, pos.quote as string) }));
    if (await waitForLoad(api, tabId, opts.loadTimeoutMs)) await markSpot(api, tabId, parsed.href, pos, 'center');
    return { tabId, restored: 'text' };
  }
  return { tabId, restored: 'top' };
}
