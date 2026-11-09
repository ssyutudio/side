// Main window: reads the view state from the app, renders the chosen section, and sends the
// user's actions back. Opened as a plain page it uses fixtures (?state=, ?section=, ?mode=).
import type { ViewState } from '../../main/viewState';
import { normalizeDomain } from '@side/shared/src/domain';
import { getApi } from '../shared/api';
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
const local = { showAll: false, exInput: '', exError: null as string | null, appsOpen: api.params.get('apps') === 'open' };

function body(s: ViewState): SafeHtml {
  switch (section) {
    case 'history':
      return historyView(s);
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

function render() {
  const keepFocus = (document.activeElement as HTMLElement | null)?.id;
  const content = failed ? errorView() : !state || forceLoading ? loadingView() : body(state);
  root.innerHTML = String(shellView(section, state, content));
  if (keepFocus) document.getElementById(keepFocus)?.focus();
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
    case 'toggle':
      if (state && (el.dataset.key === 'llmEnabled' || el.dataset.key === 'uploadEnabled')) {
        setSettings({ [el.dataset.key]: !state.settings[el.dataset.key] });
      }
      if (state && el.dataset.key === 'reactions') setSettings({ reactions: state.settings.reactions === false });
      break;
    case 'demo':
      void api.invoke('side:demo', { cmd: el.dataset.cmd });
      break;
    case 'quiet-on':
      setSettings({ quietHours: { start: 22 * 60, end: 8 * 60 } });
      break;
    case 'quiet-off':
      setSettings({ quietHours: null });
      break;
    case 'check':
      void api.invoke('side:check.connection').finally(load);
      void api.invoke('side:connections.refresh');
      break;
    case 'apps-show':
      local.appsOpen = !local.appsOpen;
      render();
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
  if (!d) local.exError = "That doesn't look like a site address. Try something like mybank.com.";
  else if (state.settings.excludedDomains.includes(d)) local.exError = `${d} is already excluded.`;
  else {
    local.exError = null;
    local.exInput = '';
    setSettings({ excludedDomains: [...state.settings.excludedDomains, d] });
  }
  render();
});

root.addEventListener('focusout', (e) => {
  const el = e.target as HTMLInputElement;
  if (el.id !== 'exclude-domain' || !local.exInput.trim()) return;
  const msg = normalizeDomain(local.exInput) ? null : "That doesn't look like a site address. Try something like mybank.com.";
  if (msg !== local.exError) {
    local.exError = msg;
    render();
  }
});

api.onState((s) => {
  state = s;
  if (api.params.get('mode') !== 'error') failed = false;
  render();
});

render();
void load();
