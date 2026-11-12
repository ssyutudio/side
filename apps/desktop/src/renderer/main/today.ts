// Main · Today. The next step is the hero; numbers sit under it in small type; then one
// "By your side" sentence from the user's own counts, today's moments, and why sidy stayed quiet.
import type { QuietReason } from '@side/shared';
import type { ViewState } from '../../main/viewState';
import { html, raw, type SafeHtml } from '../shared/html';
import { sidySvg } from '../shared/sidy';
import { QUIET_TEXT, clock, longDate, splitStepLabel } from './format';
import { t, tn } from '../../i18n';

const LEARN_AFTER = 3;

function hero(s: ViewState): SafeHtml {
  if (s.step) {
    const { asked, title } = splitStepLabel(s.step.label);
    const where = [s.step.host, s.step.hasPosition ? t('opens where you stopped') : null].filter(Boolean).join(' · ');
    return html`<div class="hero"><div>
<div class="lbl">${t('Next step · from {when}', { when: s.step.when })}</div>
<div class="t">${title}</div>
${where ? html`<div class="w">${where}</div>` : ''}
${asked ? html`<p class="asked">${t('You asked: “{asked}”', { asked })}</p>` : ''}
</div><button type="button" class="btn fill big" data-act="step-open" data-step="${s.step.id}">${t('Step inside')}</button></div>`;
  }
  return html`<div class="hero"><div>
<div class="lbl">${t('No step yet')}</div>
<div class="t">${t('Set today aside when you stop')}</div>
<div class="w">${t('sidy folds your tabs and keeps one small step ready for when you come back.')}</div>
</div><button type="button" class="btn fill big" data-act="wrap">${t('Set aside today')}</button></div>`;
}

function counts(s: ViewState): SafeHtml {
  const n = s.numbers;
  const live = s.lastWrapup && (s.lastWrapup.status === 'applied' || s.lastWrapup.status === 'partial');
  const groups = live ? s.lastWrapup!.groups.length : 0;
  const kept = Math.round((n.stillWorkingRate.value ?? 0) * n.stillWorkingRate.n);
  return html`<div class="counts">
${n.tabsInChrome === null ? html`<span>${t('Chrome not connected')}</span>` : html`<span><b>${n.tabsInChrome}</b>${t('tabs in Chrome')}</span>`}
${n.tabsSetAside === null ? '' : html`<span><b>${n.tabsSetAside}</b>${t('set aside')}${groups ? ` ${tn(groups, 'in {n} group', 'in {n} groups')}` : ''}</span>`}
<span><b>${n.clicked}</b>${tn(n.clicked, 'step opened', 'steps opened')}</span>
<span><b>${kept}</b>${t('kept going 10 min')}</span></div>`;
}

export function bySideSentence(s: ViewState): string {
  const n = s.numbers;
  if (n.clicked < LEARN_AFTER) {
    return tn(
      n.clicked,
      'sidy is still learning what gets you started. {n} step opened so far — after {after}, it can tell you which kind works for you.',
      'sidy is still learning what gets you started. {n} steps opened so far — after {after}, it can tell you which kind works for you.',
      { after: LEARN_AFTER },
    );
  }
  const judged = n.stillWorkingRate.n;
  const kept = Math.round((n.stillWorkingRate.value ?? 0) * judged);
  return tn(
    judged,
    'Of {n} step you opened and stayed with long enough to tell, {kept} kept you going past 10 minutes.',
    'Of {n} steps you opened and stayed with long enough to tell, {kept} kept you going past 10 minutes.',
    { kept },
  );
}

function bySide(s: ViewState): SafeHtml {
  const b = s.bySide ?? { text: bySideSentence(s), byClaude: false };
  const note = b.byClaude ? t('Written by Claude from your own counts only — no titles or sites.') : t('From your own counts only — no titles or sites.');
  return html`<section class="sec"><h2>${t('By your side')}</h2>
<div class="bys">${raw(sidySvg(32))}<p>${b.text}</p></div>
<p class="note" style="margin:6px 0 0">${note}</p></section>`;
}

function soFar(s: ViewState): SafeHtml {
  const body = s.timeline.length
    ? html`<ul class="tl">${s.timeline.map((e) => html`<li${e.strong ? html` class="b"` : ''}><time>${clock(e.at)}</time>${e.text}</li>`)}</ul>`
    : html`<p class="quiet">${t('Nothing yet. Steps and wrap-ups show up here.')}</p>`;
  return html`<section class="sec"><h2>${t('Today so far')}</h2>${body}</section>`;
}

function quiet(s: ViewState): SafeHtml {
  const spoke = s.numbers.spokeToday;
  const reasons = (Object.entries(s.quiet.today) as [QuietReason, number][]).filter(([, c]) => c > 0);
  const head = spoke === 0 ? t('sidy has not spoken first today.') : spoke === 1 ? t('sidy spoke first once today.') : t('sidy spoke first {n} times today.', { n: spoke });
  return html`<section class="sec"><h2>${t('Why sidy stayed quiet')}</h2><div class="quiet">${head}${
    reasons.length
      ? html`<ul>${reasons.map(([r, c]) => html`<li>${t(QUIET_TEXT[r])}${c > 1 ? ` · ${t('{n} times', { n: c })}` : ''}</li>`)}</ul>`
      : html` ${t('No quiet moments to explain.')}`
  }</div></section>`;
}

export function todayView(s: ViewState): SafeHtml {
  return html`<h1>${t('Today')}</h1><p class="lead">${longDate(s.now)}</p>
${hero(s)}${counts(s)}${bySide(s)}${soFar(s)}${quiet(s)}`;
}
