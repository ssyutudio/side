// Main · Settings · Connections (approved mockup m1-conn / m1-conn-apps). For this build: Chrome and
// desktop apps (Word, Excel, PowerPoint, Photoshop … as found on this computer), one switch each,
// all off by default. Nothing is read in an app until it is turned on.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { t } from '../../i18n';

const chip = (ok: boolean) => (ok ? html`<span class="chip ok">${t('Connected')}</span>` : html`<span class="chip warn">${t('Not connected')}</span>`);
/** Off by choice is not a warning: a grey chip. Amber stays for something that went wrong. */
const offChip = () => html`<span class="chip wait">${t('Off')}</span>`;
/** Re-checks the apps and the calendar (not Chrome). */
const recheck = () => html`<button type="button" class="btn sm" data-act="conn-refresh">${t('Check again')}</button>`;

function chromeRow(c: ViewState['connection']): SafeHtml {
  const ok = c === 'connected';
  const text = ok
    ? t('Side extension is on.')
    : c === 'waiting'
      ? t('Waiting for the Side extension. Load it in chrome://extensions, then check again.')
      : t('Make sure the Side extension is switched on in chrome://extensions.');
  return html`<div class="r cn"><div class="hd"><b>Chrome</b>${chip(ok)}</div><p>${text}</p><span class="ctl row"><button type="button" class="btn sm" data-act="check">${t('Check again')}</button>${ok ? '' : html`<button type="button" class="btn sm" data-act="pair-reset">${t('Pair a different extension')}</button>`}</span></div>`;
}

function appsBlock(apps: NonNullable<ViewState['connections']>['apps']): SafeHtml {
  return html`<div class="apps"><div class="al">${t('Found on this computer')}</div>
${apps.length
  ? apps.map(
      (a) => html`<button type="button" class="tg row-tg" role="switch" aria-checked="${a.on ? 'true' : 'false'}" data-act="app-toggle" data-app="${a.id}" data-on="${a.on ? '1' : '0'}"><span class="nm">${a.tool} · <span class="st">${a.on ? t('On') : t('Off')}</span></span><span class="sw" aria-hidden="true"></span></button>`,
    )
  : html`<p class="note" style="margin:8px 0">${t('No app Side can open files in was found. Check again after installing one.')}</p>`}
<p class="note" style="margin:10px 0 4px">${t("sidy reads only file names and when you last used them, never what's inside. With AI drafting on, file names (no folders) go to Claude to pick your next step.")}</p></div>`;
}

/** Calendar (approved mockups m1-conn-cal, -checking, -denied): off by default, macOS asks once. */
function calendarRow(c: NonNullable<NonNullable<ViewState['connections']>['calendar']>): SafeHtml {
  const tg = (on: boolean) =>
    html`<button type="button" class="tg" role="switch" aria-checked="${on ? 'true' : 'false'}" aria-label="${t('Calendar')}" data-act="cal-toggle" data-on="${on ? '1' : '0'}"><span class="sw" aria-hidden="true"></span></button>`;
  const row = (state: string, chipHtml: SafeHtml, line: string, ctl: SafeHtml) =>
    html`<div class="r cn"><div class="hd"><b>${t('Calendar')}${state ? html`<span class="state"> · ${state}</span>` : ''}</b>${chipHtml}</div><p>${line}</p><span class="ctl row">${ctl}</span></div>`;
  if (c.status === 'checking') return row(t('On'), html`<span class="chip wait chk"><span class="spin" style="width:12px;height:12px;border-width:2px"></span>${t('Checking')}</span>`, t('Waiting for macOS to ask you.'), tg(true));
  if (c.on) return row(t('On'), chip(true), t("Reads tomorrow's first event time and how many are left today. Never reads titles, places or attendees."), tg(true));
  if (c.status === 'no_answer')
    return row(
      t('Off'),
      chip(false),
      t("macOS didn't ask. Allow Side, or the app you started it from, in System Settings > Privacy & Security > Calendars, then turn it on again."),
      html`${recheck()}${tg(false)}`,
    );
  if (c.status === 'denied' || c.status === 'restricted')
    return row(t('Off'), chip(false), t('macOS said no. Allow Side in System Settings > Privacy & Security > Calendars.'), html`${recheck()}${tg(false)}`);
  // The grey Off chip already says it; no second "Off" in the title.
  return row('', offChip(), t('Turn it on so sidy knows when tomorrow starts. Never reads titles, places or attendees.'), tg(false));
}

export function connectionsView(s: ViewState, open: boolean): SafeHtml {
  const apps = s.connections?.apps ?? [];
  const anyOn = apps.some((a) => a.on);
  const desktop = html`<div class="r cn"><div class="hd"><b>${t('Desktop apps')}</b>${anyOn ? chip(true) : offChip()}</div><p>${
    anyOn ? t('On: {apps}.', { apps: apps.filter((a) => a.on).map((a) => a.tool).join(', ') }) : t('Turn on the apps sidy may open a file in.')
  }</p><span class="ctl row"><button type="button" class="btn sm" data-act="apps-show" aria-expanded="${open ? 'true' : 'false'}">${open ? t('Hide apps') : t('Show apps')}</button></span>${open ? appsBlock(apps) : ''}</div>`;
  return html`<h2 class="set-h">${t('Connections')}</h2><p class="note" style="margin:2px 0 0">${t('Where sidy can open your next step. Nothing is read until you connect it.')}</p>
<div class="set">${chromeRow(s.connection)}${desktop}${s.connections?.calendar ? calendarRow(s.connections.calendar) : ''}</div>`;
}
