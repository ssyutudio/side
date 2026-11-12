import { MINI_RESUME_MS, SAME_CLICK_MS, miniToggle } from './miniToggle';

describe('miniToggle', () => {
  const now = 1_000_000;
  it('closes Mini when it is up', () => {
    expect(miniToggle({ visible: true, exists: true, blurredAt: null, now })).toBe('close');
  });
  it('opens home after an explicit close or on first use', () => {
    expect(miniToggle({ visible: false, exists: true, blurredAt: null, now })).toBe('home');
    expect(miniToggle({ visible: false, exists: false, blurredAt: now - 1000, now })).toBe('home');
  });
  it('treats a toggle right after a blur as the same click on sidy (stays closed)', () => {
    expect(miniToggle({ visible: false, exists: true, blurredAt: now - (SAME_CLICK_MS - 1), now })).toBe('ignore');
  });
  it('brings back the same screen after a click elsewhere, for a few minutes', () => {
    expect(miniToggle({ visible: false, exists: true, blurredAt: now - 60_000, now })).toBe('resume');
    expect(miniToggle({ visible: false, exists: true, blurredAt: now - MINI_RESUME_MS, now })).toBe('home');
  });
  it('always brings back a Wrap up in progress or its result, however long ago', () => {
    expect(miniToggle({ visible: false, exists: true, blurredAt: now - MINI_RESUME_MS * 10, now, keep: true })).toBe('resume');
    expect(miniToggle({ visible: false, exists: true, blurredAt: now - 10, now, keep: true })).toBe('ignore');
  });
  it('starts at home if the clock moved back', () => {
    expect(miniToggle({ visible: false, exists: true, blurredAt: now + 5000, now })).toBe('home');
  });
});
