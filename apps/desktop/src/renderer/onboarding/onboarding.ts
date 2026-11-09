// First-run window glue: watches the real connection, shows the draft from real tabs once
// connected, and hands over to sidy's first words.
import type { ViewState } from '../../main/viewState';
import type { PreviewView } from '../../main/controller';
import { getApi } from '../shared/api';
import { FIXTURE_PREVIEW } from '../shared/fixtures';
import { onboardingView, type SetupPhase } from './onboardingView';

const api = getApi();
const app = document.getElementById('app')!;
let phase: SetupPhase = 'connecting';
let extPath = 'apps/extension/dist';
let preview: PreviewView | null = null;
let asking = false;
const started = Date.now();

function render() {
  app.innerHTML = String(onboardingView({ phase, extPath, preview }));
}

async function onState(s: ViewState) {
  if (s.connection === 'connected') {
    phase = 'connected';
    render();
    if (!preview && !asking) {
      asking = true;
      const p = await api.invoke<PreviewView | { error: string }>('side:wrapup.preview');
      asking = false;
      if (p && !('error' in p)) preview = p;
    }
  } else if (phase === 'connected') {
    phase = 'failed';
  } else if (Date.now() - started > 6000) {
    phase = 'failed';
  }
  render();
}

app.addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'copy') {
    await navigator.clipboard.writeText(el.dataset.text ?? '').catch(() => undefined);
    el.textContent = 'Copied';
  }
  if (el.dataset.act === 'check') {
    el.textContent = 'Checking…';
    const r = await api.invoke<{ status: string }>('side:check.connection');
    phase = r?.status === 'connected' ? 'connected' : 'failed';
    void api.invoke<ViewState>('side:state').then(onState);
  }
  if (el.dataset.act === 'meet') void api.invoke('side:setup.done');
});

if (api.fixture) {
  phase = (api.params.get('phase') as SetupPhase) ?? 'connecting';
  extPath = '/Users/you/side/apps/extension/dist';
  preview = phase === 'connected' ? FIXTURE_PREVIEW : null;
  render();
} else {
  void api.invoke<{ extPath: string }>('side:setup.info').then((i) => {
    if (i?.extPath) extPath = i.extPath;
    render();
  });
  api.onState((s) => void onState(s));
  void api.invoke<ViewState>('side:state').then(onState);
  // Re-check the "connecting" phase once the grace period is over.
  setTimeout(() => void api.invoke<ViewState>('side:state').then(onState), 6500);
}
