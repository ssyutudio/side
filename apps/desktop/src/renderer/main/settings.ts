// Main · Settings. Every change applies at once (the app pushes the new state back).
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { minutesToClock, shortcutKeys } from './format';
import { connectionsView } from './connections';
import { k, t } from '../../i18n';
import { KOREAN_NAME } from '../../i18n/ko';

/** Each language is named in itself, so it can be found whatever the screen says now. */
function languageRow(current: 'en' | 'ko'): SafeHtml {
  const choices: ['en' | 'ko', string][] = [['en', 'English'], ['ko', KOREAN_NAME]];
  return html`<div class="r"><b>${t('Language')}</b><p>${t('Words on every Side screen, and the language Claude answers in.')}</p><span class="ctl seg" role="group" aria-label="${t('Language')}">${choices.map(
    ([code, name]) => html`<button type="button" class="seg-big" data-act="lang" data-lang="${code}" lang="${code}" aria-pressed="${code === current ? 'true' : 'false'}">${name}</button>`,
  )}</span></div>`;
}

/** A time picker with clock labels in the screen's language, in 30-minute steps (the system time input follows the OS language). */
function timeSelect(act: string, label: string, value: number): SafeHtml {
  const steps = Array.from({ length: 48 }, (_, i) => i * 30);
  if (!steps.includes(value)) steps.push(value);
  steps.sort((a, b) => a - b);
  return html`<select class="time" data-act="${act}" aria-label="${label}">${steps.map(
    (m) => html`<option value="${m}"${m === value ? html` selected` : ''}>${minutesToClock(m)}</option>`,
  )}</select>`;
}

const SIZES: [ViewState['settings']['sidySize'], string][] = [
  ['small', k('Small')],
  ['medium', k('Medium')],
  ['large', k('Large')],
];

function sw(key: 'llmEnabled' | 'uploadEnabled' | 'reactions', on: boolean, label: string): SafeHtml {
  return html`<button type="button" class="sw" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${label}" data-act="toggle" data-key="${key}"></button>`;
}

export function settingsView(s: ViewState, opts: { appsOpen: boolean } = { appsOpen: false }): SafeHtml {
  const st = s.settings;
  // On/off is a switch like every other row; the times show only while it is on.
  const quietSwitch = html`<button type="button" class="sw" role="switch" aria-checked="${st.quietHours ? 'true' : 'false'}" aria-label="${t('Quiet hours')}" data-act="quiet-toggle"></button>`;
  const quiet = st.quietHours
    ? html`<span class="ctl row" style="align-items:center">${timeSelect('quiet-start', t('Quiet hours start'), st.quietHours.start)}<span>${t('to')}</span>${timeSelect('quiet-end', t('Quiet hours end'), st.quietHours.end)}${quietSwitch}</span>`
    : html`<span class="ctl">${quietSwitch}</span>`;
  return html`<h1>${t('Settings')}</h1><p class="lead">${t('Changes apply right away.')}</p><div class="set">
${languageRow(st.language === 'ko' ? 'ko' : 'en')}
<div class="r"><b>${t('sidy size')}</b><p>${t('Small fits the edge best. You can see it change on the right.')}</p><span class="ctl seg" role="group" aria-label="${t('sidy size')}">${SIZES.map(
    ([size, label]) => html`<button type="button" class="seg-big" data-act="size" data-size="${size}" aria-pressed="${size === st.sidySize ? 'true' : 'false'}">${t(label)}</button>`,
  )}</span></div>
<div class="r"><b>${t('Show or hide sidy')}</b><p>${t('Works from any app. Clicking Side in the Dock also brings sidy back.')}</p><span class="ctl"><kbd aria-label="${st.shortcut.replace(/\bAlt\b/, 'Option')}" title="${st.shortcut.replace(/\bAlt\b/, 'Option')}">${shortcutKeys(st.shortcut)}</kbd></span></div>
<div class="r"><b>${t('Quiet hours')}</b><p>${t("sidy won't start talking in this window. A check-in you asked for still comes, once.")}</p>${quiet}</div>
<div class="r"><b>${t('Wake-up time')}</b><p>${t('One more hour uses it to say how long you would sleep if you stopped now.')}</p><span class="ctl">${timeSelect('wake', t('Wake-up time'), st.wakeMinutes)}</span></div>
<div class="r"><b>${t('Little reactions')}</b><p>${t('sidy stretches when you unlock, whistles when a video starts, nods to music — once, then still. Off with Reduce Motion too.')}</p><span class="ctl">${sw('reactions', st.reactions !== false, t('Little reactions'))}</span></div>
${s.saw.llm.available ? html`<div class="r"><b>${t('AI drafting')}</b><p>${t('On: sends tab titles, your one line for tomorrow, your step counts, file names (no folders) from the desktop apps you turn on, and what you type in Ask sidy to Claude (Anthropic) to name groups, suggest a question, pick your next step and pick one action. Never addresses, page text, file contents or excluded sites. Off: sidy uses simple rules.')}</p><span class="ctl">${sw('llmEnabled', st.llmEnabled, t('AI drafting'))}</span></div>` : noKeyRow()}
<div class="r"><b>${t('Share anonymous counts')}</b><p>${t('Numbers only — tabs set aside, steps shown and opened. No titles, sites or words.')}</p><span class="ctl">${sw('uploadEnabled', st.uploadEnabled, t('Share anonymous counts'))}</span></div>
</div>
${connectionsView(s, opts.appsOpen)}
${s.demoTools ? demoClock(s) : ''}`;
}

/** Without a Claude key nothing can be sent: the switch can't be turned on, and it says why. */
function noKeyRow(): SafeHtml {
  return html`<div class="r"><b>${t('AI drafting')}</b><p>${t('No Claude key on this computer, so nothing is sent and sidy uses simple rules here. To use Claude, put your key in .env.local (see the README) and start Side again.')}</p><span class="ctl"><button type="button" class="sw" role="switch" aria-checked="false" aria-disabled="true" disabled aria-label="${t('AI drafting')}"></button></span></div>`;
}

/** Only for recording a demo (SIDE_DEMO), or while demo time is on so it can be turned off. */
function demoClock(s: ViewState): SafeHtml {
  return html`<h2 class="set-h">${t('Demo clock')}</h2><p class="note" style="margin:2px 0 0">${t("For recording a demo. Moves only Side's own clock, never your computer's.")}</p>
<div class="set"><div class="r"><b>${t("Side's clock")}</b><p>${s.demoOffsetMs ? t('Demo time is on.') : t('Real time.')}</p><span class="ctl row">${DEMO.map(
    ([cmd, label]) => html`<button type="button" class="btn sm" data-act="demo" data-cmd="${cmd}">${t(label)}</button>`,
  )}</span></div></div>`;
}

const DEMO: [string, string][] = [
  ['night', k('Tonight')],
  ['plus-30', k('+30 min')],
  ['next-day', k('Next evening')],
  ['three-days', k('3 days later')],
  ['reset', k('Real time')],
];
