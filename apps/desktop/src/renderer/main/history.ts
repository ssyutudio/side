// Main · History. One line per day Side was used; each opens its own detail. Days off are not
// listed or counted.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { plural, splitStepLabel } from './format';

type Day = ViewState['history'][number];

function summary(d: Day): string {
  const groups = plural(d.groups.length, 'group');
  if (d.status === 'undone') return `Set aside ${plural(d.tabs, 'tab')}, then brought them back`;
  if (d.status === 'failed' || d.status === 'unconfirmed' || d.status === 'saved' || d.status === 'checking') {
    return `Saved ${plural(d.tabs, 'tab')} · Chrome didn't confirm`;
  }
  return `Set aside ${plural(d.tabs, 'tab')} · ${groups}`;
}

function detail(d: Day): SafeHtml {
  const st = d.step;
  const stepped = !st ? '—' : st.clicked ? (st.secondsToWork !== null ? `Yes · page ready in ${st.secondsToWork.toFixed(1)} s` : 'Yes') : 'No';
  const kept = !st || st.stillWorking === null ? '—' : st.stillWorking ? 'Yes' : 'No';
  return html`<div class="d">
<span>Groups</span>${d.groups.join(', ') || '—'}
<span>You asked</span>${d.userLine ?? '(skipped)'}
<span>Next step</span>${st ? splitStepLabel(st.label).title : '—'}
<span>Stepped inside</span>${stepped}
<span>Kept going 10 min</span>${kept}</div>`;
}

export function historyView(s: ViewState): SafeHtml {
  if (!s.history.length) {
    return html`<h1>History</h1><p class="lead">One line per day you used Side.</p>
<div class="hero"><div><div class="t" style="font-size:20px">No days yet. Your first wrap-up shows up here.</div></div>
<button type="button" class="btn fill" data-act="wrap">Set aside today</button></div>`;
  }
  return html`<h1>History</h1><p class="lead">One line per day you used Side. Days off are simply not here.</p>
<div class="hist">${s.history.map(
    (d, i) => html`<details${i === 0 ? html` open` : ''}><summary>${d.when}<b>${summary(d)}</b></summary>${detail(d)}</details>`,
  )}</div>`;
}
