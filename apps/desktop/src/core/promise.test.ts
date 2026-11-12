import type { StopPromise } from '@side/shared';
import { activePromise, answerPromise, choosePromise, expirePromise, firePromise, isDue, isExpired, oneMoreHour, hoursUntilWake, PROMISE_GRACE_MS } from './promise';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const WAKE = 7 * 60;

describe('oneMoreHour', () => {
  it('never blocks: a respect line and a plain fact about sleep time', () => {
    const r = oneMoreHour(at(10, 1), WAKE);
    expect(r.respect.length).toBeGreaterThan(0);
    expect(r.fact).toBe('Sleep now and you get 6 hours before 7:00 AM.');
  });

  it('rounds down and uses minutes under an hour', () => {
    expect(oneMoreHour(at(10, 1, 40), WAKE).fact).toBe('Sleep now and you get 5 hours before 7:00 AM.');
    expect(oneMoreHour(at(10, 6, 20), WAKE).fact).toBe('Sleep now and you get 40 minutes before 7:00 AM.');
  });

  it('makes no promise about what sleep does', () => {
    const r = oneMoreHour(at(10, 1), WAKE);
    expect(`${r.respect} ${r.fact}`).not.toMatch(/better|health|product|focus|sharp|recover|rested/i);
  });

  it('has no sleep fact in the daytime', () => {
    expect(oneMoreHour(at(10, 14), WAKE).fact).toBeNull();
  });

  it('computes hours until the next wake time', () => {
    expect(hoursUntilWake(at(10, 23), WAKE)).toBe(8);
  });
});

describe('choosePromise', () => {
  it('creates one active promise and the last choice wins', () => {
    let list: StopPromise[] = [];
    list = choosePromise(list, 30, at(10, 1), ['Set aside 4 tabs in 2 groups.'], () => 'p1');
    list = choosePromise(list, 60, at(10, 1, 2), ['Set aside 4 tabs in 2 groups.'], () => 'p2');
    const active = list.filter((p) => p.firedAt === null && p.answer === null);
    expect(active).toHaveLength(1);
    expect(active[0].minutes).toBe(60);
    expect(active[0].dueAt).toBe(at(10, 2, 2));
    expect(active[0].summary).toEqual(['Set aside 4 tabs in 2 groups.']);
  });

  it('ignores a choice that is not offered', () => {
    const list = choosePromise([], 45 as 30, at(10, 1), [], () => 'p1');
    expect(list).toEqual([]);
  });
});

describe('firing and answering', () => {
  const p: StopPromise = { id: 'p', madeAt: 0, dueAt: 1000, minutes: 30, firedAt: null, answer: null, summary: [] };

  it('is due once the time comes and fires exactly once', () => {
    expect(isDue(p, 999)).toBe(false);
    expect(isDue(p, 1000)).toBe(true);
    const fired = firePromise(p, 1000);
    expect(fired.firedAt).toBe(1000);
    expect(isDue(fired, 5000)).toBe(false);
    expect(firePromise(fired, 6000).firedAt).toBe(1000);
  });

  it('Set aside goes to the Wrap up preview', () => {
    const r = answerPromise(firePromise(p, 1000), 'set_aside', 1100);
    expect(r.goToWrapup).toBe(true);
    expect(r.promise.answer).toBe('set_aside');
    expect(r.restedUntil).toBeNull();
  });

  it('Not today counts as resting today', () => {
    const r = answerPromise(firePromise(p, at(10, 2)), 'not_today', at(10, 2));
    expect(r.restedUntil).toBe(at(10, 4));
    expect(r.goToWrapup).toBe(false);
  });

  it('activePromise finds the pending one', () => {
    expect(activePromise([p])?.id).toBe('p');
    expect(activePromise([firePromise(p, 1000)])).toBeNull();
  });
});

describe('expired check-ins', () => {
  const p: StopPromise = { id: 'p', madeAt: 0, dueAt: 60 * 60_000, minutes: 60, firedAt: null, answer: null, summary: [] };
  it('is not stale within the grace period, and is stale after it', () => {
    expect(isExpired(p, p.dueAt + PROMISE_GRACE_MS)).toBe(false);
    expect(isExpired(p, p.dueAt + PROMISE_GRACE_MS + 1)).toBe(true);
    expect(isExpired({ ...p, firedAt: 5 }, p.dueAt + PROMISE_GRACE_MS + 1)).toBe(false);
  });
  it('retires the promise so nothing waits on it', () => {
    const out = expirePromise(p, 10);
    expect(out.firedAt).toBe(10);
    expect(activePromise([out])).toBeNull();
  });
});
