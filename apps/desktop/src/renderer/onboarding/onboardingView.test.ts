import { FIXTURE_PREVIEW } from '../shared/fixtures';
import { onboardingView } from './onboardingView';
import { setLanguage, t, tn } from '../../i18n';
import { KO } from '../../i18n/ko';

const s = (x: unknown) => String(x);
const path = '/Users/someone/side/apps/extension/dist';

describe('onboardingView', () => {
  it('connecting: copy buttons for chrome://extensions and the real folder, looking for the extension', () => {
    const h = s(onboardingView({ phase: 'connecting', extPath: path, preview: null }));
    expect(h).toContain('Set up Side');
    expect(h).toContain('<code>chrome://extensions</code>');
    expect(h).toContain(`<code>${path}</code>`);
    expect(h).toContain('Looking for the extension…');
    expect(h).toContain('Tab titles, your one line and your step counts go to Claude to name groups and pick your next step. Addresses and page text stay on this computer.');
  });

  it('failed: one thing to do and Check again as the only filled button', () => {
    const h = s(onboardingView({ phase: 'failed', extPath: path, preview: null }));
    expect(h).toContain('Not connected yet.');
    expect(h).toContain('data-act="check"');
    expect((h.match(/btn fill/g) ?? []).length).toBe(1);
  });

  it('connected: a draft from the real tabs, nothing changed yet, then Meet sidy', () => {
    const h = s(onboardingView({ phase: 'connected', extPath: path, preview: FIXTURE_PREVIEW }));
    expect(h).toContain('Side is connected');
    expect(h).toContain('Your 35 open tabs, as sidy would fold them');
    expect(h).toContain('Pricing page');
    expect(h).toContain('12 tabs');
    expect(h).toContain('Nothing changes until you choose.');
    expect(h).toContain('data-act="meet"');
  });

  it('never says Mac app or this Mac', () => {
    for (const phase of ['connecting', 'failed', 'connected'] as const) {
      expect(s(onboardingView({ phase, extPath: path, preview: FIXTURE_PREVIEW }))).not.toMatch(/Mac app|this Mac/);
    }
  });
});

describe('onboardingView in Korean', () => {
  const ko = (en: string): string => {
    expect(KO[en], en).toBeTruthy();
    return KO[en];
  };
  afterEach(() => setLanguage('en'));

  it('says each phase in Korean', () => {
    setLanguage('ko');
    const c = s(onboardingView({ phase: 'connecting', extPath: path, preview: null }));
    for (const w of ['Set up Side', 'Looking for the extension…', 'Copy', 'Two minutes.']) expect(c).toContain(ko(w));
    expect(c).not.toContain('Looking for the extension');
    const f = s(onboardingView({ phase: 'failed', extPath: path, preview: null }));
    expect(f).toContain(ko('Not connected yet.'));
    expect(f).toContain(ko('Check again'));
    const d = s(onboardingView({ phase: 'connected', extPath: path, preview: FIXTURE_PREVIEW }));
    for (const w of ['Side is connected', 'Nothing changes until you choose.', 'Meet sidy']) expect(d).toContain(ko(w));
    expect(d).toContain(t('Your {total} open tabs, as sidy would fold them', { total: 35 }));
    expect(d).toContain(tn(12, '{n} tab', '{n} tabs'));
  });
});
