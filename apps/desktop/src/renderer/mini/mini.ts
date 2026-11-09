// Mini window glue: a small state machine for home -> Wrap up -> result, and One more hour.
// Every action goes through the app's validated routes; the screen only says what came back.
import type { ViewState } from '../../main/viewState';
import type { PreviewView } from '../../main/controller';
import type { SetAside } from '@side/shared';
import { getApi } from '../shared/api';
import { FIXTURE_PREVIEW, FIXTURE_PREVIEW_FILES, FIXTURE_PREVIEW_LONG, FIXTURES } from '../shared/fixtures';
import { homeView, type HomeLocal } from './homeView';
import { checkingView, doneView, failedView, loadingView, previewView, type Failure, type WrapLocal } from './wrapView';
import { oneMoreView } from './oneMoreView';
import { clock } from './parts';
import { stepOpenedText, type StepOpenReply } from '../shared/stepText';

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
const app = document.getElementById('app')!;
let state: ViewState | null = null;
let view: View = { name: 'home' };
let wrap: WrapLocal = { close: [], open: [] };
let line = '';
let suggestions: string[] = [];
let home: HomeLocal = {};

function render() {
  if (!state) return;
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
  // Room on every side so the panel's shadow fades out inside the window instead of being cut
  // into a visible box at the window edge.
  app.innerHTML = `<div class="mini-room">${h}</div>`;
  const panel = app.querySelector<HTMLElement>('.panel');
  if (panel) void api.invoke('side:mini.resize', { height: Math.ceil(panel.getBoundingClientRect().height) + 2 * MINI_ROOM });
  app.querySelector<HTMLInputElement>('#tm')?.addEventListener('input', (e) => (line = (e.target as HTMLInputElement).value));
}

function go(v: View) {
  view = v;
  render();
}

async function loadSuggestions(id: string) {
  const r = await api.invoke<{ suggestions?: string[] }>('side:wrapup.suggest', { id });
  // Only if the user is still on that result.
  if (view.name === 'done' && view.sa.id === id && r?.suggestions?.length) {
    suggestions = r.suggestions;
    render();
  }
}

function afterWrap(out: WrapOut, p: PreviewView | null) {
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
  go({ name: 'failed', f, retryId: out.setAside?.id ?? null, p });
}

async function startWrap() {
  wrap = { close: [], open: [] };
  line = '';
  go({ name: 'loading' });
  const p = await api.invoke<PreviewView | { error: string }>('side:wrapup.preview');
  if (!p || 'error' in p) return go({ name: 'failed', f: { kind: 'not_connected' }, retryId: null, p: null });
  go({ name: 'preview', p });
}

async function confirm(p: PreviewView) {
  go({ name: 'checking', p });
  afterWrap(await api.invoke<WrapOut>('side:wrapup.confirm', { closeGroupKeys: wrap.close }), p);
}

async function toastAndClose(text: string) {
  await api.invoke('side:toast', { text, ms: 3500 });
  await api.invoke('side:mini.close');
}

async function act(el: HTMLElement) {
  const a = el.dataset.act;
  const key = el.dataset.key ?? '';
  switch (a) {
    case 'close': return void api.invoke('side:mini.close');
    case 'open-main': await api.invoke('side:open.main'); return void api.invoke('side:mini.close');
    case 'home': home = {}; return go({ name: 'home' });
    case 'wrap': return void startWrap();
    case 'toggle':
      wrap.open = wrap.open.includes(key) ? wrap.open.filter((k) => k !== key) : [...wrap.open, key];
      return render();
    case 'mode':
      wrap.close = el.dataset.mode === 'close' ? [...new Set([...wrap.close, key])] : wrap.close.filter((k) => k !== key);
      return render();
    case 'confirm': if (view.name === 'preview') return void confirm(view.p); return;
    case 'retry':
      if (view.name !== 'failed') return;
      if (view.retryId) {
        const p = view.p;
        go({ name: 'checking', p: p ?? { groups: [], kept: [], alreadySetAside: 0, skipped: { excluded: 0, incognito: 0, internal: 0 }, foldCount: 0 } });
        return afterWrap(await api.invoke<WrapOut>('side:wrapup.retry', { id: view.retryId }), p);
      }
      return view.p && view.f.kind === 'storage_failed' ? void confirm(view.p) : void startWrap();
    case 'undo': {
      const id = el.dataset.id ?? state?.lastWrapup?.id;
      if (!id) return;
      home = { notice: 'Checking with Chrome…' };
      go({ name: 'home' });
      const r = await api.invoke<{ kind: string; reopened?: number; message?: string }>('side:wrapup.undo', { id });
      home = {
        notice:
          r.kind === 'undone' ? `Brought your tabs back${r.reopened ? `, including ${r.reopened} that were closed` : ''}.`
          : r.kind === 'failed' ? `Chrome couldn't undo it: ${r.message ?? ''}`
          : r.kind === 'not_latest' ? 'Only the last wrap-up can be undone.'
          : "Chrome didn't answer. Look at the tab bar, or try again.",
      };
      return render();
    }
    case 'save-line':
      await api.invoke('side:wrapup.tomorrow', { id: el.dataset.id, line: line.trim() || null });
      return toastAndClose(line.trim() ? 'Saved your question. See you tomorrow.' : 'Set aside. See you tomorrow.');
    case 'chip':
      // Picking again replaces the line: only the last value is kept.
      line = el.dataset.text ?? '';
      return render();
    case 'skip':
      await api.invoke('side:wrapup.tomorrow', { id: el.dataset.id, line: null });
      return toastAndClose('Set aside. See you tomorrow.');
    case 'step-open': {
      const r = await api.invoke<StepOpenReply>('side:step.open', { stepId: el.dataset.step });
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
      await api.invoke('side:onemore');
      return go({ name: 'onemore', minutes: 60 });
    case 'pick': return go({ name: 'onemore', minutes: el.dataset.min === '30' ? 30 : 60 });
    case 'promise': {
      const minutes = el.dataset.min === '30' ? 30 : 60;
      await api.invoke('side:onemore.choose', { minutes });
      return toastAndClose(`Okay. I'll check in once, at ${clock((state?.now ?? Date.now()) + minutes * 60_000)}.`);
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

app.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || view.name !== 'preview') return;
  const el = e.target as HTMLElement;
  if (el.closest('.seg')) return; // Fold / Close buttons are not handles
  const tab = el.closest<HTMLElement>('[data-tab]');
  const group = el.closest<HTMLElement>('[data-drag-group]');
  if (tab) press = { drag: { kind: 'tab', id: Number(tab.dataset.tab), label: tab.textContent ?? '' }, x: e.clientX, y: e.clientY, source: tab };
  else if (group) press = { drag: { kind: 'group', key: group.dataset.dragGroup ?? '', label: group.querySelector('.n')?.textContent ?? '' }, x: e.clientX, y: e.clientY, source: group };
});
window.addEventListener('pointermove', (e) => {
  if (!press) return;
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
  const g = targetAt(e.clientX, e.clientY);
  clearDrop();
  if (g && !sameGroup(press.drag, g)) g.classList.add('drop-over');
});
window.addEventListener('pointerup', async (e) => {
  const p = press;
  press = null;
  if (!p || !ghost) return; // a plain click goes through as usual
  ghost.remove();
  ghost = null;
  suppressClick = true; // the click that ends a drag must not toggle the group
  setTimeout(() => (suppressClick = false), 0);
  app.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
  const g = targetAt(e.clientX, e.clientY);
  clearDrop();
  if (!g || view.name !== 'preview' || sameGroup(p.drag, g)) return;
  const to = g.dataset.drop ?? '';
  const op = p.drag.kind === 'tab' ? { op: 'move', tabId: p.drag.id, to } : { op: 'merge', from: p.drag.key, into: to };
  const next = await api.invoke<PreviewView | { error: string }>('side:wrapup.edit', op);
  if (!next || 'error' in next || !('groups' in next)) return;
  const keys = new Set(next.groups.map((x) => x.key));
  wrap = { close: wrap.close.filter((k) => keys.has(k)), open: [...new Set([...wrap.open.filter((k) => keys.has(k)), to])] };
  go({ name: 'preview', p: next });
});
app.addEventListener('click', (e) => {
  if (suppressClick) {
    e.stopPropagation();
    e.preventDefault();
  }
}, true);

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') void api.invoke('side:mini.close');
});

api.onState((s) => {
  state = s;
  // Live updates refresh home; a Wrap up in progress keeps its own screen.
  if (view.name === 'home' || view.name === 'done' || view.name === 'onemore') render();
});
api.onMiniView((v) => {
  home = {};
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
  if (v === 'preview') view = { name: 'preview', p: P };
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
