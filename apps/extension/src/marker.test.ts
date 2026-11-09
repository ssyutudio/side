import { showStoppedMarkerInPage, MARKER_TEXT } from './marker';
import type { PagePosition } from '@side/shared';

// Minimal page stand-in: elements with style, attributes, a shadow root, and manual timers.
function fakePage(opts: { reduce?: boolean; scroller?: { top: number; left: number; width: number; height: number } } = {}) {
  const timers: { fn: () => void; ms: number }[] = [];
  const attached: any[] = [];
  const make = (tag: string): any => {
    const node: any = {
      tagName: tag.toUpperCase(),
      style: { cssText: '' },
      attrs: {} as Record<string, string>,
      shadow: null as any,
      removed: false,
      setAttribute(k: string, v: string) {
        node.attrs[k] = v;
      },
      attachShadow(o: { mode: string }) {
        node.shadow = { mode: o.mode, innerHTML: '', host: node };
        return node.shadow;
      },
      remove() {
        node.removed = true;
        const i = attached.indexOf(node);
        if (i >= 0) attached.splice(i, 1);
      },
    };
    return node;
  };
  const scrollerEl = opts.scroller ? { getBoundingClientRect: () => opts.scroller } : null;
  const doc = {
    createElement: make,
    documentElement: { appendChild: (n: any) => attached.push(n) },
    querySelector: (sel: string) => (sel === '.kix-appview-editor' ? scrollerEl : null),
    querySelectorAll: (sel: string) => (sel === '[data-side-marker]' ? [...attached] : []),
  };
  const env = {
    document: doc,
    innerWidth: 1440,
    innerHeight: 900,
    matchMedia: (q: string) => ({ matches: !!opts.reduce && q.includes('reduce') }),
    setTimeout: (fn: () => void, ms: number) => timers.push({ fn, ms }),
  };
  return { env, attached, timers, runTimers: () => { while (timers.length) timers.shift()!.fn(); } };
}

const win: PagePosition = { scroller: 'window', selector: null, top: 2400, ratio: 0.4, quote: null, capturedAt: 1 };
const docs: PagePosition = { scroller: 'element', selector: '.kix-appview-editor', top: 4200, ratio: 0.45, quote: null, capturedAt: 1 };

describe('showStoppedMarkerInPage', () => {
  it('adds one marker in a shadow root that says exactly "You stopped here" and ignores the mouse', () => {
    const p = fakePage();
    expect(showStoppedMarkerInPage(win, { ms: 8000, anchor: 'top' }, p.env)).toBe(true);
    expect(p.attached).toHaveLength(1);
    const host = p.attached[0];
    expect(host.attrs['data-side-marker']).toBe('');
    expect(host.style.cssText).toContain('all:initial');
    expect(host.style.cssText).toContain('pointer-events:none');
    expect(host.shadow).not.toBeNull();
    expect(host.shadow.innerHTML).toContain(`>${MARKER_TEXT}<`);
    expect(MARKER_TEXT).toBe('You stopped here');
    expect(host.shadow.innerHTML).toContain('#3B54E7');
    expect(host.shadow.innerHTML).toContain('#EEF1FD');
  });

  it('sits near the top of an inner scroller (Google Docs), inside its visible rect', () => {
    const p = fakePage({ scroller: { top: 120, left: 300, width: 820, height: 700 } });
    showStoppedMarkerInPage(docs, { ms: 8000, anchor: 'top' }, p.env);
    const html: string = p.attached[0].shadow.innerHTML;
    expect(html).toMatch(/class="band" style="top:216px;left:300px;width:820px/);
    expect(html).toMatch(/class="pill" style="top:216px;left:308px/);
  });

  it('sits in the middle of the view when Chrome scrolled to the saved sentence', () => {
    const p = fakePage();
    showStoppedMarkerInPage(win, { ms: 8000, anchor: 'center' }, p.env);
    expect(p.attached[0].shadow.innerHTML).toMatch(/class="pill" style="top:436px/);
  });

  it('leaves after the given time, and replaces an older marker instead of stacking', () => {
    const p = fakePage();
    showStoppedMarkerInPage(win, { ms: 8000, anchor: 'top' }, p.env);
    showStoppedMarkerInPage(win, { ms: 8000, anchor: 'top' }, p.env);
    expect(p.attached).toHaveLength(1);
    expect(p.timers.some((t) => t.ms === 8000)).toBe(true);
    p.runTimers();
    expect(p.attached).toHaveLength(0);
  });

  it('with Reduce Motion, has no animation and is simply removed', () => {
    const p = fakePage({ reduce: true });
    showStoppedMarkerInPage(win, { ms: 8000, anchor: 'top' }, p.env);
    expect(p.attached[0].shadow.innerHTML).not.toMatch(/transition|animation/);
    p.runTimers();
    expect(p.attached).toHaveLength(0);
  });

  it('does nothing when the page has no document', () => {
    expect(showStoppedMarkerInPage(win, { ms: 8000, anchor: 'top' }, {})).toBe(false);
  });
});
