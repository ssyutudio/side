// Mini window glue: a small state machine for home -> Wrap up -> result, and One more hour.
// Every action goes through the app's validated routes; the screen only says what came back.
import type { ViewState } from '../../main/viewState';
import type { PreviewView } from '../../main/controller';
import type { SetAside } from '@side/shared';
import { getApi } from '../shared/api';
import { FIXTURE_PREVIEW, FIXTURE_PREVIEW_LONG, FIXTURES } from '../shared/fixtures';
import { homeView, type HomeLocal } from './homeView';
import { checkingView, doneView, failedView, loadingView, previewView, type Failure, type WrapLocal } from './wrapView';
import { oneMoreView } from './oneMoreView';
import { clock } from './parts';

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
      const r = await api.invoke<{ kind: string; restored?: string; reason?: string }>('side:step.open', { stepId: el.dataset.step });
      const text = r.kind === 'opened' ? (r.restored === 'top' ? "Opened the page. sidy couldn't find the exact spot." : 'Opened where you stopped.')
        : r.kind === 'failed' ? "Chrome couldn't open it."
        : r.reason === 'not_connected' ? "Chrome isn't connected. Open Chrome, then press Step inside again."
        : "Chrome didn't answer, so sidy can't say the page opened.";
      return toastAndClose(text);
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
// another group merges them. The app edits the draft it will confirm, then the preview redraws.
let dragging: { kind: 'tab'; id: number } | { kind: 'group'; key: string } | null = null;
const dropTarget = (e: Event) => (e.target as HTMLElement).closest<HTMLElement>('[data-drop]');
const clearDrop = () => app.querySelectorAll('.drop-over').forEach((n) => n.classList.remove('drop-over'));
app.addEventListener('dragstart', (e) => {
  const el = e.target as HTMLElement;
  const tab = el.closest<HTMLElement>('[data-tab]');
  const group = el.closest<HTMLElement>('[data-drag-group]');
  if (tab) dragging = { kind: 'tab', id: Number(tab.dataset.tab) };
  else if (group) dragging = { kind: 'group', key: group.dataset.dragGroup ?? '' };
  else return;
  e.dataTransfer?.setData('text/plain', 'side');
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  (tab ?? group?.closest('.g'))?.classList.add('dragging');
});
app.addEventListener('dragover', (e) => {
  const g = dropTarget(e);
  if (!dragging || !g) return;
  if (dragging.kind === 'group' && dragging.key === g.dataset.drop) return;
  e.preventDefault();
  if (!g.classList.contains('drop-over')) {
    clearDrop();
    g.classList.add('drop-over');
  }
});
app.addEventListener('dragleave', (e) => {
  const g = dropTarget(e);
  if (g && !g.contains(e.relatedTarget as Node)) g.classList.remove('drop-over');
});
app.addEventListener('dragend', () => {
  dragging = null;
  clearDrop();
  app.querySelectorAll('.dragging').forEach((n) => n.classList.remove('dragging'));
});
app.addEventListener('drop', async (e) => {
  const g = dropTarget(e);
  const d = dragging;
  dragging = null;
  clearDrop();
  if (!g || !d || view.name !== 'preview') return;
  e.preventDefault();
  const to = g.dataset.drop ?? '';
  if (d.kind === 'group' && d.key === to) return;
  const op = d.kind === 'tab' ? { op: 'move', tabId: d.id, to } : { op: 'merge', from: d.key, into: to };
  const next = await api.invoke<PreviewView | { error: string }>('side:wrapup.edit', op);
  if (!next || 'error' in next || !('groups' in next)) return;
  const keys = new Set(next.groups.map((x) => x.key));
  wrap = { close: wrap.close.filter((k) => keys.has(k)), open: [...new Set([...wrap.open.filter((k) => keys.has(k)), to])] };
  go({ name: 'preview', p: next });
});

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
  const P = api.params.get('state') === 'long' ? FIXTURE_PREVIEW_LONG : FIXTURE_PREVIEW;
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
  }
} else {
  void api.invoke<ViewState>('side:state').then((s) => {
    state = s;
    render();
  });
}
