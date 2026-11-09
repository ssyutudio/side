import { SPEAK_COOLDOWN_MS, IDLE_RETURN_MS } from '@side/shared';
import { decideSpeak, inQuietHours, keepLatest, restUntil, type SpeakContext } from './speakPolicy';
import { idleStart, nextIdle } from './idleReturn';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

const ctx = (over: Partial<SpeakContext> = {}): SpeakContext => ({
  now: at(10, 19, 30),
  hidden: false,
  quietHours: null,
  focusUntil: null,
  restedUntil: null,
  lastSpokeAt: null,
  hasSomethingToSay: true,
  ...over,
});

describe('decideSpeak', () => {
  it('speaks on a return moment with a step ready', () => {
    for (const t of ['app_start', 'wake', 'unlock', 'idle_return'] as const) {
      expect(decideSpeak(t, ctx())).toEqual({ speak: true });
    }
  });

  it('stays quiet with a reason Main can show', () => {
    expect(decideSpeak('wake', ctx({ hidden: true }))).toEqual({ speak: false, reason: 'hidden' });
    expect(decideSpeak('wake', ctx({ hasSomethingToSay: false }))).toEqual({ speak: false, reason: 'nothing_to_say' });
    expect(decideSpeak('wake', ctx({ restedUntil: at(11, 4) }))).toEqual({ speak: false, reason: 'rested_today' });
    expect(decideSpeak('wake', ctx({ quietHours: { start: 19 * 60, end: 20 * 60 } }))).toEqual({ speak: false, reason: 'quiet_hours' });
    expect(decideSpeak('wake', ctx({ focusUntil: at(10, 20) }))).toEqual({ speak: false, reason: 'focus' });
    expect(decideSpeak('wake', ctx({ lastSpokeAt: at(10, 19, 30) - SPEAK_COOLDOWN_MS + 1 }))).toEqual({ speak: false, reason: 'spoke_recently' });
  });

  it('speaks again once the hour has passed', () => {
    expect(decideSpeak('unlock', ctx({ lastSpokeAt: at(10, 19, 30) - SPEAK_COOLDOWN_MS }))).toEqual({ speak: true });
  });

  it('keeps the promise the user asked for despite focus, cooldown and quiet hours', () => {
    const c = ctx({ focusUntil: at(10, 22), lastSpokeAt: at(10, 19, 29), quietHours: { start: 19 * 60, end: 7 * 60 }, restedUntil: at(11, 4) });
    expect(decideSpeak('promise_due', c)).toEqual({ speak: true });
    expect(decideSpeak('promise_due', { ...c, hidden: true })).toEqual({ speak: false, reason: 'hidden' });
  });

  it('lets the first-run hello through unless sidy is hidden', () => {
    expect(decideSpeak('first_run', ctx({ quietHours: { start: 0, end: 24 * 60 - 1 }, lastSpokeAt: at(10, 19, 29) }))).toEqual({ speak: true });
  });
});

describe('inQuietHours', () => {
  it('handles windows that cross midnight', () => {
    const w = { start: 23 * 60, end: 7 * 60 };
    expect(inQuietHours(at(10, 23, 30), w)).toBe(true);
    expect(inQuietHours(at(10, 3), w)).toBe(true);
    expect(inQuietHours(at(10, 7), w)).toBe(false);
    expect(inQuietHours(at(10, 12), w)).toBe(false);
  });
  it('is off when null or empty', () => {
    expect(inQuietHours(at(10, 3), null)).toBe(false);
    expect(inQuietHours(at(10, 3), { start: 60, end: 60 })).toBe(false);
  });
});

describe('restUntil', () => {
  it('rests until the next work day starts at 4 a.m.', () => {
    expect(restUntil(at(10, 19))).toBe(at(11, 4));
    expect(restUntil(at(11, 1))).toBe(at(11, 4));
  });
});

describe('keepLatest', () => {
  it('keeps only the most recent missed bubble', () => {
    const a = { trigger: 'wake' as const, at: 10, stepId: 's1' };
    const b = { trigger: 'unlock' as const, at: 20, stepId: 's1' };
    expect(keepLatest(null, a)).toBe(a);
    expect(keepLatest(a, b)).toBe(b);
    expect(keepLatest(b, a)).toBe(b);
  });
});

describe('idle return', () => {
  it('fires once when input comes back after a long idle', () => {
    let s = idleStart();
    let r = nextIdle(s, 30);
    expect(r.returned).toBe(false);
    s = r.state;
    r = nextIdle(s, IDLE_RETURN_MS / 1000 + 5);
    expect(r.returned).toBe(false);
    s = r.state;
    r = nextIdle(s, 1);
    expect(r.returned).toBe(true);
    s = r.state;
    r = nextIdle(s, 2);
    expect(r.returned).toBe(false);
  });

  it('does not fire after a short pause', () => {
    let s = idleStart();
    s = nextIdle(s, 120).state;
    expect(nextIdle(s, 0).returned).toBe(false);
  });
});
