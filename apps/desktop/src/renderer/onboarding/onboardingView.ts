// First run: app -> extension -> connected -> a draft from the real tabs -> sidy's first words.
// One filled button per phase; the connection state is said as it is.
import type { KeepReason } from '@side/shared';
import type { PreviewView } from '../../main/controller';
import { html, raw, type SafeHtml } from '../shared/html';
import { sidySvg } from '../shared/sidy';
import { k, language, t, tn } from '../../i18n';
import { KOREAN_NAME } from '../../i18n/ko';

export type SetupPhase = 'connecting' | 'failed' | 'connected';

const COLORS = ['#1A73E8', '#9334E6', '#188038', '#E8710A', '#D93025', '#007B83', '#B06000', '#5F6368'];
const WHY: Record<KeepReason, string> = {
  active: k("the tab you're on"),
  pinned: k('pinned'),
  audible: k('playing sound'),
  incognito: k('private'),
  excluded: k('excluded'),
  user_group: k('in your own groups'),
  changed: k('changed'),
  gone: k('closed'),
};

const done = (title: string, sub = '') => html`<li class="done"><span class="dot">✓</span><div><b>${title}</b>${sub ? html`<p>${sub}</p>` : ''}</div></li>`;
const copyRow = (text: string) => html`<div class="copy"><code>${text}</code><button class="btn sm" data-act="copy" data-text="${text}">${t('Copy')}</button></div>`;

/** English / Korean, each named in itself, right in the first window. */
function languagePick(): SafeHtml {
  const cur = language();
  return html`<span class="seg lang-pick" role="group" aria-label="${t('Language')}">${(
    [['en', 'English'], ['ko', KOREAN_NAME]] as const
  ).map(([code, name]) => html`<button type="button" data-act="lang" data-lang="${code}" lang="${code}" aria-pressed="${code === cur ? 'true' : 'false'}">${name}</button>`)}</span>`;
}

export function onboardingView(o: { phase: SetupPhase; extPath: string; preview: PreviewView | null; llmAvailable?: boolean }): SafeHtml {
  const connected = o.phase === 'connected';
  // Without a Claude key nothing is sent; the first window must not say otherwise.
  const lead = o.llmAvailable === false
    ? t('Everything stays on this computer: without a Claude key, sidy names groups and picks your next step with simple rules.')
    : t('Tab titles, your one line and your step counts go to Claude to name groups and pick your next step. Addresses and page text stay on this computer.');
  const add = connected
    ? done(t('Side extension added'))
    : html`<li class="now"><span class="dot">2</span><div><b>${t('Add the Side extension to Chrome')}</b>
<p>${t('Open this page in Chrome, switch on Developer mode, click Load unpacked and pick the folder below.')}</p>
${copyRow('chrome://extensions')}${copyRow(o.extPath)}</div></li>`;
  const connect =
    o.phase === 'connecting'
      ? html`<li class="now"><span class="dot"><span class="spin" style="width:14px;height:14px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span></span><div><b>${t('Connect')}</b><p>${t('Looking for the extension…')}</p></div></li>`
      : o.phase === 'failed'
        ? html`<li class="now"><span class="dot">3</span><div><b>${t('Connect')}</b><div class="alert" style="margin-top:8px"><b>${t('Not connected yet.')}</b>${t('In chrome://extensions, check that Side is switched on, then press Check again.')}</div><button class="btn fill" style="margin-top:10px" data-act="check">${t('Check again')}</button></div></li>`
        : done(t('Connected to Chrome'));

  let draft: SafeHtml | string = '';
  if (connected && o.preview) {
    const p = o.preview;
    const stays = p.kept.length + p.skipped.excluded;
    const total = p.foldCount + stays + p.alreadySetAside;
    const reasons = [...new Set([...p.kept.map((x) => WHY[x.reason]), ...(p.skipped.excluded ? [k('excluded')] : [])])].map((r) => t(r));
    draft = html`<div style="margin-top:22px;border-top:1px solid var(--line);padding-top:18px"><b style="font-size:17px">${t('Your {total} open tabs, as sidy would fold them', { total })}</b>
<div class="gl" style="margin-top:10px">${p.groups.map(
      (g, i) => html`<div class="g" style="--c:${COLORS[i % COLORS.length]};grid-template-columns:12px 1fr auto"><i></i><span class="n">${g.name}</span><span class="c">${tn(g.tabs.length, '{n} tab', '{n} tabs')}</span></div>`,
    )}</div>
<p class="note" style="margin:8px 0 16px">${stays ? `${t('{n} stay open: {reasons}.', { n: stays, reasons: reasons.join(', ') })} ` : ''}${t('Nothing changes until you choose.')}</p>
<button class="btn fill" style="width:100%" data-act="meet">${t('Meet sidy')}</button></div>`;
  } else if (connected) {
    draft = html`<div style="margin-top:22px"><div class="busy" role="status"><span class="spin"></span>${t('Reading your open tabs…')}</div></div>`;
  }

  return html`<div class="onb setup" role="dialog" aria-label="${t('Set up Side')}"><div class="onb-top">${raw(sidySvg(48))}${languagePick()}</div>
<h1>${connected ? t('Side is connected') : t('Set up Side')}</h1><p class="lead">${connected ? '' : `${t('Two minutes.')} `}${lead}</p>
<ol class="steps">${done(t('Side is running'))}${add}${connect}</ol>${draft}</div>`;
}
