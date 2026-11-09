// Main · Settings · Connections (approved mockup m1-conn / m1-conn-apps). For this build: Chrome and
// desktop apps (Word, Excel, PowerPoint, Photoshop … as found on this computer), one switch each,
// all off by default. Nothing is read in an app until it is turned on.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';

const chip = (ok: boolean) => (ok ? html`<span class="chip ok">Connected</span>` : html`<span class="chip warn">Not connected</span>`);

function chromeRow(c: ViewState['connection']): SafeHtml {
  const ok = c === 'connected';
  const text = ok
    ? 'Side extension is on.'
    : c === 'waiting'
      ? 'Waiting for the Side extension. Load it in chrome://extensions, then check again.'
      : 'Make sure the Side extension is switched on in chrome://extensions.';
  return html`<div class="r cn"><div class="hd"><b>Chrome</b>${chip(ok)}</div><p>${text}</p><span class="ctl row"><button type="button" class="btn sm" data-act="check">Check again</button></span></div>`;
}

function appsBlock(apps: NonNullable<ViewState['connections']>['apps']): SafeHtml {
  return html`<div class="apps"><div class="al">Found on this computer</div>
${apps.length
  ? apps.map(
      (a) => html`<button type="button" class="tg row-tg" role="switch" aria-checked="${a.on ? 'true' : 'false'}" data-act="app-toggle" data-app="${a.id}" data-on="${a.on ? '1' : '0'}"><span class="nm">${a.tool} · <span class="st">${a.on ? 'On' : 'Off'}</span></span><span class="sw" aria-hidden="true"></span></button>`,
    )
  : html`<p class="note" style="margin:8px 0">No app Side can open files in was found. Check again after installing one.</p>`}
<p class="note" style="margin:10px 0 4px">sidy reads only file names and when you last used them, never what's inside. With AI drafting on, file names (no folders) go to Claude to pick your next step.</p></div>`;
}

export function connectionsView(s: ViewState, open: boolean): SafeHtml {
  const apps = s.connections?.apps ?? [];
  const anyOn = apps.some((a) => a.on);
  const desktop = html`<div class="r cn"><div class="hd"><b>Desktop apps</b>${chip(anyOn)}</div><p>${
    anyOn ? `On: ${apps.filter((a) => a.on).map((a) => a.tool).join(', ')}.` : 'Turn on the apps sidy may open a file in.'
  }</p><span class="ctl row"><button type="button" class="btn sm" data-act="apps-show" aria-expanded="${open ? 'true' : 'false'}">${open ? 'Hide apps' : 'Show apps'}</button></span>${open ? appsBlock(apps) : ''}</div>`;
  return html`<h2 class="set-h">Connections</h2><p class="note" style="margin:2px 0 0">Where sidy can open your next step. Nothing is read until you connect it.</p>
<div class="set">${chromeRow(s.connection)}${desktop}</div>`;
}
