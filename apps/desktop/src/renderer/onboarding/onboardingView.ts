// First run: app -> extension -> connected -> a draft from the real tabs -> sidy's first words.
// One filled button per phase; the connection state is said as it is.
import type { KeepReason } from '@side/shared';
import type { PreviewView } from '../../main/controller';
import { html, raw, type SafeHtml } from '../shared/html';
import { sidySvg } from '../shared/sidy';

export type SetupPhase = 'connecting' | 'failed' | 'connected';

const COLORS = ['#1A73E8', '#9334E6', '#188038', '#E8710A', '#D93025', '#007B83', '#B06000', '#5F6368'];
const WHY: Record<KeepReason, string> = {
  active: "the tab you're on",
  pinned: 'pinned',
  audible: 'playing sound',
  incognito: 'private',
  excluded: 'excluded',
  user_group: 'in your own groups',
  changed: 'changed',
  gone: 'closed',
};

const done = (title: string, sub = '') => html`<li class="done"><span class="dot">✓</span><div><b>${title}</b>${sub ? html`<p>${sub}</p>` : ''}</div></li>`;
const copyRow = (text: string) => html`<div class="copy"><code>${text}</code><button class="btn sm" data-act="copy" data-text="${text}">Copy</button></div>`;

export function onboardingView(o: { phase: SetupPhase; extPath: string; preview: PreviewView | null }): SafeHtml {
  const connected = o.phase === 'connected';
  const lead = 'Tab titles go to Claude to name your groups. Addresses and page text stay on this computer.';
  const add = connected
    ? done('Side extension added')
    : html`<li class="${o.phase === 'failed' ? 'done' : 'now'}"><span class="dot">${o.phase === 'failed' ? '✓' : '2'}</span><div><b>Add the Side extension to Chrome</b>
<p>Open this page in Chrome, switch on Developer mode, click Load unpacked and pick the folder below.</p>
${copyRow('chrome://extensions')}${copyRow(o.extPath)}</div></li>`;
  const connect =
    o.phase === 'connecting'
      ? html`<li class="now"><span class="dot"><span class="spin" style="width:14px;height:14px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span></span><div><b>Connect</b><p>Looking for the extension…</p></div></li>`
      : o.phase === 'failed'
        ? html`<li class="now"><span class="dot">3</span><div><b>Connect</b><div class="alert" style="margin-top:8px"><b>Not connected yet.</b>In chrome://extensions, check that Side is switched on, then press Check again.</div><button class="btn fill" style="margin-top:10px" data-act="check">Check again</button></div></li>`
        : done('Connected to Chrome');

  let draft: SafeHtml | string = '';
  if (connected && o.preview) {
    const p = o.preview;
    const stays = p.kept.length + p.skipped.excluded;
    const total = p.foldCount + stays + p.alreadySetAside;
    const reasons = [...new Set([...p.kept.map((k) => WHY[k.reason]), ...(p.skipped.excluded ? ['excluded'] : [])])];
    draft = html`<div style="margin-top:22px;border-top:1px solid var(--line);padding-top:18px"><b style="font-size:17px">Your ${total} open tabs, as sidy would fold them</b>
<div class="gl" style="margin-top:10px">${p.groups.map(
      (g, i) => html`<div class="g" style="--c:${COLORS[i % COLORS.length]};grid-template-columns:12px 1fr auto"><i></i><span class="n">${g.name}</span><span class="c">${g.tabs.length} ${g.tabs.length === 1 ? 'tab' : 'tabs'}</span></div>`,
    )}</div>
<p class="note" style="margin:8px 0 16px">${stays ? `${stays} stay open: ${reasons.join(', ')}. ` : ''}Nothing changes until you choose.</p>
<button class="btn fill" style="width:100%" data-act="meet">Meet sidy</button></div>`;
  } else if (connected) {
    draft = html`<div style="margin-top:22px"><div class="busy" role="status"><span class="spin"></span>Reading your open tabs…</div></div>`;
  }

  return html`<div class="onb setup" role="dialog" aria-label="Set up Side">${raw(sidySvg(48))}
<h1>${connected ? 'Side is connected' : 'Set up Side'}</h1><p class="lead">${connected ? '' : 'Two minutes. '}${lead}</p>
<ol class="steps">${done('Side is running')}${add}${connect}</ol>${draft}</div>`;
}
