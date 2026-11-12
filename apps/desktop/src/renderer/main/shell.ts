// The Main window frame: sidebar with five sections and a truthful connection chip.
import type { ViewState } from '../../main/viewState';
import { html, raw, type SafeHtml } from '../shared/html';
import { k, t } from '../../i18n';

export type Section = 'today' | 'history' | 'excluded' | 'saw' | 'settings';
export const SECTIONS: Section[] = ['today', 'history', 'excluded', 'saw', 'settings'];

const NAV: [Section, string, string][] = [
  ['today', '☀️', k('Today')],
  ['history', '📖', k('History')],
  ['excluded', '🚫', k('Excluded sites')],
  ['saw', '👀', k('What Side saw')],
  ['settings', '⚙️', k('Settings')],
];

export function connectionChip(c: ViewState['connection'] | null): SafeHtml {
  if (c === 'connected') return html`<span class="chip ok">${t('Chrome connected')}</span>`;
  if (c === 'waiting') return html`<span class="chip wait">${t('Waiting for Chrome')}</span>`;
  return html`<span class="chip warn">${t('Chrome not connected')}</span>`;
}

export function shellView(section: Section, state: ViewState | null, body: SafeHtml | string): SafeHtml {
  const content = typeof body === 'string' ? raw(body) : body;
  return html`<div class="app">
<nav class="nav" aria-label="Side">${NAV.map(
    ([id, icon, label]) =>
      html`<button type="button" data-act="nav" data-section="${id}"${id === section ? html` aria-current="page"` : ''}><span class="tf" aria-hidden="true">${icon}</span>${t(label)}</button>`,
  )}<div class="foot">${connectionChip(state?.connection ?? null)}</div></nav>
<main class="content" id="content">${content}</main></div>`;
}

export function loadingView(): SafeHtml {
  return html`<h1>${t('Today')}</h1><div class="busy" role="status" aria-live="polite" style="margin-top:24px"><span class="spin"></span>${t('Loading your history…')}</div>`;
}

export function errorView(): SafeHtml {
  return html`<h1>${t('Today')}</h1>
<div class="alert" role="alert" style="max-width:640px;margin-top:20px"><b>${t("Couldn't load your history.")}</b>${t("Side couldn't read its data file on this computer. Your tabs in Chrome are untouched. Try again; if it keeps failing, the file may have been moved.")}</div>
<div class="row" style="margin-top:14px"><button type="button" class="btn fill" data-act="retry">${t('Try again')}</button><button type="button" class="btn" data-act="reveal">${t('Show data file')}</button></div>`;
}
