// Main · Today. The next step is the hero; numbers sit under it in small type; then one
// "By your side" sentence from the user's own counts, today's moments, and why sidy stayed quiet.
import type { QuietReason } from '@side/shared';
import type { ViewState } from '../../main/viewState';
import { html, raw, type SafeHtml } from '../shared/html';
import { sidySvg } from '../shared/sidy';
import { QUIET_TEXT, clock, longDate, plural, splitStepLabel } from './format';

const LEARN_AFTER = 3;

function hero(s: ViewState): SafeHtml {
  if (s.step) {
    const { asked, title } = splitStepLabel(s.step.label);
    const where = [s.step.host, s.step.hasPosition ? 'opens where you stopped' : null].filter(Boolean).join(' · ');
    return html`<div class="hero"><div>
<div class="lbl">Next step · from ${s.step.when}</div>
<div class="t">${title}</div>
${where ? html`<div class="w">${where}</div>` : ''}
${asked ? html`<p class="asked">You asked: “${asked}”</p>` : ''}
</div><button type="button" class="btn fill big" data-act="step-open" data-step="${s.step.id}">Step inside</button></div>`;
  }
  return html`<div class="hero"><div>
<div class="lbl">No step yet</div>
<div class="t">Set today aside when you stop</div>
<div class="w">sidy folds your tabs and keeps one small step ready for when you come back.</div>
</div><button type="button" class="btn fill big" data-act="wrap">Set aside today</button></div>`;
}

function counts(s: ViewState): SafeHtml {
  const n = s.numbers;
  const live = s.lastWrapup && (s.lastWrapup.status === 'applied' || s.lastWrapup.status === 'partial');
  const groups = live ? s.lastWrapup!.groups.length : 0;
  const kept = Math.round((n.stillWorkingRate.value ?? 0) * n.stillWorkingRate.n);
  return html`<div class="counts">
${n.tabsInChrome === null ? html`<span>Chrome not connected</span>` : html`<span><b>${n.tabsInChrome}</b>tabs in Chrome</span>`}
${n.tabsSetAside === null ? '' : html`<span><b>${n.tabsSetAside}</b>set aside${groups ? ` in ${plural(groups, 'group')}` : ''}</span>`}
<span><b>${n.clicked}</b>${n.clicked === 1 ? 'step' : 'steps'} opened</span>
<span><b>${kept}</b>kept going 10 min</span></div>`;
}

export function bySideSentence(s: ViewState): string {
  const n = s.numbers;
  if (n.clicked < LEARN_AFTER) {
    return `sidy is still learning what gets you started. ${plural(n.clicked, 'step')} opened so far — after ${LEARN_AFTER}, it can tell you which kind works for you.`;
  }
  const judged = n.stillWorkingRate.n;
  const kept = Math.round((n.stillWorkingRate.value ?? 0) * judged);
  return `Of ${plural(judged, 'step')} you opened and stayed with long enough to tell, ${kept} kept you going past 10 minutes.`;
}

function bySide(s: ViewState): SafeHtml {
  return html`<section class="sec"><h2>By your side</h2>
<div class="bys">${raw(sidySvg(32))}<p>${bySideSentence(s)}</p></div>
<p class="note" style="margin:6px 0 0">From your own counts only — no titles or sites.</p></section>`;
}

function soFar(s: ViewState): SafeHtml {
  const body = s.timeline.length
    ? html`<ul class="tl">${s.timeline.map((t) => html`<li${t.strong ? html` class="b"` : ''}><time>${clock(t.at)}</time>${t.text}</li>`)}</ul>`
    : html`<p class="quiet">Nothing yet. Steps and wrap-ups show up here.</p>`;
  return html`<section class="sec"><h2>Today so far</h2>${body}</section>`;
}

function quiet(s: ViewState): SafeHtml {
  const spoke = s.numbers.spokeToday;
  const reasons = (Object.entries(s.quiet.today) as [QuietReason, number][]).filter(([, c]) => c > 0);
  const head = spoke === 0 ? 'sidy has not spoken first today.' : `sidy spoke first ${spoke === 1 ? 'once' : `${spoke} times`} today.`;
  return html`<section class="sec"><h2>Why sidy stayed quiet</h2><div class="quiet">${head}${
    reasons.length
      ? html`<ul>${reasons.map(([r, c]) => html`<li>${QUIET_TEXT[r]}${c > 1 ? ` · ${c} times` : ''}</li>`)}</ul>`
      : html` No quiet moments to explain.`
  }</div></section>`;
}

export function todayView(s: ViewState): SafeHtml {
  return html`<h1>Today</h1><p class="lead">${longDate(s.now)}</p>
${hero(s)}${counts(s)}${bySide(s)}${soFar(s)}${quiet(s)}`;
}
