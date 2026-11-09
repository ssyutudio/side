import { FIXTURE_PREVIEW } from '../shared/fixtures';
import { onboardingView } from './onboardingView';

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
