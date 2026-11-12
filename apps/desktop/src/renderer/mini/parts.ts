// Pieces every Mini view shares: the header with the connection chip, facts, quick actions, footer.
import type { ViewState } from '../../main/viewState';
import { html, raw, type SafeHtml } from '../shared/html';
import { t, tn } from '../../i18n';

export const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Local clock time, e.g. "11:40 PM". */
export function clock(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const hour = h % 12 === 0 ? 12 : h % 12;
  return h < 12 ? t('{h}:{m} AM', { h: hour, m }) : t('{h}:{m} PM', { h: hour, m });
}

export function chip(s: ViewState): SafeHtml {
  return s.connection === 'connected'
    ? html`<span class="chip ok">${t('Chrome connected')}</span>`
    : html`<span class="chip warn">${t('Chrome not connected')}</span>`;
}

export function head(c: SafeHtml): SafeHtml {
  return html`<div class="ph"><span class="name">Side</span>${c}<span class="sp"></span><button class="x" data-act="close" aria-label="${t('Close Mini')}">×</button></div>`;
}

export function facts(rows: [string, string][]): SafeHtml {
  return html`<div class="facts">${rows.map(([k, v]) => html`<div><span>${k}</span><b>${v}</b></div>`)}</div>`;
}

export interface QuickAction {
  icon: string;
  title: string;
  sub?: string;
  act: string;
  key?: string;
  off?: boolean;
}

/** Titles may be marked literals or text already made; t() leaves made text as it is. */
export function quick(items: QuickAction[]): SafeHtml {
  return html`<div class="qa">${items.map(
    (q) => html`<button${raw(q.off ? ' aria-disabled="true" class="off"' : '')} data-act="${q.off ? 'noop' : q.act}"><span class="tf" aria-hidden="true">${q.icon}</span><span>${t(q.title)}${q.sub ? html`<small>${t(q.sub)}</small>` : ''}</span>${q.key ? html`<span class="k">${q.key}</span>` : ''}</button>`,
  )}</div>`;
}

export const footer = (): SafeHtml => html`<div class="pf"><button class="btn grow" style="width:100%" data-act="open-main">${t('Open Side')}</button></div>`;

export function panel(inner: SafeHtml | SafeHtml[]): SafeHtml {
  return html`<div class="panel" role="dialog" aria-label="Side">${inner}</div>`;
}

/** "31 in 3 groups" for the live set-aside, or "0". */
export function setAsideText(s: ViewState): string {
  const w = s.lastWrapup;
  if (!w || (w.status !== 'applied' && w.status !== 'partial')) return '0';
  const tabs = w.groups.reduce((n, g) => n + g.count, 0);
  return t('{tabs} in {groups}', { tabs, groups: tn(w.groups.length, '{n} group', '{n} groups') });
}
