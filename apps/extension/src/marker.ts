// "You stopped here": a small marker drawn on the page after Step inside, only where the spot was
// confirmed. It lives in a shadow root (the page's styles cannot change it), ignores the mouse and
// leaves after a few seconds.
import type { PagePosition } from '@side/shared';

export const MARKER_TEXT = 'You stopped here';

export interface MarkerOptions {
  ms: number;
  /** 'top': the saved offset is back at the top of the view. 'center': Chrome scrolled to the saved sentence. */
  anchor: 'top' | 'center';
  /** The words on the marker; English when absent. Passed in because this function runs in the page. */
  text?: string;
}

/**
 * Runs in the page via chrome.scripting, so it must be self-contained: no references to anything
 * outside this function body.
 */
export function showStoppedMarkerInPage(pos: PagePosition, opts: MarkerOptions, env?: unknown): boolean {
  const w: any = env ?? globalThis;
  const doc: any = w.document;
  if (!doc || typeof doc.createElement !== 'function') return false;

  let rect = { top: 0, left: 0, width: w.innerWidth || 0, height: w.innerHeight || 0 };
  if (pos.scroller === 'element' && pos.selector) {
    const target: any = doc.querySelector(pos.selector);
    const r = target?.getBoundingClientRect?.();
    if (r && r.width > 0 && r.height > 0) {
      rect = { top: Math.max(0, r.top), left: Math.max(0, r.left), width: r.width, height: r.height };
    }
  }
  const raw = opts.anchor === 'center' ? rect.top + rect.height / 2 - 14 : rect.top + 96;
  const y = Math.round(Math.max(rect.top + 8, Math.min(raw, rect.top + rect.height - 40)));
  const reduce = !!w.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const fade = reduce ? '' : 'transition:opacity .4s ease;';

  for (const old of doc.querySelectorAll?.('[data-side-marker]') ?? []) old.remove();

  const host: any = doc.createElement('div');
  host.setAttribute('data-side-marker', '');
  host.style.cssText = 'all:initial;position:fixed;inset:0;pointer-events:none;z-index:2147483647;' + fade;
  const root: any = host.attachShadow({ mode: 'open' });
  const label = String(opts.text || 'You stopped here')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;');
  root.innerHTML =
    '<style>' +
    ':host{all:initial}' +
    '.band{position:fixed;height:30px;background:#EEF1FD;border-radius:2px;opacity:.9}' +
    '.pill{position:fixed;background:#3B54E7;color:#fff;font:600 13px/1 Pretendard,-apple-system,BlinkMacSystemFont,system-ui,sans-serif;' +
    'border-radius:999px;padding:8px 12px;white-space:nowrap;box-shadow:0 2px 8px rgba(20,24,40,.25)}' +
    '.pill::after{content:"";position:absolute;right:-6px;top:50%;margin-top:-5px;border:5px solid transparent;border-left-color:#3B54E7;border-right:0}' +
    '</style>' +
    `<div class="band" style="top:${y}px;left:${Math.round(rect.left)}px;width:${Math.round(rect.width)}px"></div>` +
    `<div class="pill" style="top:${y}px;left:${Math.round(rect.left) + 8}px">${label}</div>`;
  doc.documentElement.appendChild(host);

  const later = (fn: () => void, ms: number) => (w.setTimeout ? w.setTimeout(fn, ms) : setTimeout(fn, ms));
  later(() => {
    if (reduce) return host.remove();
    host.style.cssText = host.style.cssText + ';opacity:0';
    later(() => host.remove(), 450);
  }, opts.ms);
  return true;
}
