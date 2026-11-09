// Main · Settings. Every change applies at once (the app pushes the new state back).
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { minutesToClock, shortcutKeys } from './format';
import { connectionsView } from './connections';

/** A time picker with English clock labels in 30-minute steps (the system time input follows the OS language). */
function timeSelect(act: string, label: string, value: number): SafeHtml {
  const steps = Array.from({ length: 48 }, (_, i) => i * 30);
  if (!steps.includes(value)) steps.push(value);
  steps.sort((a, b) => a - b);
  return html`<select class="time" data-act="${act}" aria-label="${label}">${steps.map(
    (m) => html`<option value="${m}"${m === value ? html` selected` : ''}>${minutesToClock(m)}</option>`,
  )}</select>`;
}

const SIZES: [ViewState['settings']['sidySize'], string][] = [
  ['small', 'Small'],
  ['medium', 'Medium'],
  ['large', 'Large'],
];

function sw(key: 'llmEnabled' | 'uploadEnabled' | 'reactions', on: boolean, label: string): SafeHtml {
  return html`<button type="button" class="sw" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${label}" data-act="toggle" data-key="${key}"></button>`;
}

export function settingsView(s: ViewState, opts: { appsOpen: boolean } = { appsOpen: false }): SafeHtml {
  const st = s.settings;
  const quiet = st.quietHours
    ? html`<span class="ctl row" style="align-items:center">${timeSelect('quiet-start', 'Quiet hours start', st.quietHours.start)}<span>to</span>${timeSelect('quiet-end', 'Quiet hours end', st.quietHours.end)}<button type="button" class="btn sm" data-act="quiet-off">Turn off</button></span>`
    : html`<span class="ctl"><button type="button" class="btn sm" data-act="quiet-on">Off · Set quiet hours</button></span>`;
  return html`<h1>Settings</h1><p class="lead">Changes apply right away.</p><div class="set">
<div class="r"><b>sidy size</b><p>Small fits the edge best. You can see it change on the right.</p><span class="ctl seg" role="group" aria-label="sidy size">${SIZES.map(
    ([k, t]) => html`<button type="button" class="seg-big" data-act="size" data-size="${k}" aria-pressed="${k === st.sidySize ? 'true' : 'false'}">${t}</button>`,
  )}</span></div>
<div class="r"><b>Show or hide sidy</b><p>Works from any app. Clicking Side in the Dock also brings sidy back.</p><span class="ctl"><kbd>${shortcutKeys(st.shortcut)}</kbd></span></div>
<div class="r"><b>Quiet hours</b><p>sidy won't start talking in this window. A check-in you asked for still comes, once.</p>${quiet}</div>
<div class="r"><b>Wake-up time</b><p>Used for one fact when you choose One more hour.</p><span class="ctl">${timeSelect('wake', 'Wake-up time', st.wakeMinutes)}</span></div>
<div class="r"><b>Little reactions</b><p>sidy stretches when you unlock, whistles when a video starts, nods to music — once, then still. Off with Reduce Motion too.</p><span class="ctl">${sw('reactions', st.reactions !== false, 'Little reactions')}</span></div>
<div class="r"><b>AI drafting</b><p>On: sends tab titles, your one line for tomorrow and your step counts to Claude (Anthropic) to name groups, suggest a question and pick your next step. Never addresses, page text or excluded sites. Off: sidy uses simple rules.</p><span class="ctl">${sw('llmEnabled', st.llmEnabled, 'AI drafting')}</span></div>
<div class="r"><b>Share anonymous counts</b><p>Numbers only — tabs set aside, steps shown and opened. No titles, sites or words.</p><span class="ctl">${sw('uploadEnabled', st.uploadEnabled, 'Share anonymous counts')}</span></div>
</div>
${connectionsView(s, opts.appsOpen)}
<h2 class="set-h">Demo clock</h2><p class="note" style="margin:2px 0 0">For recording a demo. Moves only Side's own clock, never your computer's.</p>
<div class="set"><div class="r"><b>Side's clock</b><p>${s.demoOffsetMs ? 'Demo time is on.' : 'Real time.'}</p><span class="ctl row">${DEMO.map(
    ([cmd, label]) => html`<button type="button" class="btn sm" data-act="demo" data-cmd="${cmd}">${label}</button>`,
  )}</span></div></div>`;
}

const DEMO: [string, string][] = [
  ['night', 'Tonight'],
  ['plus-30', '+30 min'],
  ['next-day', 'Next evening'],
  ['three-days', '3 days later'],
  ['reset', 'Real time'],
];
