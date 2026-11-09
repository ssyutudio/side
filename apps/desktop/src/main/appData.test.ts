import { defaultAppData, defaultSettings, sanitizeSettings } from './appData';

describe('defaultAppData', () => {
  it('turns the LLM on by default (Director correction) and keeps anonymous upload off', () => {
    const s = defaultSettings();
    expect(s.llmEnabled).toBe(true);
    expect(s.uploadEnabled).toBe(false);
    expect(s.excludedDomains).toEqual([]);
  });

  it('starts with the small sidy and no history', () => {
    const d = defaultAppData();
    expect(d.settings.sidySize).toBe('small');
    expect(d.setAsides).toEqual([]);
    expect(d.steps).toEqual([]);
    expect(d.pairedOrigin).toBeNull();
    expect(d.installId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('gives each install a different id', () => {
    expect(defaultAppData().installId).not.toBe(defaultAppData().installId);
  });
});

describe('sanitizeSettings', () => {
  it('normalizes and de-duplicates excluded domains and drops junk', () => {
    const s = sanitizeSettings({ ...defaultSettings(), excludedDomains: ['https://www.Bank.com/x', 'bank.com', 'not a domain'] });
    expect(s.excludedDomains).toEqual(['bank.com']);
  });

  it('falls back to small for an unknown sidy size', () => {
    expect(sanitizeSettings({ ...defaultSettings(), sidySize: 'huge' as never }).sidySize).toBe('small');
  });
});
