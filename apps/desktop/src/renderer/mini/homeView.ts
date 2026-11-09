// Mini's home: connection, a few facts, the one next action, quick actions and Open Side.
// One filled button per state; tabs in Chrome and tabs set aside are separate facts.
import type { ViewState } from '../../main/viewState';
import { html, type SafeHtml } from '../shared/html';
import { cap, chip, clock, facts, footer, head, panel, quick, setAsideText, type QuickAction } from './parts';
import { askBlock, type AskLocal } from './askView';

export interface HomeLocal {
  /** A one-line result from the last quick action (e.g. after Undo). */
  notice?: string;
  checking?: boolean;
  /** Ask sidy: the line, and what is under the box. */
  ask?: AskLocal;
}

const IDLE: AskLocal = { line: '', state: 'idle' };

const HIDE: QuickAction = { icon: '🙈', title: 'Hide sidy', act: 'hide', key: '⌃⌥S' };
const ONE_MORE: QuickAction = { icon: '⏳', title: 'One more hour', sub: 'Keep going, with one check-in', act: 'one-more' };

function focusAction(s: ViewState): QuickAction {
  return s.focusUntil && s.focusUntil > s.now
    ? { icon: '🎧', title: 'End focus', sub: `sidy stays quiet until ${clock(s.focusUntil)}`, act: 'focus-end' }
    : { icon: '🎧', title: 'Focus for an hour', sub: 'sidy stays quiet, no bubbles', act: 'focus' };
}

const live = (s: ViewState) => !!s.lastWrapup && (s.lastWrapup.status === 'applied' || s.lastWrapup.status === 'partial');

export function homeView(s: ViewState, local: HomeLocal): SafeHtml {
  const notice = local.notice ? html`<div class="done-line">${local.notice}</div>` : '';
  if (s.connection !== 'connected') {
    return panel([
      head(chip(s)),
      html`<div class="pb">${notice}
<div class="alert"><b>Chrome isn't connected.</b>Side reconnects on its own when Chrome is open. Still off? Make sure the Side extension is switched on in chrome://extensions.</div>
<button class="btn fill" data-act="check"${local.checking ? ' aria-disabled="true"' : ''}>${local.checking ? 'Checking…' : 'Check again'}</button>
${facts([
  ['Tabs in Chrome', 'Unknown until connected'],
  ['Set aside', setAsideText(s)],
  ['Next step', s.step ? 'Ready — opens once Chrome is back' : 'Waiting for Chrome'],
])}
${quick([
  { icon: '🌙', title: 'Set aside today', sub: 'Needs Chrome — connect first.', act: 'wrap', off: true },
  { icon: '↩️', title: 'Bring back the last tabs', sub: 'Needs Chrome — connect first.', act: 'undo', off: true },
  HIDE,
])}
${askBlock(local.ask ?? IDLE)}</div>`,
      footer,
    ]);
  }

  const tabs = String(s.numbers.tabsInChrome ?? '—');
  const w = s.lastWrapup;
  if (w && live(s) && w.when === 'today') {
    const set = w.groups.reduce((n, g) => n + g.count, 0);
    return panel([
      head(chip(s)),
      html`<div class="pb">${notice}
<div class="done-line"><b>${set} tabs set aside in ${w.groups.length} ${w.groups.length === 1 ? 'group' : 'groups'}.</b> ${s.numbers.tabsOpen ?? 0} still open.</div>
${facts([
  ['Tabs in Chrome', tabs],
  ['Set aside', setAsideText(s)],
  ["Tomorrow's step", s.step ? 'Ready' : 'Made when you come back'],
])}
${quick([
  { icon: '↩️', title: "Bring back today's tabs", sub: `Unfolds the ${w.groups.length} ${w.groups.length === 1 ? 'group' : 'groups'}`, act: 'undo' },
  ONE_MORE,
  HIDE,
])}
${askBlock(local.ask ?? IDLE)}</div>`,
      footer,
    ]);
  }

  if (s.step && s.numbers.stepReady) {
    const when = s.step.when;
    const repeat = !!w?.userLine && !s.step.label.includes(w.userLine);
    const asked = repeat ? html`<div class="w">You asked: ${w!.userLine}</div>` : html`<div class="w">${s.step.host ?? ''}</div>`;
    return panel([
      head(chip(s)),
      html`<div class="pb">${notice}
<div class="step"><div class="lbl">Next step · from ${when}</div><div class="t">${s.step.label}</div>${asked}
<button class="btn fill" style="width:100%" data-act="step-open" data-step="${s.step.id}">Step inside</button></div>
${facts([
  ['Tabs in Chrome', tabs],
  ['Set aside', setAsideText(s)],
  ['Last wrap-up', w ? cap(w.when) : '—'],
])}
${quick([
  { icon: '🌙', title: 'Set aside today', sub: 'Fold open tabs into groups', act: 'wrap' },
  ...(w && w.canUndo ? [{ icon: '↩️', title: `Bring back ${w.when === 'yesterday' ? "yesterday's" : 'the last'} tabs`, act: 'undo' }] : []),
  focusAction(s),
  HIDE,
])}
${askBlock(local.ask ?? IDLE)}</div>`,
      footer,
    ]);
  }

  const open = s.numbers.tabsOpen ?? s.numbers.tabsInChrome ?? 0;
  return panel([
    head(chip(s)),
    html`<div class="pb">${notice}
<div class="step"><div class="lbl">Stopping for today?</div><div class="t">Fold your ${open} open tabs into groups</div><div class="w">Nothing closes. Undo any time tonight.</div>
<button class="btn fill" style="width:100%" data-act="wrap">Set aside today</button></div>
${facts([
  ['Tabs in Chrome', tabs],
  ['Set aside', setAsideText(s)],
  ['Next step', 'Ready after you set aside'],
])}
${quick([ONE_MORE, focusAction(s), HIDE])}
${askBlock(local.ask ?? IDLE)}</div>`,
    footer,
  ]);
}
