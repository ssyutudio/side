// The Main window frame: sidebar with five sections and a truthful connection chip.
import type { ViewState } from '../../main/viewState';
import { html, raw, type SafeHtml } from '../shared/html';

export type Section = 'today' | 'history' | 'excluded' | 'saw' | 'settings';
export const SECTIONS: Section[] = ['today', 'history', 'excluded', 'saw', 'settings'];

const NAV: [Section, string, string][] = [
  ['today', '☀️', 'Today'],
  ['history', '📖', 'History'],
  ['excluded', '🚫', 'Excluded sites'],
  ['saw', '👀', 'What Side saw'],
  ['settings', '⚙️', 'Settings'],
];

export function connectionChip(c: ViewState['connection'] | null): SafeHtml {
  if (c === 'connected') return html`<span class="chip ok">Chrome connected</span>`;
  if (c === 'waiting') return html`<span class="chip wait">Waiting for Chrome</span>`;
  return html`<span class="chip warn">Chrome not connected</span>`;
}

export function shellView(section: Section, state: ViewState | null, body: SafeHtml | string): SafeHtml {
  const content = typeof body === 'string' ? raw(body) : body;
  return html`<div class="app">
<nav class="nav" aria-label="Side">${NAV.map(
    ([k, icon, label]) =>
      html`<button type="button" data-act="nav" data-section="${k}"${k === section ? html` aria-current="page"` : ''}><span class="tf" aria-hidden="true">${icon}</span>${label}</button>`,
  )}<div class="foot">${connectionChip(state?.connection ?? null)}</div></nav>
<main class="content" id="content">${content}</main></div>`;
}

export function loadingView(): SafeHtml {
  return html`<h1>Today</h1><div class="busy" role="status" aria-live="polite" style="margin-top:24px"><span class="spin"></span>Loading your history…</div>`;
}

export function errorView(): SafeHtml {
  return html`<h1>Today</h1>
<div class="alert" role="alert" style="max-width:640px;margin-top:20px"><b>Couldn't load your history.</b>Side couldn't read its data file on this computer. Your tabs in Chrome are untouched. Try again; if it keeps failing, the file may have been moved.</div>
<div class="row" style="margin-top:14px"><button type="button" class="btn fill" data-act="retry">Try again</button><button type="button" class="btn" data-act="reveal">Show data file</button></div>`;
}
