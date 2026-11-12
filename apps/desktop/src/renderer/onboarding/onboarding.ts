// First-run window glue: watches the real connection, shows the draft from real tabs once
// connected, and hands over to sidy's first words.
import type { ViewState } from '../../main/viewState';
import type { PreviewView } from '../../main/controller';
import { getApi } from '../shared/api';
import { applyLanguage } from '../shared/lang';
import { t } from '../../i18n';
import { FIXTURE_PREVIEW } from '../shared/fixtures';
import { onboardingView, type SetupPhase } from './onboardingView';

const api = getApi();
const app = document.getElementById('app')!;
let phase: SetupPhase = 'connecting';
let extPath = 'apps/extension/dist';
let preview: PreviewView | null = null;
let asking = false;
let checking = false;
let state: ViewState | null = null;
const started = Date.now();

function render() {
  applyLanguage(api, state);
  app.innerHTML = String(onboardingView({ phase, extPath, preview, llmAvailable: state?.saw.llm.available }));
}

async function onState(s: ViewState) {
  state = s;
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
    // The tabs may change before Chrome is back: the next connection shows a fresh draft.
    preview = null;
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
    el.textContent = t('Copied');
  }
  if (el.dataset.act === 'check') {
    if (checking) return; // one check at a time
    checking = true;
    el.textContent = t('Checking…');
    const r = await api.invoke<{ status: string }>('side:check.connection').finally(() => (checking = false));
    phase = r?.status === 'connected' ? 'connected' : 'failed';
    void api.invoke<ViewState>('side:state').then(onState);
  }
  if (el.dataset.act === 'meet') void api.invoke('side:setup.done');
  if (el.dataset.act === 'lang') void api.invoke('side:settings.set', { language: el.dataset.lang === 'ko' ? 'ko' : 'en' });
});

if (api.fixture) {
  phase = (api.params.get('phase') as SetupPhase) ?? 'connecting';
  // A realistically long path: short fixture paths hid an overflow the Director caught.
  extPath = '/Users/hosoo/project/ycseoul_hack26/side/apps/extension/dist';
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
