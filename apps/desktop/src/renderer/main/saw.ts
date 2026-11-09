// Main · What Side saw. What Side read from Chrome, what it skipped (counts only), and exactly
// what left this computer.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { plural } from './format';

export interface SawLocal {
  showAll: boolean;
}

const FIRST = 10;

function skippedLines(s: ViewState): string[] {
  const k = s.saw.skipped;
  const lines = Object.entries(k.excludedByDomain)
    .filter(([, n]) => n > 0)
    .map(([d, n]) => `${plural(n, 'tab')} from ${d} — excluded site, not read.`);
  if (k.incognito > 0) lines.push(`${plural(k.incognito, 'incognito tab')} — not read.`);
  if (k.internal > 0) lines.push(`${plural(k.internal, 'browser page')} (like chrome://) — not read.`);
  return lines;
}

function sentSentence(s: ViewState): string {
  const { llm, uploadEnabled } = s.saw;
  const counts = ` Anonymous counts: ${uploadEnabled ? 'on (numbers only)' : 'off'}.`;
  if (!llm.enabled) return `Nothing to Claude. AI drafting is off, so sidy names groups with simple rules on this computer.${counts}`;
  if (!llm.lastTitles) {
    return `Nothing yet. When you set today aside, tab titles go to Claude (Anthropic) to name groups; your one line and your step counts (numbers only) help pick the next step — no addresses, no page text, nothing from excluded sites.${counts}`;
  }
  return `${plural(llm.lastTitles, 'tab title')}${llm.lastUserLine ? ' and your one line' : ''}, to Claude (Anthropic), to name groups and pick your next step, plus your step counts (numbers only). No addresses, no page text, nothing from excluded sites.${counts}`;
}

export function sawView(s: ViewState, local: SawLocal): SafeHtml {
  const { saw } = s;
  if (saw.readTabs === 0) {
    const lead = s.connection === 'connected' ? 'Nothing read yet.' : "Chrome isn't connected, so Side isn't reading anything right now.";
    return html`<h1>What Side saw</h1><p class="lead">${lead}</p>
<div class="hero"><div><div class="t" style="font-size:20px">After your first wrap-up you'll see every tab Side read and skipped.</div><div class="w">And exactly what was sent to Claude — titles, your one line and step counts, never addresses or page text.</div></div>
<button type="button" class="btn fill" data-act="wrap">Set aside today</button></div>`;
  }
  const skipped = saw.skipped.excluded + saw.skipped.incognito + saw.skipped.internal;
  const sent = saw.llm.enabled ? saw.llm.lastTitles ?? 0 : 0;
  const rows = local.showAll ? saw.tabs : saw.tabs.slice(0, FIRST);
  const skippedText = skippedLines(s);
  const lead = saw.source === 'last_wrapup' ? `From your last wrap-up, ${saw.when}.` : 'What Side read from Chrome just now.';
  return html`<h1>What Side saw</h1><p class="lead">${lead}</p>
<div class="counts" style="margin-top:0"><span><b>${saw.readTabs}</b>tabs read</span><span><b>${skipped}</b>skipped</span><span><b>${sent}</b>titles sent to Claude</span></div>
<section class="sec"><h2>Read</h2><p class="note" style="margin:-4px 0 10px">Title, site and where you stopped on the page. Page text is never sent.</p>
<table class="tbl saw"><thead><tr><th>Tab</th><th>Site</th><th>Where you stopped</th></tr></thead><tbody>${rows.map(
    (t) => html`<tr><td>${t.title}</td><td>${t.host ?? '—'}</td><td>${t.where}</td></tr>`,
  )}</tbody></table>
${saw.tabs.length > FIRST ? html`<button type="button" class="link" style="margin-top:10px" data-act="saw-all">${local.showAll ? 'Show fewer' : `Show all ${saw.tabs.length}`}</button>` : ''}</section>
<section class="sec"><h2>Skipped</h2><div class="quiet">${skippedText.length ? html`<ul style="margin:0;padding-left:18px">${skippedText.map((l) => html`<li>${l}</li>`)}</ul>` : 'Nothing skipped.'}</div></section>
<section class="sec"><h2>Sent off this computer</h2><p class="quiet">${sentSentence(s)} <button type="button" class="link" data-act="nav" data-section="settings">Settings</button></p></section>`;
}
