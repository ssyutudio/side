// Main window: reads the view state from the app, renders the chosen section, and sends the
// user's actions back. Opened as a plain page it uses fixtures (?state=, ?section=, ?mode=).
import type { ViewState } from '../../main/viewState';
import { normalizeDomain } from '@side/shared/src/domain';
import { getApi } from '../shared/api';
import { applyLanguage } from '../shared/lang';
import { t } from '../../i18n';
import { SECTIONS, errorView, loadingView, shellView, type Section } from './shell';
import { todayView } from './today';
import { historyView } from './history';
import { excludedView } from './excluded';
import { sawView } from './saw';
import { settingsView } from './settings';
import type { SafeHtml } from '../shared/html';

const api = getApi();
const root = document.getElementById('app')!;
const startSection = api.params.get('section') as Section | null;

let section: Section = startSection && SECTIONS.includes(startSection) ? startSection : 'today';
let state: ViewState | null = null;
let failed = api.params.get('mode') === 'error';
const forceLoading = api.params.get('mode') === 'loading';
const local = {
  showAll: false,
  exInput: '',
  exError: null as string | null,
  appsOpen: api.params.get('apps') === 'open',
  /** History days left open, so a redraw doesn't fold what the user opened. Null until they touch one. */
  daysOpen: null as Set<string> | null,
  /** The quiet hours last turned off here, offered again when switched back on. */
  lastQuiet: null as { start: number; end: number } | null,
};

function body(s: ViewState): SafeHtml {
  switch (section) {
    case 'history':
      return historyView(s, local.daysOpen);
    case 'excluded':
      return excludedView(s, { input: local.exInput, error: local.exError });
    case 'saw':
      return sawView(s, { showAll: local.showAll });
    case 'settings':
      return settingsView(s, { appsOpen: local.appsOpen });
    default:
      return todayView(s);
  }
}

/** A selector for the focused control, so a redraw can give focus back (switches have no id). */
function focusKey(el: HTMLElement | null): string | null {
  if (!el || el === document.body) return null;
  if (el.id) return `#${CSS.escape(el.id)}`;
  const a = el.dataset.act;
  if (!a) return null;
  const extra = ['key', 'app', 'size', 'lang', 'cmd', 'domain'].map((k) => (el.dataset[k] ? `[data-${k}="${CSS.escape(el.dataset[k]!)}"]` : '')).join('');
  return `[data-act="${CSS.escape(a)}"]${extra}`;
}

let drawnSection: string | null = null;

function render() {
  applyLanguage(api, state);
  const focus = focusKey(document.activeElement as HTMLElement | null);
  // A redraw in the same section (a switch flipped, a state update) keeps the scroll position.
  const scroll = drawnSection === section ? (document.getElementById('content')?.scrollTop ?? 0) : 0;
  const content = failed ? errorView(section) : !state || forceLoading ? loadingView(section) : body(state);
  root.innerHTML = String(shellView(section, state, content));
  drawnSection = section;
  const box = document.getElementById('content');
  if (box && scroll) box.scrollTop = scroll;
  if (focus) root.querySelector<HTMLElement>(focus)?.focus({ preventScroll: true });
}

async function load() {
  try {
    const s = await api.invoke<ViewState | { error: string }>('side:state');
    if (!s || 'error' in s) failed = true;
    else {
      state = s;
      failed = api.params.get('mode') === 'error';
    }
  } catch {
    failed = true;
  }
  render();
}

function setSettings(patch: Record<string, unknown>) {
  void api.invoke('side:settings.set', patch).catch(() => undefined);
}

root.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el || el.tagName === 'FORM' || el.tagName === 'INPUT') return;
  const act = el.dataset.act;
  switch (act) {
    case 'nav': {
      const next = el.dataset.section as Section;
      if (SECTIONS.includes(next)) {
        section = next;
        const p = new URLSearchParams(location.search);
        p.set('section', next);
        history.replaceState(null, '', `?${p}`);
        render();
        document.getElementById('content')?.scrollTo(0, 0);
      }
      break;
    }
    case 'step-open':
      void api.invoke('side:step.open', { stepId: el.dataset.step });
      break;
    case 'wrap':
      void api.invoke('side:mini.open', { view: 'wrap' });
      break;
    case 'saw-all':
      local.showAll = !local.showAll;
      render();
      break;
    case 'exclude-remove':
      if (state) setSettings({ excludedDomains: state.settings.excludedDomains.filter((d) => d !== el.dataset.domain) });
      break;
    case 'size':
      setSettings({ sidySize: el.dataset.size });
      break;
    case 'lang':
      setSettings({ language: el.dataset.lang === 'ko' ? 'ko' : 'en' });
      break;
    case 'toggle':
      if (state && (el.dataset.key === 'llmEnabled' || el.dataset.key === 'uploadEnabled')) {
        setSettings({ [el.dataset.key]: !state.settings[el.dataset.key] });
      }
      if (state && el.dataset.key === 'reactions') setSettings({ reactions: state.settings.reactions === false });
      break;
    case 'demo':
      void api.invoke('side:demo', { cmd: el.dataset.cmd });
      break;
    case 'quiet-toggle': {
      // Off keeps the times in mind for this window, so turning it back on brings the same hours.
      const q = state?.settings.quietHours;
      if (q) local.lastQuiet = q;
      setSettings({ quietHours: q ? null : (local.lastQuiet ?? { start: 22 * 60, end: 8 * 60 }) });
      break;
    }
    case 'check':
      void api.invoke('side:check.connection').finally(load);
      void api.invoke('side:connections.refresh');
      break;
    case 'pair-reset':
      void api.invoke('side:pairing.reset').finally(() => void api.invoke('side:check.connection').finally(load));
      break;
    case 'apps-show':
      local.appsOpen = !local.appsOpen;
      render();
      break;
    case 'conn-refresh':
      void api.invoke('side:connections.refresh');
      break;
    case 'cal-toggle':
      void api.invoke('side:calendar.set', { on: el.dataset.on !== '1' });
      break;
    case 'app-toggle':
      if (el.dataset.app) void api.invoke('side:apps.set', { id: el.dataset.app, on: el.dataset.on !== '1' });
      break;
    case 'retry':
      failed = false;
      render();
      void load();
      break;
    case 'reveal':
      void api.invoke('side:data.reveal');
      break;
  }
});

root.addEventListener('change', (e) => {
  const el = e.target as HTMLSelectElement;
  if (!state || el.tagName !== 'SELECT') return;
  const v = Number(el.value);
  if (!Number.isInteger(v) || v < 0 || v >= 1440) return;
  const q = state.settings.quietHours;
  if (el.dataset.act === 'wake') setSettings({ wakeMinutes: v });
  if (el.dataset.act === 'quiet-start' && q) setSettings({ quietHours: { start: v, end: q.end } });
  if (el.dataset.act === 'quiet-end' && q) setSettings({ quietHours: { start: q.start, end: v } });
});

root.addEventListener('input', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id === 'exclude-domain') local.exInput = el.value;
});

root.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!state) return;
  const d = normalizeDomain(local.exInput);
  if (!d) local.exError = t("That doesn't look like a site address. Try something like mybank.com.");
  else if (state.settings.excludedDomains.includes(d)) local.exError = t('{d} is already excluded.', { d });
  else {
    local.exError = null;
    local.exInput = '';
    setSettings({ excludedDomains: [...state.settings.excludedDomains, d] });
  }
  render();
});

// <details> toggles don't bubble; listen while they travel down.
root.addEventListener(
  'toggle',
  (e) => {
    const d = e.target as HTMLDetailsElement;
    if (d.tagName !== 'DETAILS' || !d.dataset.day) return;
    local.daysOpen ??= new Set([...root.querySelectorAll<HTMLDetailsElement>('details[data-day][open]')].map((x) => x.dataset.day!));
    if (d.open) local.daysOpen.add(d.dataset.day);
    else local.daysOpen.delete(d.dataset.day);
  },
  true,
);

root.addEventListener('focusout', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id !== 'exclude-domain' || !local.exInput.trim()) return;
  // Focus is moving to the Add button: its submit checks the address, and a redraw now would
  // pull the button out from under the click.
  const next = (e as FocusEvent).relatedTarget as HTMLElement | null;
  if (next && el.form?.contains(next)) return;
  const msg = normalizeDomain(local.exInput) ? null : t("That doesn't look like a site address. Try something like mybank.com.");
  if (msg !== local.exError) {
    local.exError = msg;
    render();
  }
});

// A pushed update waits only while a dropdown's menu may be open (pressed, nothing picked yet),
// at most 10 s: redrawing would shut the menu. Not while the dropdown merely keeps focus — on
// macOS a click on a button leaves focus on the dropdown, and the screen would stop updating.
const MENU_WAIT_MS = 10_000;
let menuOpen = false;
let redrawAfterMenu = false;
let menuTimer: ReturnType<typeof setTimeout> | undefined;
function menuClosed() {
  menuOpen = false;
  clearTimeout(menuTimer);
  if (redrawAfterMenu) {
    redrawAfterMenu = false;
    setTimeout(render, 0);
  }
}
root.addEventListener('mousedown', (e) => {
  if ((e.target as HTMLElement).tagName !== 'SELECT') return;
  menuOpen = true;
  clearTimeout(menuTimer);
  menuTimer = setTimeout(menuClosed, MENU_WAIT_MS);
});
root.addEventListener('change', (e) => {
  if ((e.target as HTMLElement).tagName === 'SELECT') menuClosed();
});
root.addEventListener('focusout', (e) => {
  if ((e.target as HTMLElement).tagName === 'SELECT') menuClosed();
});
root.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'SELECT' && (e.key === 'Escape' || e.key === 'Enter')) menuClosed();
});

api.onState((s) => {
  state = s;
  if (api.params.get('mode') !== 'error') failed = false;
  if (menuOpen) redrawAfterMenu = true;
  else render();
});

render();
void load();
