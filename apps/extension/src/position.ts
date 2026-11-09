// Reads and restores "where the user was looking". The two page functions run inside the tab via
// chrome.scripting.executeScript, so they must stay self-contained: no imports, no outer variables.
import type { PagePosition } from '@side/shared';
import { isWebUrl, urlOf } from './api';
import type { ChromeApi, TabLike } from './api';

/**
 * Runs in the page. Picks the element that actually scrolled (Docs and Notion scroll an inner
 * element, so window.scrollY stays 0), builds a selector for it and grabs one visible sentence.
 */
export function capturePositionInPage(env?: unknown): PagePosition | null {
  const w: any = env ?? globalThis;
  const doc: any = w.document;
  if (!doc) return null;
  const vh: number = w.innerHeight || 0;
  const root: any = doc.scrollingElement || doc.documentElement;
  let best: any = null;
  let top: number = w.scrollY || (root ? root.scrollTop : 0) || 0;
  let max: number = root ? Math.max(0, root.scrollHeight - vh) : 0;
  const nodes: any[] = Array.from(doc.querySelectorAll('*'));
  const limit = Math.min(nodes.length, 20000);
  for (let i = 0; i < limit; i++) {
    const n = nodes[i];
    if (n === root || n === doc.body) continue;
    const st = n.scrollTop || 0;
    if (st > top && n.scrollHeight > n.clientHeight + 1) {
      best = n;
      top = st;
      max = n.scrollHeight - n.clientHeight;
    }
  }

  const esc = (s: string): string =>
    w.CSS && typeof w.CSS.escape === 'function' ? w.CSS.escape(s) : s.replace(/[^a-zA-Z0-9_-]/g, (c) => '\\' + c);
  const selectorFor = (node: any): string => {
    if (node.id) return '#' + esc(node.id);
    const classes: string[] = (typeof node.className === 'string' ? node.className : '').split(/\s+/).filter(Boolean);
    for (const c of classes) {
      const sel = '.' + esc(c);
      if (doc.querySelectorAll(sel).length === 1) return sel;
    }
    const parts: string[] = [];
    let cur: any = node;
    while (cur && cur.nodeType === 1 && cur !== doc.body && cur !== doc.documentElement) {
      if (cur.id) {
        parts.unshift('#' + esc(cur.id));
        return parts.join(' > ');
      }
      let part = String(cur.tagName).toLowerCase();
      const parent = cur.parentElement;
      if (parent) {
        const same = Array.from(parent.children as any[]).filter((c: any) => c.tagName === cur.tagName);
        if (same.length > 1) part += ':nth-of-type(' + (same.indexOf(cur) + 1) + ')';
      }
      parts.unshift(part);
      cur = parent;
    }
    return ['body'].concat(parts).join(' > ');
  };

  let quote: string | null = null;
  const blocks: any[] = Array.from(doc.querySelectorAll('p, li, h1, h2, h3, h4, blockquote, td, pre, dd'));
  for (let i = 0; i < Math.min(blocks.length, 3000) && quote === null; i++) {
    const b = blocks[i];
    const r = b.getBoundingClientRect();
    if (!(r.bottom > 0 && r.top < vh)) continue;
    const text = String(b.textContent || '').replace(/\s+/g, ' ').trim();
    if (text.length < 20) continue;
    const m = /^.*?[.!?](?=\s|$)/.exec(text);
    let s = m && m[0].length <= 120 ? m[0] : text;
    if (s.length > 120) {
      s = s.slice(0, 121);
      const cut = s.lastIndexOf(' ');
      s = (cut > 20 ? s.slice(0, cut) : s.slice(0, 120)).trim();
    }
    quote = s;
  }

  return {
    scroller: best ? 'element' : 'window',
    selector: best ? selectorFor(best) : null,
    top: Math.max(0, Math.round(top)),
    ratio: max > 0 ? Math.min(1, Math.max(0, top / max)) : 0,
    quote,
    capturedAt: Date.now(),
  };
}

/**
 * Runs in the page. Scrolls the saved scroller back to the saved offset, retrying while the page
 * is still loading. 'exact' = the saved offset was reached; 'approx' = only the ratio could be used.
 */
export async function restorePositionInPage(pos: PagePosition, waitMs: number, env?: unknown): Promise<'exact' | 'approx' | 'none'> {
  const w: any = env ?? globalThis;
  const doc: any = w.document;
  const deadline = Date.now() + waitMs;
  let approx = false;
  for (;;) {
    const isWindow = pos.scroller === 'window' || !pos.selector;
    const target: any = isWindow ? doc.scrollingElement || doc.documentElement : doc.querySelector(pos.selector);
    if (target) {
      const view = isWindow ? w.innerHeight || target.clientHeight : target.clientHeight;
      const max = target.scrollHeight - view;
      if (max >= pos.top && max > 0) {
        if (isWindow) w.scrollTo(0, pos.top);
        else target.scrollTop = pos.top;
        const got = isWindow ? w.scrollY : target.scrollTop;
        if (Math.abs(got - pos.top) <= 4) return 'exact';
      } else if (max > 0) {
        const want = Math.round(pos.ratio * max);
        if (isWindow) w.scrollTo(0, want);
        else target.scrollTop = want;
        approx = true;
      }
    }
    if (Date.now() >= deadline) return approx ? 'approx' : 'none';
    await new Promise((r) => setTimeout(r, 250));
  }
}

function isPagePosition(v: unknown): v is PagePosition {
  if (!v || typeof v !== 'object') return false;
  const p = v as Record<string, unknown>;
  return (
    (p.scroller === 'window' || p.scroller === 'element') &&
    (p.selector === null || (typeof p.selector === 'string' && p.selector.length <= 500)) &&
    typeof p.top === 'number' && Number.isFinite(p.top) && p.top >= 0 &&
    typeof p.ratio === 'number' && p.ratio >= 0 && p.ratio <= 1 &&
    (p.quote === null || (typeof p.quote === 'string' && p.quote.length <= 300)) &&
    typeof p.capturedAt === 'number'
  );
}

export function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timeout')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

const STORE_KEY = 'side.positions';
const pageKey = (url: string) => url.split('#')[0];

/** Keeps the last known position per tab, persisted so a sleeping service worker does not lose it. */
export class PositionTracker {
  readonly positions = new Map<number, PagePosition>();
  private readonly urls = new Map<number, string>();

  constructor(private readonly api: ChromeApi, private readonly opts: { timeoutMs: number }) {}

  async load(): Promise<void> {
    const got = await this.api.storage.local.get(STORE_KEY);
    const saved = got[STORE_KEY];
    if (!saved || typeof saved !== 'object') return;
    for (const [id, entry] of Object.entries(saved as Record<string, { url?: unknown; pos?: unknown }>)) {
      if (entry && typeof entry.url === 'string' && isPagePosition(entry.pos)) {
        this.positions.set(Number(id), entry.pos);
        this.urls.set(Number(id), entry.url);
      }
    }
  }

  /** Positions only for tabs still showing the page they were captured on. */
  matching(tabs: TabLike[]): Map<number, PagePosition> {
    const out = new Map<number, PagePosition>();
    for (const t of tabs) {
      if (t.id === undefined) continue;
      const pos = this.positions.get(t.id);
      if (pos && this.urls.get(t.id) === pageKey(urlOf(t))) out.set(t.id, pos);
    }
    return out;
  }

  async capture(tab: TabLike): Promise<PagePosition | null> {
    if (tab.id === undefined || tab.incognito) return null;
    const url = urlOf(tab);
    if (!isWebUrl(url)) return null;
    let origin: string;
    try {
      origin = new URL(url).origin + '/*';
    } catch {
      return null;
    }
    try {
      if (!(await this.api.permissions.contains({ origins: [origin] }))) return null;
      const results = await withTimeout(
        this.api.scripting.executeScript({ target: { tabId: tab.id }, func: capturePositionInPage }),
        this.opts.timeoutMs,
      );
      const pos = results?.[0]?.result;
      if (!isPagePosition(pos)) return null;
      this.positions.set(tab.id, pos);
      this.urls.set(tab.id, pageKey(url));
      await this.save();
      return pos;
    } catch {
      return null;
    }
  }

  async forget(tabId: number): Promise<void> {
    this.positions.delete(tabId);
    this.urls.delete(tabId);
    await this.save();
  }

  private async save(): Promise<void> {
    const out: Record<string, { url: string; pos: PagePosition }> = {};
    for (const [id, pos] of this.positions) out[id] = { url: this.urls.get(id) ?? '', pos };
    await this.api.storage.local.set({ [STORE_KEY]: out });
  }
}
