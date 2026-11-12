// Main · What Side saw. What Side read from Chrome, what it skipped (counts only), and exactly
// what left this computer.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { t, tn } from '../../i18n';

export interface SawLocal {
  showAll: boolean;
}

const FIRST = 10;

function skippedLines(s: ViewState): string[] {
  const sk = s.saw.skipped;
  const lines = Object.entries(sk.excludedByDomain)
    .filter(([, n]) => n > 0)
    .map(([d, n]) => tn(n, '{n} tab from {d} — excluded site, not read.', '{n} tabs from {d} — excluded site, not read.', { d }));
  if (sk.incognito > 0) lines.push(tn(sk.incognito, '{n} incognito tab — not read.', '{n} incognito tabs — not read.'));
  if (sk.internal > 0) lines.push(tn(sk.internal, '{n} browser page (like chrome://) — not read.', '{n} browser pages (like chrome://) — not read.'));
  return lines;
}

/** Everything that left this computer, by kind (counts only), or why nothing did. */
function sentBlock(s: ViewState): SafeHtml {
  const { llm, uploadEnabled } = s.saw;
  const counts = t('Anonymous counts: {state}.', { state: uploadEnabled ? t('on (numbers only)') : t('off') });
  const settings = html`<button type="button" class="link" data-act="nav" data-section="settings">${t('Settings')}</button>`;
  if (!llm.available) return html`<p class="quiet">${t('Nothing to Claude. There is no Claude key on this computer, so sidy names groups with simple rules here.')} ${counts} ${settings}</p>`;
  if (!llm.enabled) return html`<p class="quiet">${t('Nothing to Claude. AI drafting is off, so sidy names groups with simple rules on this computer.')} ${counts} ${settings}</p>`;
  if (!llm.sends) {
    return html`<p class="quiet">${t('Nothing yet. When you set today aside, tab titles go to Claude (Anthropic) to name groups; your one line and your step counts (numbers only) help pick the next step — no addresses, no page text, nothing from excluded sites.')} ${counts} ${settings}</p>`;
  }
  const x = llm.sent;
  const lines: string[] = [];
  if (x.groupTitles) lines.push(t('{titles}, to name groups.', { titles: tn(x.groupTitles, '{n} tab title', '{n} tab titles') }));
  if (x.groupNames) lines.push(t('Your group names, to suggest a question for tomorrow.'));
  if (x.stepPick) lines.push(x.stepFiles ? t('Tab titles, file names (no folders) and your one line, to pick your next step.') : t('Tab titles and your one line, to pick your next step.'));
  if (x.stepCounts) lines.push(t('Your step counts (numbers only), for the By your side sentence.'));
  if (x.askLine) lines.push(t('The lines you typed in Ask sidy, to pick one action.'));
  return html`<div class="quiet">${t('To Claude (Anthropic):')}<ul>${lines.map((l) => html`<li>${l}</li>`)}</ul>
<p style="margin:8px 0 0">${t('Never addresses, page text, file contents or excluded sites.')} ${counts} ${settings}</p></div>`;
}

export function sawView(s: ViewState, local: SawLocal): SafeHtml {
  const { saw } = s;
  if (saw.readTabs === 0) {
    const lead = s.connection === 'connected' ? t('Nothing read yet.') : t("Chrome isn't connected, so Side isn't reading anything right now.");
    return html`<h1>${t('What Side saw')}</h1><p class="lead">${lead}</p>
<div class="hero"><div><div class="t" style="font-size:20px">${t("After your first wrap-up you'll see every tab Side read and skipped.")}</div><div class="w">${t('And exactly what was sent to Claude — titles, your one line and step counts, never addresses or page text.')}</div></div>
<button type="button" class="btn fill" data-act="wrap">${t('Set aside today')}</button></div>`;
  }
  const skipped = saw.skipped.excluded + saw.skipped.incognito + saw.skipped.internal;
  const sent = saw.llm.enabled && saw.llm.available ? saw.llm.lastTitles ?? 0 : 0;
  const rows = local.showAll ? saw.tabs : saw.tabs.slice(0, FIRST);
  const skippedText = skippedLines(s);
  const lead = saw.source === 'last_wrapup' ? t('From your last wrap-up, {when}.', { when: saw.when ?? '' }) : t('What Side read from Chrome just now.');
  return html`<h1>${t('What Side saw')}</h1><p class="lead">${lead}</p>
<div class="counts" style="margin-top:0"><span><b>${saw.readTabs}</b>${t('tabs read')}</span><span><b>${skipped}</b>${t('skipped')}</span><span><b>${sent}</b>${t('titles sent to Claude')}</span></div>
<section class="sec"><h2>${t('Read')}</h2><p class="note" style="margin:-4px 0 10px">${t('Title, site and where you stopped on the page. Page text is never sent.')}</p>
<table class="tbl saw"><thead><tr><th>${t('Tab')}</th><th>${t('Site')}</th><th>${t('Where you stopped')}</th></tr></thead><tbody>${rows.map(
    (tab) => html`<tr><td>${tab.title}</td><td>${tab.host ?? '—'}</td><td>${tab.where}</td></tr>`,
  )}</tbody></table>
${saw.tabs.length > FIRST ? html`<button type="button" class="link" style="margin-top:10px" data-act="saw-all">${local.showAll ? t('Show fewer') : t('Show all {n}', { n: saw.tabs.length })}</button>` : ''}</section>
<section class="sec"><h2>${t('Skipped')}</h2><div class="quiet">${skippedText.length ? html`<ul style="margin:0;padding-left:18px">${skippedText.map((l) => html`<li>${l}</li>`)}</ul>` : t('Nothing skipped.')}</div></section>
<section class="sec"><h2>${t('Sent off this computer')}</h2>${sentBlock(s)}</section>`;
}
