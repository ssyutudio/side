// Wrap up inside Mini: a draft already picked from the real tabs, one confirm, the confirmed
// result with Undo, and one optional line for tomorrow. Close only ever covers groups whose tab
// list the user has seen. Failures say what is known and what is not.
import type { KeepReason, SetAside } from '@side/shared';
import type { ViewState } from '../../main/viewState';
import type { PreviewView } from '../../main/controller';
import { html, type SafeHtml } from '../shared/html';
import { head, panel } from './parts';

export interface WrapLocal {
  /** Group keys set to Close. */
  close: string[];
  /** Group keys whose tab list is open. */
  open: string[];
}

const COLORS = ['#1A73E8', '#9334E6', '#188038', '#E8710A', '#D93025', '#007B83', '#B06000', '#5F6368'];
const OK_CHIP = html`<span class="chip ok">Chrome connected</span>`;

const REASON: Record<KeepReason, string> = {
  active: "You're on it",
  pinned: 'Pinned',
  audible: 'Playing sound',
  incognito: 'Private window',
  excluded: 'Not read',
  user_group: 'In your own group',
  changed: 'Changed since',
  gone: 'Already closed',
};

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function primaryLabel(p: PreviewView, close: readonly string[]): string {
  let fold = 0;
  let shut = 0;
  for (const g of p.groups) (close.includes(g.key) ? (shut += g.tabs.length) : (fold += g.tabs.length));
  if (shut && fold) return `Fold ${fold} · Close ${shut}`;
  if (shut) return `Close ${shut} tabs`;
  return `Set aside ${plural(fold, 'tab')}`;
}

function body(p: PreviewView, local: WrapLocal, dim: boolean): SafeHtml {
  const stay: [string, string][] = p.kept.map((k) => [k.title, REASON[k.reason]]);
  if (p.skipped.excluded) stay.push([`${plural(p.skipped.excluded, 'tab')} from an excluded site`, 'Not read']);
  if (p.alreadySetAside) stay.push([`${plural(p.alreadySetAside, 'tab')} already set aside`, 'In Side groups']);
  const stayCount = p.kept.length + p.skipped.excluded;
  const groups = p.groups.map((g, i) => {
    const closing = local.close.includes(g.key);
    const open = closing || local.open.includes(g.key);
    const sample = g.tabs.slice(0, 3).map((t) => t.title).join(', ');
    return html`<div class="g" data-drop="${g.key}" style="--c:${COLORS[i % COLORS.length]}">
<button class="dis" data-act="toggle" data-key="${g.key}" draggable="true" data-drag-group="${g.key}" aria-expanded="${open ? 'true' : 'false'}"><span class="chev" aria-hidden="true">▶</span><i style="width:12px;height:12px;border-radius:4px;background:var(--c);flex:none"></i><span class="n">${g.name}</span></button>
<span class="seg" role="group" aria-label="${g.name}: fold or close"><button aria-pressed="${closing ? 'false' : 'true'}" data-act="mode" data-key="${g.key}" data-mode="fold">Fold</button><button aria-pressed="${closing ? 'true' : 'false'}" data-act="mode" data-key="${g.key}" data-mode="close">Close</button></span>
${open
  ? html`${closing ? html`<div class="warn-line">These ${g.tabs.length} tabs will close. Undo brings them back.</div>` : ''}<ul class="tl2" aria-label="${plural(g.tabs.length, 'tab')}">${g.tabs.map((t) => html`<li draggable="true" data-tab="${t.id}">${t.title}</li>`)}</ul>`
  : html`<span class="ex">${plural(g.tabs.length, 'tab')} · ${sample}</span>`}</div>`;
  });
  const content = p.groups.length
    ? html`<div><h2 class="wh">Set today aside</h2><p class="sub">${plural(p.groups.length, 'group')}, folded in Chrome. Nothing closes unless you pick Close.</p>${p.groups.length > 1 ? html`<p class="note" style="margin:4px 0 0">Drag a tab to another group, or a group onto another to merge them.</p>` : ''}</div>
<div class="gl">${groups}</div>`
    : html`<div><h2 class="wh">Nothing to fold right now.</h2><p class="sub">Every open tab is one sidy leaves alone. Here is why.</p></div>`;
  return html`<div class="pb"${dim ? ' style="opacity:.45;pointer-events:none"' : ''}>${content}
${stay.length ? html`<div class="stay"><h4>${stayCount ? `${stayCount} stay open` : 'Left as they are'}</h4><ul>${stay.map(([t, r]) => html`<li>${t}<span>${r}</span></li>`)}</ul></div>` : ''}</div>`;
}

export function previewView(p: PreviewView, local: WrapLocal): SafeHtml {
  const can = p.groups.length > 0;
  return panel([
    head(OK_CHIP),
    body(p, local, false),
    html`<div class="pf">${can ? html`<button class="btn fill" style="width:100%" data-act="confirm">${primaryLabel(p, local.close)}</button>` : ''}
<div class="row" style="justify-content:space-between;margin-top:6px"><button class="btn ghost sm" data-act="one-more">One more hour</button><button class="btn ghost sm" data-act="home">Cancel</button></div></div>`,
  ]);
}

export function loadingView(): SafeHtml {
  return panel([head(OK_CHIP), html`<div class="pb"><div class="busy" role="status"><span class="spin"></span>Reading your open tabs and sorting them into groups…</div></div>`]);
}

export function checkingView(p: PreviewView, local: WrapLocal): SafeHtml {
  return panel([
    head(html`<span class="chip wait">Working</span>`),
    body(p, local, true),
    html`<div class="pf" role="status" aria-live="polite"><div class="row" style="align-items:center;gap:12px;height:44px"><span class="spin"></span><span><b>Saved on this computer.</b> Checking with Chrome…</span></div>
<p class="note" style="margin:6px 0 0">sidy only reports what Chrome confirms.</p></div>`,
  ]);
}

function todayText(s: ViewState, sa: SetAside): { line: string; note: string } {
  const lines = sa.todayDone.length ? sa.todayDone : s.todayLines;
  const events = lines.filter((l) => !l.startsWith('Set aside'));
  const pick = events.length ? events.slice(-2) : lines.slice(-1);
  if (!pick.length) return { line: 'Today: you set today aside.', note: 'No steps today, so sidy only counts what it set aside.' };
  const text = pick.join(' ');
  return {
    line: `Today: ${text[0].toLowerCase()}${text.slice(1)}`,
    note: events.length ? 'From what you did with Side today — not from page text.' : 'No steps today, so sidy only counts what it set aside.',
  };
}

export function doneView(s: ViewState, sa: SetAside, local: { line: string; suggestions?: string[] }): SafeHtml {
  const sugg = local.suggestions ?? [];
  const r = sa.result ?? { grouped: [], closed: [], kept: [] };
  const folded = r.grouped.reduce((n, g) => n + g.tabIds.length, 0);
  const groups = new Set(r.grouped.filter((g) => g.tabIds.length).map((g) => g.key)).size;
  const closed = r.closed.length;
  const result = closed
    ? `${folded} tabs folded in ${plural(groups, 'group')}, ${closed} closed.`
    : `${plural(folded, 'tab')} set aside in ${plural(groups, 'group')}.`;
  const kept = r.kept.length
    ? html` Chrome kept ${plural(r.kept.length, 'tab')} as ${r.kept.length === 1 ? 'it was' : 'they were'} (${[...new Set(r.kept.map((k) => REASON[k.reason].toLowerCase()))].join(', ')}).`
    : '';
  const today = todayText(s, sa);
  // Tabs Side left as they were (from the preview), any Chrome kept, and tabs it skipped:
  // all from the confirmed record.
  const sk = sa.skipped;
  const stillOpen = sa.kept.length + r.kept.length + (sk ? sk.excluded + sk.incognito + sk.internal : 0);
  return panel([
    head(OK_CHIP),
    html`<div class="pb">
<div class="today">${today.line}<small>${today.note}</small></div>
<div class="done-line"><b>${result}</b> ${stillOpen} still open. Chrome confirmed.${kept}</div>
<button class="btn" data-act="undo" data-id="${sa.id}">Undo · bring back ${plural(folded + closed, 'tab')}</button>
<div class="field" style="margin-top:4px"><label for="tm">What are you most curious about tomorrow?</label>
${sugg.length
  ? html`<div class="chips" role="group" aria-label="Suggestions">${sugg.map(
      (c) => html`<button aria-pressed="${c === local.line ? 'true' : 'false'}" data-act="chip" data-text="${c}">${c}</button>`,
    )}</div>`
  : ''}
<input id="tm" maxlength="200"${sugg.length ? ' style="margin-top:8px"' : ''} placeholder="${sugg.length ? 'Or write your own' : 'One line, if you like'}" autocomplete="off" value="${local.line}">
<p class="note" style="margin:6px 0 0">Optional.${sugg.length ? ' Suggested by Claude from your group names.' : ''} sidy brings it back tomorrow.</p></div></div>
<div class="pf"><div class="row"><button class="btn fill grow" data-act="save-line" data-id="${sa.id}">Save</button><button class="btn grow" data-act="skip" data-id="${sa.id}">Skip</button></div></div>`,
  ]);
}

export type Failure =
  | { kind: 'unconfirmed' }
  | { kind: 'chrome_failed'; message: string }
  | { kind: 'extension_storage_failed'; message: string }
  | { kind: 'storage_failed'; message: string }
  | { kind: 'not_connected' };

export function failedView(f: Failure): SafeHtml {
  let chipText = "Chrome didn't answer";
  let alert: SafeHtml;
  if (f.kind === 'storage_failed') {
    chipText = 'Not saved';
    alert = html`<b>Couldn't save on this computer.</b>Nothing was changed in Chrome. Your disk may be full. Free some space, then try again.`;
  } else if (f.kind === 'chrome_failed') {
    chipText = 'Chrome said no';
    alert = html`<b>Chrome couldn't finish.</b>${f.message} Your list is saved on this computer. Try again — tabs already set aside are skipped, so nothing closes twice.`;
  } else if (f.kind === 'extension_storage_failed') {
    chipText = 'Not started';
    alert = html`<b>The Side extension couldn't save its list.</b>No tab was touched. Try again; if it keeps failing, reload the extension in chrome://extensions.`;
  } else if (f.kind === 'not_connected') {
    chipText = 'Chrome not connected';
    alert = html`<b>Chrome isn't connected.</b>Nothing was changed. Open Chrome and make sure the Side extension is on, then try again.`;
  } else {
    alert = html`<b>Chrome didn't answer.</b>Your list is saved on this computer, but sidy can't confirm what happened to the tabs. Look at Chrome's tab bar, or try again — tabs already set aside are skipped, so nothing closes twice.`;
  }
  return panel([
    head(html`<span class="chip warn">${chipText}</span>`),
    html`<div class="pb"><div class="alert">${alert}</div></div>
<div class="pf"><div class="row"><button class="btn fill grow" data-act="retry">Try again</button><button class="btn grow" data-act="home">Cancel</button></div></div>`,
  ]);
}
