// Mini's home: connection, a few facts, the one next action, quick actions and Open Side.
// One filled button per state; tabs in Chrome and tabs set aside are separate facts.
import type { ViewState } from '../../main/viewState';
import { html, raw, type SafeHtml } from '../shared/html';
import { k, t, tn } from '../../i18n';
import { cap, chip, clock, facts, footer, head, panel, quick, setAsideText, type QuickAction } from './parts';
import { askBlock, type AskContext, type AskLocal } from './askView';

export interface HomeLocal {
  /** A one-line result from the last quick action (e.g. after Undo). */
  notice?: string;
  checking?: boolean;
  /** Step inside was pressed and the app has not answered yet. */
  stepBusy?: boolean;
  /** Ask sidy: the line, and what is under the box. */
  ask?: AskLocal;
}

const IDLE: AskLocal = { line: '', state: 'idle' };

// Titles are drawn through t() in quick(); the tables only mark them for translation.
const HIDE: QuickAction = { icon: '🙈', title: k('Hide sidy'), act: 'hide', key: '⌃⌥S' };
const ONE_MORE: QuickAction = { icon: '⏳', title: k('One more hour'), sub: k('Keep going, with one check-in'), act: 'one-more' };

function focusAction(s: ViewState): QuickAction {
  return s.focusUntil && s.focusUntil > s.now
    ? { icon: '🎧', title: t('End focus'), sub: t('sidy stays quiet until {time}', { time: clock(s.focusUntil) }), act: 'focus-end' }
    : { icon: '🎧', title: t('Focus for an hour'), sub: t('sidy stays quiet, no bubbles'), act: 'focus' };
}

/** The desktop apps turned on in Connections, so Mini shows what sidy is connected to besides Chrome. */
function appsFact(s: ViewState): [string, string][] {
  const on = (s.connections?.apps ?? []).filter((a) => a.on).map((a) => a.tool);
  return on.length ? [[t('Desktop apps'), on.join(', ')]] : [];
}

/** The box's context: the next step may not exist, and the line goes to Claude only when it can. */
const askCtx = (s: ViewState): AskContext => ({ hasStep: !!s.step, claude: s.settings.llmEnabled && s.saw.llm.available });

/** Chrome never confirmed the last wrap-up: say so, and offer to run it again (Undo stays where it is offered). */
function unsure(s: ViewState): SafeHtml | '' {
  const w = s.lastWrapup;
  if (!w || (w.status !== 'unconfirmed' && w.status !== 'failed')) return '';
  return html`<div class="alert"><b>${t("Chrome didn't confirm the last wrap-up.")}</b>${t('Look at the tab bar, or try again — tabs already set aside are skipped.')}
<button class="btn" style="margin-top:8px" data-act="retry-last" data-id="${w.id}">${t('Try again')}</button></div>`;
}

const live = (s: ViewState) => !!s.lastWrapup && (s.lastWrapup.status === 'applied' || s.lastWrapup.status === 'partial');

export function homeView(s: ViewState, local: HomeLocal): SafeHtml {
  const notice = local.notice ? html`<div class="done-line">${local.notice}</div>` : '';
  if (s.connection !== 'connected') {
    return panel([
      head(chip(s)),
      html`<div class="pb">${notice}
<div class="alert"><b>${t("Chrome isn't connected.")}</b>${t('Side reconnects on its own when Chrome is open. Still off? Make sure the Side extension is switched on in chrome://extensions.')}</div>
<button class="btn fill" data-act="check"${raw(local.checking ? ' aria-disabled="true"' : '')}>${local.checking ? t('Checking…') : t('Check again')}</button>
${facts([
  [t('Tabs in Chrome'), t('Unknown until connected')],
  ...appsFact(s),
  [t('Set aside'), setAsideText(s)],
  [t('Next step'), s.step ? t('Ready — opens once Chrome is back') : t('Waiting for Chrome')],
])}
${quick([
  { icon: '🌙', title: k('Set aside today'), sub: k('Needs Chrome — connect first.'), act: 'wrap', off: true },
  { icon: '↩️', title: k('Bring back the last tabs'), sub: k('Needs Chrome — connect first.'), act: 'undo', off: true },
  HIDE,
])}
${askBlock(local.ask ?? IDLE, askCtx(s))}</div>`,
      footer(),
    ]);
  }

  const tabs = String(s.numbers.tabsInChrome ?? '—');
  const w = s.lastWrapup;
  if (w && live(s) && w.whenKind === 'today') {
    const set = w.groups.reduce((n, g) => n + g.count, 0);
    return panel([
      head(chip(s)),
      html`<div class="pb">${notice}${unsure(s)}
<div class="done-line"><b>${tn(set, '{tabs} tab set aside in {groups}.', '{tabs} tabs set aside in {groups}.', { tabs: set, groups: tn(w.groups.length, '{n} group', '{n} groups') })}</b>${s.numbers.tabsOpen ? html` ${t('{n} still open.', { n: s.numbers.tabsOpen })}` : ''}</div>
${facts([
  [t('Tabs in Chrome'), tabs],
  ...appsFact(s),
  [t('Set aside'), setAsideText(s)],
  [t("Tomorrow's step"), s.step ? t('Ready') : t('Made when you come back')],
])}
${quick([
  { icon: '↩️', title: k("Bring back today's tabs"), sub: tn(w.groups.length, 'Unfolds the {n} group', 'Unfolds the {n} groups'), act: 'undo' },
  ONE_MORE,
  HIDE,
])}
${askBlock(local.ask ?? IDLE, askCtx(s))}</div>`,
      footer(),
    ]);
  }

  if (s.step && s.numbers.stepReady) {
    const when = s.step.when;
    const repeat = !!w?.userLine && !s.step.label.includes(w.userLine);
    const asked = repeat ? html`<div class="w">${t('You asked:')} ${w!.userLine}</div>` : html`<div class="w">${s.step.host ?? ''}</div>`;
    return panel([
      head(chip(s)),
      html`<div class="pb">${notice}${unsure(s)}
<div class="step"><div class="lbl">${t('Next step · from {when}', { when })}</div><div class="t">${s.step.label}</div>${asked}
<button class="btn fill" style="width:100%" data-act="step-open" data-step="${s.step.id}"${raw(local.stepBusy ? ' aria-disabled="true"' : '')}>${t('Step inside')}</button>${local.stepBusy ? html`<div class="row asking" role="status" aria-live="polite"><span class="spin"></span>${t('Opening…')}</div>` : ''}</div>
${facts([
  [t('Tabs in Chrome'), tabs],
  ...appsFact(s),
  [t('Set aside'), setAsideText(s)],
  [t('Last wrap-up'), w ? cap(w.when) : '—'],
])}
${quick([
  { icon: '🌙', title: k('Set aside today'), sub: k('Fold open tabs into groups'), act: 'wrap' },
  ...(w && w.canUndo ? [{ icon: '↩️', title: w.whenKind === 'yesterday' ? k("Bring back yesterday's tabs") : k('Bring back the last tabs'), act: 'undo' }] : []),
  focusAction(s),
  HIDE,
])}
${askBlock(local.ask ?? IDLE, askCtx(s))}</div>`,
      footer(),
    ]);
  }

  return panel([
    head(chip(s)),
    html`<div class="pb">${notice}${unsure(s)}
<div class="step"><div class="lbl">${t('Stopping for today?')}</div><div class="t">${t('Fold your open tabs into groups')}</div><div class="w">${t('Nothing closes. Undo brings your tabs back.')}</div>
<button class="btn fill" style="width:100%" data-act="wrap">${t('Set aside today')}</button></div>
${facts([
  [t('Tabs in Chrome'), tabs],
  ...appsFact(s),
  [t('Set aside'), setAsideText(s)],
  [t('Next step'), t('Ready after you set aside')],
])}
${quick([ONE_MORE, focusAction(s), HIDE])}
${askBlock(local.ask ?? IDLE, askCtx(s))}</div>`,
    footer(),
  ]);
}
