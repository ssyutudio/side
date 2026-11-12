// Mini window glue: a small state machine for home -> Wrap up -> result, and One more hour.
// Every action goes through the app's validated routes; the screen only says what came back.
import type { ViewState } from '../../main/viewState';
import type { PreviewView } from '../../main/controller';
import type { SetAside } from '@side/shared';
import { getApi } from '../shared/api';
import { applyLanguage } from '../shared/lang';
import { t } from '../../i18n';
import { FIXTURE_PREVIEW, FIXTURE_PREVIEW_FILES, FIXTURE_PREVIEW_LONG, FIXTURES } from '../shared/fixtures';
import { homeView, type HomeLocal } from './homeView';
import { checkingView, doneView, failedView, loadingView, previewView, type Failure, type WrapLocal } from './wrapView';
import { oneMoreView } from './oneMoreView';
import { clock } from './parts';
import { stepOpenedText, type StepOpenReply } from '../shared/stepText';
import { actFor } from './askView';
import type { AskActionId, AskDecision } from '../../core/askSidy';

type View =
  | { name: 'home' }
  | { name: 'loading' }
  | { name: 'preview'; p: PreviewView }
  | { name: 'checking'; p: PreviewView }
  | { name: 'done'; sa: SetAside }
  | { name: 'failed'; f: Failure; retryId: string | null; p: PreviewView | null }
  | { name: 'onemore'; minutes: 30 | 60 };

type WrapOut = { kind: string; setAside?: SetAside; message?: string; reason?: string };

const api = getApi();
const MINI_ROOM = 28;
/** The tallest Mini the app accepts; anything taller scrolls anyway. */
const MINI_MAX = 2000;
const app = document.getElementById('app')!;
let state: ViewState | null = null;
let view: View = { name: 'home' };
let wrap: WrapLocal = { close: [], open: [] };
let line = '';
let suggestions: string[] = [];
let home: HomeLocal = {};
/** The screen drawn last, so a redraw of the same screen keeps where its body was scrolled. */
let drawnScreen: string | null = null;
/** The notice drawn last: a new one is shown from the top of the body, where it is, not where the body was scrolled. */
let drawnNotice: string | undefined;
/** What the app was last told about a Wrap up in progress (see side:mini.keep). */
let keepSent: boolean | null = null;
/** The language drawn last: a push that changes it redraws every screen, including a Wrap up in progress. */
let drawnLanguage: string | undefined;

const EMPTY_PREVIEW: PreviewView = { groups: [], kept: [], alreadySetAside: 0, skipped: { excluded: 0, incognito: 0, internal: 0 }, foldCount: 0 };

/** A selector for the focused control, so a redraw can give focus back (buttons have no id). */
function focusKey(el: Element | null): string | null {
  if (!(el instanceof HTMLElement) || el === document.body || el.id) return null;
  const a = el.dataset.act;
  if (!a) return null;
  const extra = ['key', 'mode', 'action', 'min', 'text', 'id'].map((k) => (el.dataset[k] ? `[data-${k}="${CSS.escape(el.dataset[k]!)}"]` : '')).join('');
  return `[data-act="${CSS.escape(a)}"]${extra}`;
}

function render() {
  if (!state) return;
  applyLanguage(api, state);
  let h;
  switch (view.name) {
    case 'home': h = homeView(state, home); break;
    case 'loading': h = loadingView(); break;
    case 'preview': h = previewView(view.p, wrap); break;
    case 'checking': h = checkingView(view.p, wrap); break;
    case 'done': h = doneView(state, view.sa, { line, suggestions }); break;
    case 'failed': h = failedView(view.f); break;
    case 'onemore': h = oneMoreView(state.now, state.settings.wakeMinutes, view.minutes, state); break;
  }
  // A redraw must not take the text box away from someone typing in it: the focused box, its
  // caret, and a group name being typed (kept only in the box) come back as they were.
  const active = document.activeElement instanceof HTMLInputElement && document.activeElement.id ? document.activeElement : null;
  const typed = active ? { id: active.id, start: active.selectionStart, end: active.selectionEnd } : null;
  const renamed = app.querySelector<HTMLFormElement>('form.rn');
  const renameDraft = renamed ? { key: renamed.dataset.key, value: renamed.querySelector<HTMLInputElement>('#rn')?.value ?? '' } : null;
  // Checking shows the same list as the preview it confirms, so it counts as the same screen.
  const screen = view.name === 'checking' ? 'preview' : view.name;
  const same = drawnScreen === screen;
  const notice = view.name === 'home' ? home.notice : undefined;
  const scroll = same && notice === drawnNotice ? (app.querySelector('.pb')?.scrollTop ?? 0) : 0;
  const focus = same ? focusKey(document.activeElement) : null;
  const lists = new Map<string, number>();
  if (same) app.querySelectorAll<HTMLElement>('[data-drop] .tl2').forEach((l) => lists.set(l.closest<HTMLElement>('[data-drop]')!.dataset.drop!, l.scrollTop));
  // Room on every side so the panel's shadow fades out inside the window instead of being cut
  // into a visible box at the window edge.
  app.innerHTML = `<div class="mini-room">${h}</div>`;
  drawnScreen = screen;
  drawnNotice = notice;
  drawnLanguage = state.settings.language;
  const keep = view.name === 'preview' || view.name === 'checking' || view.name === 'done' || view.name === 'failed';
  if (keep !== keepSent) {
    keepSent = keep;
    void Promise.resolve(api.invoke('side:mini.keep', { keep })).catch(() => undefined);
  }
  const body = app.querySelector<HTMLElement>('.pb');
  if (body && scroll) body.scrollTop = scroll;
  app.querySelectorAll<HTMLElement>('[data-drop] .tl2').forEach((l) => {
    const top = lists.get(l.closest<HTMLElement>('[data-drop]')!.dataset.drop!);
    if (top) l.scrollTop = top;
  });
  const rn = app.querySelector<HTMLInputElement>('#rn');
  if (rn && renameDraft && rn.closest<HTMLFormElement>('form.rn')?.dataset.key === renameDraft.key) rn.value = renameDraft.value;
  const back = typed ? app.querySelector<HTMLInputElement>(`#${CSS.escape(typed.id)}`) : null;
  if (back && typed) {
    back.focus({ preventScroll: true });
    if (typed.start !== null && typed.end !== null) back.setSelectionRange(typed.start, typed.end);
  }
  if (focus && !back) app.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
  const ask = app.querySelector<HTMLInputElement>('#ask');
  ask?.addEventListener('input', () => (home = { ...home, ask: { line: ask.value, state: 'idle' } }));
  ask?.addEventListener('keydown', (e) => {
    // Enter that only finishes a Korean (IME) syllable is not a send.
    if (e.key === 'Enter' && !e.isComposing && e.keyCode !== 229) void askNow();
  });
  // Ask for the panel's full height (its body may be scrolling inside the current window). The app
  // caps the window at the screen, the panel caps itself at the window, and the body scrolls.
  const panel = app.querySelector<HTMLElement>('.panel');
  if (panel) {
    const hidden = body ? body.scrollHeight - body.clientHeight : 0;
    const height = Math.ceil(panel.getBoundingClientRect().height + hidden) + 2 * MINI_ROOM;
    void api.invoke('side:mini.resize', { height: Math.min(height, MINI_MAX) });
  }
  app.querySelector<HTMLInputElement>('#tm')?.addEventListener('input', (e) => (line = (e.target as HTMLInputElement).value));
}

function go(v: View) {
  view = v;
  // A name left half-typed belongs to the preview it was typed in.
  if (v.name !== 'preview') wrap = { ...wrap, renaming: undefined };
  render();
}

// Redraws the app pushes (state updates, Claude's suggestions) wait while a Korean or other IME
// syllable is being composed: replacing the box mid-syllable loses it.
let composing = false;
let redrawLater = false;
app.addEventListener('compositionstart', () => (composing = true));
app.addEventListener('compositionend', () => {
  composing = false;
  if (redrawLater) {
    redrawLater = false;
    render();
  }
});
function pushedRender() {
  if (composing) redrawLater = true;
  else render();
}

async function loadSuggestions(id: string) {
  const r = await api.invoke<{ suggestions?: string[] }>('side:wrapup.suggest', { id }).catch(() => null);
  // Only if the user is still on that result.
  if (view.name === 'done' && view.sa.id === id && r?.suggestions?.length) {
    suggestions = r.suggestions;
    pushedRender();
  }
}

/** A Wrap up route's answer; one that throws or answers with an error is "unconfirmed", never a screen stuck on Checking. */
async function wrapCall(channel: string, payload?: unknown): Promise<WrapOut> {
  try {
    const r = await api.invoke<WrapOut | { error: string } | null>(channel, payload);
    return !r || 'error' in r ? { kind: 'unconfirmed' } : r;
  } catch {
    return { kind: 'unconfirmed' };
  }
}

/** `retryId`: the Wrap up to try again when the answer doesn't carry it. */
function afterWrap(out: WrapOut, p: PreviewView | null, retryId: string | null = null) {
  if ((out.kind === 'applied' || out.kind === 'partial') && out.setAside) {
    suggestions = [];
    go({ name: 'done', sa: out.setAside });
    return void loadSuggestions(out.setAside.id);
  }
  if (out.kind === 'no_preview') return void startWrap();
  const f: Failure =
    out.kind === 'unconfirmed' ? { kind: 'unconfirmed' }
    : out.kind === 'chrome_failed' ? { kind: 'chrome_failed', message: out.message ?? '' }
    : out.kind === 'extension_storage_failed' ? { kind: 'extension_storage_failed', message: out.message ?? '' }
    : out.kind === 'storage_failed' ? { kind: 'storage_failed', message: out.message ?? '' }
    : { kind: 'not_connected' };
  go({ name: 'failed', f, retryId: out.setAside?.id ?? retryId, p });
}

async function startWrap() {
  wrap = { close: [], open: [] };
  line = '';
  go({ name: 'loading' });
  const p = await api.invoke<PreviewView | { error: string }>('side:wrapup.preview').catch(() => null);
  if (!p || 'error' in p) return go({ name: 'failed', f: { kind: 'not_connected' }, retryId: null, p: null });
  go({ name: 'preview', p });
}

async function confirm(p: PreviewView) {
  go({ name: 'checking', p });
  afterWrap(await wrapCall('side:wrapup.confirm', { closeGroupKeys: wrap.close }), p);
}

/** side:toast takes at most 200 characters. */
const TOAST_MAX = 200;

async function toastAndClose(text: string) {
  const short = text.length > TOAST_MAX ? `${text.slice(0, TOAST_MAX - 1).trimEnd()}…` : text;
  // Mini closes even when the toast can't be shown.
  await api.invoke('side:toast', { text: short, ms: 3500 }).catch(() => undefined);
  await api.invoke('side:mini.close').catch(() => undefined);
}

/** Closing Mini: not in the middle of checking with Chrome, and a line typed for tomorrow is kept, not dropped. */
async function closeMini() {
  if (view.name === 'checking') return;
  if (view.name === 'done' && line.trim()) return saveLine(view.sa.id);
  await api.invoke('side:mini.close').catch(() => undefined);
}

/** Saves the line for tomorrow (or none). A failed save says so and leaves Mini open, so the words are not lost. */
async function saveLine(id: string | undefined) {
  const text = line.trim();
  let ok = true;
  try {
    const r = await api.invoke<{ error?: string } | null>('side:wrapup.tomorrow', { id, line: text || null });
    ok = !(r && typeof r === 'object' && 'error' in r);
  } catch {
    ok = false;
  }
  if (!ok) return void api.invoke('side:toast', { text: t("Couldn't save your question. Try again."), ms: 3500 }).catch(() => undefined);
  return toastAndClose(text ? t('Saved your question. See you tomorrow.') : t('Set aside. See you tomorrow.'));
}

// ---- Ask sidy: one line → at most one fixed action, run as its own button would run it ----

async function askNow() {
  const line = (app.querySelector<HTMLInputElement>('#ask')?.value ?? '').trim();
  if (!line || home.ask?.state === 'asking') return;
  home = { ...home, notice: undefined, ask: { line, state: 'asking' } };
  render();
  let r: { decision?: AskDecision; latest?: boolean; error?: string } | null;
  try {
    r = await api.invoke<{ decision?: AskDecision; latest?: boolean; error?: string }>('side:ask', { line });
  } catch {
    r = null;
  }
  // A newer ask, or a different screen by now: this answer is not applied.
  if (view.name !== 'home' || home.ask?.line !== line || r?.latest === false) return;
  if (!r || !r.decision) {
    home = { ...home, notice: t("Couldn't ask sidy just now. Try again."), ask: { line, state: 'idle' } };
    return render();
  }
  if (r.decision.kind === 'action') {
    home = { ...home, ask: { line: '', state: 'idle' } };
    return askDo(r.decision.action, r.decision.minutes);
  }
  home = { ...home, ask: { line, state: 'reply', reply: r.decision } };
  render();
}

async function askDo(id: AskActionId, minutes: 30 | 60 | null = null) {
  home = { ...home, ask: { line: '', state: 'idle' } };
  if (id === 'open_step' && !state?.step) {
    home = { ...home, notice: t("There's no next step yet. It's made after you set today aside.") };
    return render();
  }
  if (id === 'quiet_hour') home = { ...home, notice: t("Quiet for 1 hour. sidy won't start talking until then; a check-in you asked for still comes.") };
  const el = document.createElement('button');
  el.dataset.act = actFor(id);
  if (state?.step) el.dataset.step = state.step.id;
  if (minutes) el.dataset.min = String(minutes);
  await act(el);
  render();
}

async function act(el: HTMLElement) {
  const a = el.dataset.act;
  const key = el.dataset.key ?? '';
  switch (a) {
    case 'close': return void closeMini();
    case 'rename':
      wrap = { ...wrap, renaming: key };
      render();
      return focusRename();
    case 'ask': return void askNow();
    case 'ask-do': return void askDo(el.dataset.action as AskActionId);
    case 'ask-copy':
      await navigator.clipboard.writeText(el.dataset.text ?? '').catch(() => undefined);
      el.textContent = t('Copied');
      return;
    case 'open-main': await api.invoke('side:open.main').catch(() => undefined); return void api.invoke('side:mini.close').catch(() => undefined);
    case 'home': home = {}; return go({ name: 'home' });
    case 'wrap': return void startWrap();
    case 'toggle':
      wrap.open = wrap.open.includes(key) ? wrap.open.filter((k) => k !== key) : [...wrap.open, key];
      return render();
    case 'mode':
      wrap.close = el.dataset.mode === 'close' ? [...new Set([...wrap.close, key])] : wrap.close.filter((k) => k !== key);
      return render();
    case 'confirm': {
      if (view.name !== 'preview') return;
      // A name typed but not saved yet is saved first, so Set aside uses it.
      const form = app.querySelector<HTMLFormElement>('form.rn');
      if (form) await saveRename(form);
      if (view.name === 'preview') return void confirm(view.p);
      return;
    }
    case 'retry':
      if (view.name !== 'failed') return;
      if (view.retryId) {
        const p = view.p;
        const id = view.retryId;
        go({ name: 'checking', p: p ?? EMPTY_PREVIEW });
        return afterWrap(await wrapCall('side:wrapup.retry', { id }), p, id);
      }
      return view.p && view.f.kind === 'storage_failed' ? void confirm(view.p) : void startWrap();
    case 'retry-last': {
      // From home: the last wrap-up Chrome never confirmed, run again (tabs already set aside are skipped).
      const id = el.dataset.id;
      if (!id || view.name !== 'home') return;
      go({ name: 'checking', p: EMPTY_PREVIEW });
      return afterWrap(await wrapCall('side:wrapup.retry', { id }), null, id);
    }
    case 'undo': {
      const id = el.dataset.id ?? state?.lastWrapup?.id;
      if (!id) return;
      home = { notice: t('Checking with Chrome…') };
      go({ name: 'home' });
      let r: { kind?: string; reopened?: number; message?: string } | null;
      try {
        r = await api.invoke<{ kind?: string; reopened?: number; message?: string }>('side:wrapup.undo', { id });
      } catch {
        r = null;
      }
      if (view.name !== 'home') return;
      home = {
        notice:
          r?.kind === 'undone' ? (r.reopened ? t('Brought your tabs back, including {n} that were closed.', { n: r.reopened }) : t('Brought your tabs back.'))
          : r?.kind === 'failed' ? t("Chrome couldn't undo it: {message}", { message: r.message ?? '' })
          : r?.kind === 'not_latest' ? t('Only the last wrap-up can be undone.')
          : r?.kind === 'storage_failed' ? t("Brought your tabs back in Chrome, but couldn't note it on this computer. Look at the tab bar.")
          : t("Chrome didn't answer. Look at the tab bar, or try again."),
      };
      return render();
    }
    case 'save-line': return saveLine(el.dataset.id);
    case 'chip':
      // Picking again replaces the line: only the last value is kept.
      line = el.dataset.text ?? '';
      return render();
    case 'skip':
      await api.invoke('side:wrapup.tomorrow', { id: el.dataset.id, line: null }).catch(() => undefined);
      return toastAndClose(t('Set aside. See you tomorrow.'));
    case 'step-open': {
      if (home.stepBusy) return;
      // The app may take up to 30 s: say it is opening, and don't take a second press.
      home = { ...home, stepBusy: true };
      render();
      let r: StepOpenReply;
      try {
        r = (await api.invoke<StepOpenReply | { error: string } | null>('side:step.open', { stepId: el.dataset.step })) as StepOpenReply;
        if (!r || 'error' in r) r = { kind: 'unconfirmed' };
      } catch {
        r = { kind: 'unconfirmed' };
      }
      home = { ...home, stepBusy: false };
      if (view.name === 'home') render();
      return toastAndClose(stepOpenedText(r));
    }
    case 'hide': return void api.invoke('side:hide', { hidden: true });
    case 'focus': await api.invoke('side:focus', { minutes: 60 }); return;
    case 'focus-end': await api.invoke('side:focus', { minutes: null }); return;
    case 'check':
      home = { checking: true };
      render();
      await api.invoke('side:check.connection');
      home = {};
      return render();
    case 'one-more':
      await api.invoke('side:onemore').catch(() => undefined);
      return go({ name: 'onemore', minutes: el.dataset.min === '30' ? 30 : 60 });
    case 'pick': return go({ name: 'onemore', minutes: el.dataset.min === '30' ? 30 : 60 });
    case 'promise': {
      const minutes = el.dataset.min === '30' ? 30 : 60;
      try {
        await api.invoke('side:onemore.choose', { minutes });
      } catch {
        return void api.invoke('side:toast', { text: t("Couldn't set the check-in. Try again."), ms: 3500 }).catch(() => undefined);
      }
      return toastAndClose(t("Okay. I'll check in once, at {time}.", { time: clock((state?.now ?? Date.now()) + minutes * 60_000) }));
    }
  }
}

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (el && el.getAttribute('aria-disabled') !== 'true') void act(el);
});
// Drag to regroup before confirming: a tab onto another group moves it; a group's header onto
// another group merges them. Built on pointer events: macOS panel windows (Mini is one) start a
// native HTML5 drag but never deliver its drop. The app edits the draft it will confirm.
type Drag = { kind: 'tab'; id: number; label: string } | { kind: 'group'; key: string; label: string };
let press: { drag: Drag; x: number; y: number; source: HTMLElement } | null = null;
let ghost: HTMLElement | null = null;
let suppressClick = false;
const clearDrop = () => app.querySelectorAll('.drop-over').forEach((n) => n.classList.remove('drop-over'));
const targetAt = (x: number, y: number) => (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>('[data-drop]') ?? null;
const sameGroup = (d: Drag, g: HTMLElement) => d.kind === 'group' && d.key === g.dataset.drop;
const markDrop = (x: number, y: number) => {
  const g = targetAt(x, y);
  clearDrop();
  if (press && g && !sameGroup(press.drag, g)) g.classList.add('drop-over');
};

// Holding a dragged tab near the top or bottom of the list scrolls it, so every group can be
// reached when the list is taller than the screen.
let pointer = { x: 0, y: 0 };
let scrollStep = 0;
let scrollFrame = 0;
function edgeScroll() {
  const r = app.querySelector('.pb')?.getBoundingClientRect();
  const zone = 48;
  scrollStep = !r ? 0
    : pointer.y < r.top + zone ? -Math.min(18, Math.ceil((r.top + zone - pointer.y) / 3))
    : pointer.y > r.bottom - zone ? Math.min(18, Math.ceil((pointer.y - (r.bottom - zone)) / 3))
    : 0;
  if (scrollStep && !scrollFrame) scrollFrame = requestAnimationFrame(scrollTick);
}
function scrollTick() {
  scrollFrame = 0;
  const pb = app.querySelector<HTMLElement>('.pb');
  if (!press || !ghost || !scrollStep || !pb) return;
  pb.scrollTop += scrollStep;
  markDrop(pointer.x, pointer.y); // the groups moved under a still pointer
  scrollFrame = requestAnimationFrame(scrollTick);
}
function endDragVisuals() {
  ghost?.remove();
  ghost = null;
  scrollStep = 0;
  cancelAnimationFrame(scrollFrame);
  scrollFrame = 0;
  app.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  clearDrop();
}

app.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || view.name !== 'preview') return;
  const el = e.target as HTMLElement;
  if (el.closest('.seg, .rn-btn, .rn')) return; // Fold / Close, Rename and the name box are not handles
  const tab = el.closest<HTMLElement>('[data-tab]');
  const group = el.closest<HTMLElement>('[data-drag-group]');
  if (tab) press = { drag: { kind: 'tab', id: Number(tab.dataset.tab), label: tab.textContent ?? '' }, x: e.clientX, y: e.clientY, source: tab };
  else if (group) press = { drag: { kind: 'group', key: group.dataset.dragGroup ?? '', label: group.querySelector('.n')?.textContent ?? '' }, x: e.clientX, y: e.clientY, source: group };
});
function cancelDrag() {
  press = null;
  endDragVisuals();
}

window.addEventListener('pointermove', (e) => {
  if (!press) return;
  // The button came up where this window never heard it (another app, a closed Mini).
  if (!(e.buttons & 1)) return cancelDrag();
  if (!ghost) {
    if (Math.hypot(e.clientX - press.x, e.clientY - press.y) < 5) return; // still a click
    ghost = document.createElement('div');
    ghost.className = 'drag-ghost';
    ghost.textContent = press.drag.label;
    document.body.appendChild(ghost);
    (press.drag.kind === 'tab' ? press.source : press.source.closest('.g'))?.classList.add('dragging');
  }
  ghost.style.left = `${e.clientX + 12}px`;
  ghost.style.top = `${e.clientY + 10}px`;
  pointer = { x: e.clientX, y: e.clientY };
  markDrop(e.clientX, e.clientY);
  edgeScroll();
});
// The system took the pointer away, or the window lost it: drop nothing.
window.addEventListener('pointercancel', cancelDrag);
window.addEventListener('blur', cancelDrag);
window.addEventListener('pointerup', async (e) => {
  const p = press;
  press = null;
  if (!p || !ghost) return; // a plain click goes through as usual
  suppressClick = true; // the click that ends a drag must not toggle the group
  setTimeout(() => (suppressClick = false), 0);
  const g = targetAt(e.clientX, e.clientY);
  endDragVisuals();
  if (!g || view.name !== 'preview' || sameGroup(p.drag, g)) return;
  const to = g.dataset.drop ?? '';
  // The dashed box at the end starts a new group with that one tab; a whole group can't go there.
  if (to === '__new' && p.drag.kind !== 'tab') return;
  const before = new Set(view.p.groups.map((x) => x.key));
  const op = to === '__new' && p.drag.kind === 'tab' ? { op: 'new', tabId: p.drag.id }
    : p.drag.kind === 'tab' ? { op: 'move', tabId: p.drag.id, to } : { op: 'merge', from: p.drag.key, into: to };
  const next = await api.invoke<PreviewView | { error: string }>('side:wrapup.edit', op).catch(() => null);
  if (!next || 'error' in next || !('groups' in next) || view.name !== 'preview') return;
  const keys = new Set(next.groups.map((x) => x.key));
  const made = next.groups.find((x) => !before.has(x.key))?.key;
  const shown = made ?? to;
  // A new group opens with its name ready to type. A group that just gained tabs goes back to
  // Fold: Close covers only tabs the user saw in that list when picking it.
  wrap = { close: wrap.close.filter((k) => keys.has(k) && k !== to), open: [...new Set([...wrap.open.filter((k) => keys.has(k)), shown])], renaming: made };
  go({ name: 'preview', p: next });
  if (made) focusRename();
});
app.addEventListener('click', (e) => {
  if (suppressClick) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

// Enter in the name box submits its form; an Enter that only finishes an IME syllable does not.
function focusRename() {
  const i = app.querySelector<HTMLInputElement>('#rn');
  i?.focus();
  i?.select();
}

async function saveRename(form: HTMLFormElement) {
  const key = form.dataset.key ?? '';
  const name = form.querySelector<HTMLInputElement>('#rn')?.value ?? '';
  wrap = { ...wrap, renaming: undefined };
  if (view.name !== 'preview') return;
  const next = await api.invoke<PreviewView | { error: string }>('side:wrapup.edit', { op: 'rename', key, name }).catch(() => null);
  // The user may have left the preview while the app answered.
  if (view.name !== 'preview') return;
  go({ name: 'preview', p: next && 'groups' in next ? next : view.p });
}

app.addEventListener('submit', (e) => {
  const form = (e.target as HTMLElement).closest<HTMLFormElement>('form.rn');
  if (!form) return;
  e.preventDefault();
  void saveRename(form);
});

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && press) return cancelDrag();
  if (e.key === 'Escape' && wrap.renaming) {
    // Escape leaves the name as it was.
    wrap = { ...wrap, renaming: undefined };
    return render();
  }
  if (e.key === 'Escape') void closeMini();
});

api.onState((s) => {
  const languageChanged = drawnLanguage !== undefined && s.settings.language !== drawnLanguage;
  state = s;
  // Live updates refresh home; a Wrap up in progress keeps its own screen, in the language shown.
  if (view.name === 'home' || view.name === 'done' || view.name === 'onemore' || languageChanged) pushedRender();
});
api.onMiniView((v) => {
  home = {};
  drawnScreen = null; // opened again: start at the top
  if (v === 'wrap') return void startWrap();
  if (v === 'onemore') return go({ name: 'onemore', minutes: 60 });
  go({ name: 'home' });
});

// Headless captures: ?view= picks a frozen state.
if (api.fixture) {
  const v = api.params.get('view');
  const sa: SetAside = {
    id: 'sa9', endedAt: 0, tabs: [], groups: [], kept: [], userLine: null, todayDone: ['Set aside 31 tabs in 3 groups.'], closeRequested: false, status: 'applied',
    result: { grouped: [{ key: 'g1', chromeGroupId: 1, tabIds: Array.from({ length: 12 }, (_, i) => i) }, { key: 'g2', chromeGroupId: 2, tabIds: Array.from({ length: 11 }, (_, i) => 20 + i) }, { key: 'g3', chromeGroupId: 3, tabIds: Array.from({ length: 8 }, (_, i) => 40 + i) }], closed: [], kept: [] },
  };
  state = FIXTURES[api.params.get('state') ?? 'night'] ?? FIXTURES.night;
  const P = api.params.get('state') === 'long' ? FIXTURE_PREVIEW_LONG : api.params.get('state') === 'files' ? FIXTURE_PREVIEW_FILES : FIXTURE_PREVIEW;
  if (v === 'ask-asking') home = { ask: { line: "I'm done for today", state: 'asking' } };
  if (v === 'ask-menu') home = { ask: { line: 'order the groceries', state: 'reply', reply: { kind: 'declined', reason: 'outside_action', by: 'claude' } } };
  if (v === 'ask-howto') home = { ask: { line: 'how do I do a VLOOKUP in Excel', state: 'reply', reply: { kind: 'how_to', search: 'Excel VLOOKUP tutorial', by: 'claude' } } };
  if (v === 'preview') view = { name: 'preview', p: P };
  if (v === 'preview-rename') { wrap = { close: [], open: [], renaming: 'g2' }; view = { name: 'preview', p: P }; }
  if (v === 'preview-close') { wrap = { close: ['g1'], open: [] }; view = { name: 'preview', p: P }; }
  if (v === 'checking') view = { name: 'checking', p: FIXTURE_PREVIEW };
  if (v === 'done') view = { name: 'done', sa };
  if (v === 'failed') view = { name: 'failed', f: { kind: 'unconfirmed' }, retryId: 'sa9', p: FIXTURE_PREVIEW };
  if (v === 'save-failed') view = { name: 'failed', f: { kind: 'storage_failed', message: '' }, retryId: null, p: FIXTURE_PREVIEW };
  if (v === 'onemore') view = { name: 'onemore', minutes: 60 };
  if (v === 'preview-drag') {
    wrap = { close: [], open: ['g1'] };
    view = { name: 'preview', p: P };
  }
  render();
  if (v === 'preview-drag') {
    app.querySelectorAll('.g')[1]?.classList.add('drop-over');
    app.querySelector('.tl2 li')?.classList.add('dragging');
    const r = app.querySelectorAll('.g')[1]?.getBoundingClientRect();
    const gh = document.createElement('div');
    gh.className = 'drag-ghost';
    gh.textContent = app.querySelector('.tl2 li')?.textContent ?? '';
    if (r) Object.assign(gh.style, { left: `${r.left + 120}px`, top: `${r.top + 34}px` });
    document.body.appendChild(gh);
  }
} else {
  void api.invoke<ViewState>('side:state').then((s) => {
    state = s;
    render();
  });
}
