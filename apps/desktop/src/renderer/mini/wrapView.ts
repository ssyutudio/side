// Wrap up inside Mini: a draft already picked from the real tabs, one confirm, the confirmed
// result with Undo, and one optional line for tomorrow. Close only ever covers groups whose tab
// list the user has seen. Failures say what is known and what is not.
import type { KeepReason, SetAside } from '@side/shared';
import type { ViewState } from '../../main/viewState';
import type { PreviewView } from '../../main/controller';
import { html, raw, type SafeHtml } from '../shared/html';
import { k, t, tn, says } from '../../i18n';
import { head, panel } from './parts';

export interface WrapLocal {
  /** Group keys set to Close. */
  close: string[];
  /** Group keys whose tab list is open. */
  open: string[];
  /** The group whose name is being edited. */
  renaming?: string;
}

const COLORS = ['#1A73E8', '#9334E6', '#188038', '#E8710A', '#D93025', '#007B83', '#B06000', '#5F6368'];
const okChip = (): SafeHtml => html`<span class="chip ok">${t('Chrome connected')}</span>`;

const REASON: Record<KeepReason, string> = {
  active: k("You're on it"),
  pinned: k('Pinned'),
  audible: k('Playing sound'),
  incognito: k('Private window'),
  excluded: k('Not read'),
  user_group: k('In your own group'),
  changed: k('Changed since'),
  gone: k('Already closed'),
};

const tabs = (n: number) => tn(n, '{n} tab', '{n} tabs');
const groupsText = (n: number) => tn(n, '{n} group', '{n} groups');

export function primaryLabel(p: PreviewView, close: readonly string[]): string {
  let fold = 0;
  let shut = 0;
  for (const g of p.groups) (close.includes(g.key) ? (shut += g.tabs.length) : (fold += g.tabs.length));
  if (shut && fold) return t('Fold {fold} · Close {shut}', { fold, shut });
  if (shut) return tn(shut, 'Close {n} tab', 'Close {n} tabs');
  return t('Set aside {tabs}', { tabs: tabs(fold) });
}

/** Files saved today in the turned-on desktop apps (approved mockup m1-wrap-files). Never closed or touched. */
function filesBlock(files: NonNullable<PreviewView['files']>): SafeHtml {
  return html`<div class="files"><h4>${t('Files saved today')}</h4><ul>${files.map((f) => html`<li>${f.name} — ${f.tool}</li>`)}</ul><p class="note" style="margin:6px 0 0">${t('Left as they are. sidy only remembers them for tomorrow.')}</p></div>`;
}

function body(p: PreviewView, local: WrapLocal, dim: boolean): SafeHtml {
  const stay: [string, string][] = p.kept.map((x) => [x.title, t(REASON[x.reason])]);
  if (p.skipped.excluded) stay.push([tn(p.skipped.excluded, '{n} tab from an excluded site', '{n} tabs from an excluded site'), t('Not read')]);
  if (p.alreadySetAside) stay.push([tn(p.alreadySetAside, '{n} tab already set aside', '{n} tabs already set aside'), t('In Side groups')]);
  const stayCount = p.kept.length + p.skipped.excluded;
  const groups = p.groups.map((g, i) => {
    const closing = local.close.includes(g.key);
    const open = closing || local.open.includes(g.key);
    const sample = g.tabs.slice(0, 3).map((x) => x.title).join(', ');
    const renaming = local.renaming === g.key;
    const head = renaming
      ? html`<form class="rn" data-key="${g.key}"><i style="width:12px;height:12px;border-radius:4px;background:var(--c);flex:none"></i><input id="rn" maxlength="40" value="${g.name}" aria-label="${t('Group name')}" autocomplete="off"><button type="submit" class="btn sm">${t('Save')}</button></form>`
      : html`<button class="dis" data-act="toggle" data-key="${g.key}" data-drag-group="${g.key}" aria-expanded="${open ? 'true' : 'false'}"><span class="chev" aria-hidden="true">▶</span><i style="width:12px;height:12px;border-radius:4px;background:var(--c);flex:none"></i><span class="n" title="${g.name}">${g.name}</span></button>
<span class="seg" role="group" aria-label="${t('{name}: fold or close', { name: g.name })}"><button aria-pressed="${closing ? 'false' : 'true'}" data-act="mode" data-key="${g.key}" data-mode="fold">${t('Fold')}</button><button aria-pressed="${closing ? 'true' : 'false'}" data-act="mode" data-key="${g.key}" data-mode="close">${t('Close')}</button></span>
<button type="button" class="rn-btn" data-act="rename" data-key="${g.key}" aria-label="${t('Rename {name}', { name: g.name })}"><span class="ic" aria-hidden="true">✏️</span>${t('Rename')}</button>`;
    return html`<div class="g" data-drop="${g.key}" style="--c:${COLORS[i % COLORS.length]}">
${head}
${open
  ? html`${closing ? html`<div class="warn-line">${tn(g.tabs.length, 'This {n} tab will close. Undo brings it back.', 'These {n} tabs will close. Undo brings them back.')}</div>` : ''}<ul class="tl2" aria-label="${tabs(g.tabs.length)}">${g.tabs.map((x) => html`<li data-tab="${x.id}" title="${x.title}">${x.title}</li>`)}</ul>`
  : html`<span class="ex" title="${sample}">${tabs(g.tabs.length)} · ${sample}</span>`}</div>`;
  });
  const content = p.groups.length
    ? html`<div><h2 class="wh">${t('Set today aside')}</h2><p class="sub">${t('{groups}, folded in Chrome. Nothing closes unless you pick Close.', { groups: groupsText(p.groups.length) })}</p>${p.groups.length > 1 ? html`<p class="note" style="margin:4px 0 0">${t('Drag a tab to another group or to a new one, or a group onto another to merge them.')}</p>` : ''}</div>
<div class="gl">${groups}<div class="new-drop" data-drop="__new">➕ ${t('Drop a tab here to start a new group')}</div></div>`
    : html`<div><h2 class="wh">${t('Nothing to fold right now.')}</h2><p class="sub">${t('Every open tab is one sidy leaves alone. Here is why.')}</p></div>`;
  return html`<div class="pb"${raw(dim ? ' style="opacity:.45;pointer-events:none"' : '')}>${content}
${stay.length ? html`<div class="stay"><h4>${stayCount ? t('{n} stay open', { n: stayCount }) : t('Left as they are')}</h4><ul>${stay.map(([title, r]) => html`<li title="${title}">${title}<span>${r}</span></li>`)}</ul></div>` : ''}
${p.files?.length ? filesBlock(p.files) : ''}</div>`;
}

export function previewView(p: PreviewView, local: WrapLocal): SafeHtml {
  const can = p.groups.length > 0;
  return panel([
    head(okChip()),
    body(p, local, false),
    html`<div class="pf">${can ? html`<button class="btn fill" style="width:100%" data-act="confirm">${primaryLabel(p, local.close)}</button>` : ''}
<div class="row" style="justify-content:space-between;margin-top:6px"><button class="btn ghost sm" data-act="one-more">${t('One more hour')}</button><button class="btn ghost sm" data-act="home">${t('Cancel')}</button></div></div>`,
  ]);
}

export function loadingView(): SafeHtml {
  return panel([head(okChip()), html`<div class="pb"><div class="busy" role="status"><span class="spin"></span>${t('Reading your open tabs and sorting them into groups…')}</div></div>`]);
}

export function checkingView(p: PreviewView, local: WrapLocal): SafeHtml {
  return panel([
    head(html`<span class="chip wait">${t('Working')}</span>`),
    body(p, local, true),
    html`<div class="pf" role="status" aria-live="polite"><div class="row" style="align-items:center;gap:12px;min-height:44px"><span class="spin"></span><span>${t('Checking with Chrome…')}</span></div>
<p class="note" style="margin:6px 0 0">${t('sidy only reports what Chrome confirms.')}</p></div>`,
  ]);
}

/** What happened today besides setting aside (that line is the result right below). Nothing: no block at all. */
function todayText(s: ViewState, sa: SetAside): { line: string; note: string } | null {
  const lines = sa.todayDone.length ? sa.todayDone : s.todayLines;
  // The set-aside line itself isn't news; it may have been saved in either language.
  const events = lines.filter((l) => !says(l, 'Set aside {tabs} in {groups}.'));
  if (!events.length) return null;
  const text = events.slice(-2).join(' ');
  return {
    line: t('Today: {text}', { text: `${text[0].toLowerCase()}${text.slice(1)}` }),
    note: t('From what you did with Side today — not from page text.'),
  };
}

export function doneView(s: ViewState, sa: SetAside, local: { line: string; suggestions?: string[] }): SafeHtml {
  const sugg = local.suggestions ?? [];
  const r = sa.result ?? { grouped: [], closed: [], kept: [] };
  const folded = r.grouped.reduce((n, g) => n + g.tabIds.length, 0);
  const groups = new Set(r.grouped.filter((g) => g.tabIds.length).map((g) => g.key)).size;
  const closed = r.closed.length;
  const result = closed
    ? tn(folded, '{folded} tab folded in {groups}, {closed} closed.', '{folded} tabs folded in {groups}, {closed} closed.', { folded, groups: groupsText(groups), closed })
    : t('{tabs} set aside in {groups}.', { tabs: tabs(folded), groups: groupsText(groups) });
  const kept = r.kept.length
    ? html` ${tn(r.kept.length, 'Chrome kept {n} tab as it was ({reasons}).', 'Chrome kept {n} tabs as they were ({reasons}).', { reasons: [...new Set(r.kept.map((x) => t(REASON[x.reason]).toLowerCase()))].join(', ') })}`
    : '';
  const today = todayText(s, sa);
  // Tabs Side left as they were (from the preview), any Chrome kept, and tabs it skipped:
  // all from the confirmed record.
  const sk = sa.skipped;
  const stillOpen = sa.kept.length + r.kept.length + (sk ? sk.excluded + sk.incognito + sk.internal : 0);
  return panel([
    head(okChip()),
    html`<div class="pb">
${today ? html`<div class="today">${today.line}<small>${today.note}</small></div>` : ''}
<div class="done-line"><b>${result}</b>${stillOpen ? html` ${t('{n} still open.', { n: stillOpen })}` : ''} ${t('Chrome confirmed.')}${kept}</div>
<button class="btn" data-act="undo" data-id="${sa.id}">${t('Undo · bring back {tabs}', { tabs: tabs(folded + closed) })}</button>
<div class="field" style="margin-top:4px"><label for="tm">${t('What are you most curious about tomorrow?')}</label>
${sugg.length
  ? html`<div class="chips" role="group" aria-label="${t('Suggestions')}">${sugg.map(
      (c) => html`<button aria-pressed="${c === local.line ? 'true' : 'false'}" data-act="chip" data-text="${c}">${c}</button>`,
    )}</div>`
  : ''}
<input id="tm" maxlength="200"${raw(sugg.length ? ' style="margin-top:8px"' : '')} placeholder="${sugg.length ? t('Or write your own') : t('One line, if you like')}" autocomplete="off" value="${local.line}">
<p class="note" style="margin:6px 0 0">${t('Optional.')}${sugg.length ? ` ${t('Suggested by Claude from your group names.')}` : ''} ${t('sidy brings it back tomorrow.')}</p></div></div>
<div class="pf"><div class="row"><button class="btn fill grow" data-act="save-line" data-id="${sa.id}">${t('Save')}</button><button class="btn grow" data-act="skip" data-id="${sa.id}">${t('Skip')}</button></div></div>`,
  ]);
}

export type Failure =
  | { kind: 'unconfirmed' }
  | { kind: 'chrome_failed'; message: string }
  | { kind: 'extension_storage_failed'; message: string }
  | { kind: 'storage_failed'; message: string }
  | { kind: 'not_connected' };

export function failedView(f: Failure): SafeHtml {
  let chipText = t("Chrome didn't answer");
  let alert: SafeHtml;
  if (f.kind === 'storage_failed') {
    chipText = t('Not saved');
    alert = html`<b>${t("Couldn't save on this computer.")}</b>${t('Nothing was changed in Chrome. Your disk may be full. Free some space, then try again.')}`;
  } else if (f.kind === 'chrome_failed') {
    chipText = t('Chrome said no');
    alert = html`<b>${t("Chrome couldn't finish.")}</b>${f.message} ${t('Your list is saved on this computer. Try again — tabs already set aside are skipped, so nothing closes twice.')}`;
  } else if (f.kind === 'extension_storage_failed') {
    chipText = t('Not started');
    alert = html`<b>${t("The Side extension couldn't save its list.")}</b>${t('No tab was touched. Try again; if it keeps failing, reload the extension in chrome://extensions.')}`;
  } else if (f.kind === 'not_connected') {
    chipText = t('Chrome not connected');
    alert = html`<b>${t("Chrome isn't connected.")}</b>${t('Nothing was changed. Open Chrome and make sure the Side extension is on, then try again.')}`;
  } else {
    alert = html`<b>${t("Chrome didn't answer.")}</b>${t("Your list is saved on this computer, but sidy can't confirm what happened to the tabs. Look at Chrome's tab bar, or try again — tabs already set aside are skipped, so nothing closes twice.")}`;
  }
  return panel([
    head(html`<span class="chip warn">${chipText}</span>`),
    html`<div class="pb"><div class="alert">${alert}</div></div>
<div class="pf"><div class="row"><button class="btn fill grow" data-act="retry">${t('Try again')}</button><button class="btn grow" data-act="home">${t('Cancel')}</button></div></div>`,
  ]);
}
