// Main · History. One line per day Side was used; each opens its own detail. Days off are not
// listed or counted.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { splitStepLabel } from './format';
import { t, tn } from '../../i18n';

type Day = ViewState['history'][number];

function summary(d: Day): string {
  const groups = tn(d.groups.length, '{n} group', '{n} groups');
  if (d.status === 'undone') return tn(d.tabs, 'Set aside {n} tab, then brought them back', 'Set aside {n} tabs, then brought them back');
  if (d.status === 'failed' || d.status === 'unconfirmed' || d.status === 'saved' || d.status === 'checking') {
    return tn(d.tabs, "Saved {n} tab · Chrome didn't confirm", "Saved {n} tabs · Chrome didn't confirm");
  }
  return tn(d.tabs, 'Set aside {n} tab · {groups}', 'Set aside {n} tabs · {groups}', { groups });
}

function detail(d: Day): SafeHtml {
  const st = d.step;
  const stepped = !st ? '—' : st.clicked ? (st.secondsToWork !== null ? t('Yes · page ready in {s} s', { s: st.secondsToWork.toFixed(1) }) : t('Yes')) : t('No');
  const kept = !st || st.stillWorking === null ? '—' : st.stillWorking ? t('Yes') : t('No');
  return html`<div class="d">
<span>${t('Groups')}</span>${d.groups.join(', ') || '—'}
<span>${t('You asked')}</span>${d.userLine ?? t('(skipped)')}
<span>${t('Next step')}</span>${st ? splitStepLabel(st.label).title : '—'}
<span>${t('Stepped inside')}</span>${stepped}
<span>${t('Kept going 10 min')}</span>${kept}</div>`;
}

/** open: the days the user has opened or closed; null = only the newest day open (first look). */
export function historyView(s: ViewState, open: ReadonlySet<string> | null = null): SafeHtml {
  if (!s.history.length) {
    return html`<h1>${t('History')}</h1><p class="lead">${t('One line per day you used Side.')}</p>
<div class="hero"><div><div class="t" style="font-size:20px">${t('No days yet. Your first wrap-up shows up here.')}</div></div>
<button type="button" class="btn fill" data-act="wrap">${t('Set aside today')}</button></div>`;
  }
  return html`<h1>${t('History')}</h1><p class="lead">${t('One line per day you used Side. Days off are simply not here.')}</p>
<div class="hist">${s.history.map(
    (d, i) => html`<details data-day="${d.id}"${(open ? open.has(d.id) : i === 0) ? html` open` : ''}><summary>${d.when}<b>${summary(d)}</b></summary>${detail(d)}</details>`,
  )}</div>`;
}
