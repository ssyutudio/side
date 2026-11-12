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

  it('turns a quiet window with the same start and end off instead of showing it as on', () => {
    expect(sanitizeSettings({ ...defaultSettings(), quietHours: { start: 480, end: 480 } }).quietHours).toBeNull();
    expect(sanitizeSettings({ ...defaultSettings(), quietHours: { start: 1320, end: 480 } }).quietHours).toEqual({ start: 1320, end: 480 });
  });

  it('falls back to small for an unknown sidy size', () => {
    expect(sanitizeSettings({ ...defaultSettings(), sidySize: 'huge' as never }).sidySize).toBe('small');
  });

  it('keeps a dragged sidy spot between 0 and 1 and drops anything else', () => {
    expect(sanitizeSettings({ ...defaultSettings(), sidyAnchor: 0.25 }).sidyAnchor).toBe(0.25);
    expect(sanitizeSettings({ ...defaultSettings(), sidyAnchor: 4 }).sidyAnchor).toBeUndefined();
    expect(sanitizeSettings({ ...defaultSettings(), sidyAnchor: 'x' as never }).sidyAnchor).toBeUndefined();
  });
});
