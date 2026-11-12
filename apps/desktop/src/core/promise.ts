// "One more hour": sidy never blocks. It answers with respect and one fact
// (time left before the wake time), the summary so far is saved first, and the
// user picks when to stop. That time becomes a real promise: exactly one
// active, the last choice wins, and it fires exactly once with three answers.
import type { StopPromise } from '@side/shared';
import { PROMISE_CHOICES_MIN } from '@side/shared';
import { t } from '../i18n';
import { localMinutes } from './clock';
import { oneMoreHour as copy } from './copy';
import { restUntil } from './speakPolicy';

/** Beyond this, the sleep fact is not shown (daytime "one more hour" is just work). */
const FACT_WINDOW_MIN = 12 * 60;

export type PromiseChoice = (typeof PROMISE_CHOICES_MIN)[number];
export type PromiseAnswer = NonNullable<StopPromise['answer']>;

function minutesUntilWake(now: number, wakeMinutes: number): number {
  const m = localMinutes(now);
  return (wakeMinutes - m + 24 * 60) % (24 * 60);
}

export function hoursUntilWake(now: number, wakeMinutes: number): number {
  return Math.floor(minutesUntilWake(now, wakeMinutes) / 60);
}

export function formatClock(minutes: number): string {
  const h = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const time = `${h12}:${String(m).padStart(2, '0')}`;
  return h < 12 ? t('{time} AM', { time }) : t('{time} PM', { time });
}

export function oneMoreHour(now: number, wakeMinutes: number): { respect: string; fact: string | null } {
  const left = minutesUntilWake(now, wakeMinutes);
  if (left === 0 || left > FACT_WINDOW_MIN) return { respect: copy.respect, fact: null };
  const amount = left >= 60 ? copy.hours(Math.floor(left / 60)) : copy.minutes(left);
  return { respect: copy.respect, fact: copy.sleepFact(amount, formatClock(wakeMinutes)) };
}

function isActive(p: StopPromise): boolean {
  return p.firedAt === null && p.answer === null;
}

/** The promise waiting for its time, if any. */
export function activePromise(list: readonly StopPromise[]): StopPromise | null {
  return list.filter(isActive).sort((a, b) => b.madeAt - a.madeAt)[0] ?? null;
}

/** Adds the user's choice. Re-choosing replaces the waiting promise, so one stays active. */
export function choosePromise(
  list: readonly StopPromise[],
  minutes: PromiseChoice,
  now: number,
  summary: readonly string[],
  newId: () => string,
): StopPromise[] {
  if (!(PROMISE_CHOICES_MIN as readonly number[]).includes(minutes)) return [...list];
  const kept = list.filter((p) => !isActive(p));
  const made: StopPromise = { id: newId(), madeAt: now, dueAt: now + minutes * 60_000, minutes, firedAt: null, answer: null, summary: [...summary] };
  return [...kept, made];
}

export function isDue(p: StopPromise | null, now: number): boolean {
  return !!p && isActive(p) && now >= p.dueAt;
}

/** A check-in this long past its time (hidden, asleep, app closed) is stale: "the hour is up" would be a lie. */
export const PROMISE_GRACE_MS = 2 * 60 * 60_000;

export function isExpired(p: StopPromise | null, now: number): boolean {
  return !!p && isActive(p) && now > p.dueAt + PROMISE_GRACE_MS;
}

/** Retires a stale check-in without a bubble: fired and answered "keep going", so nothing waits on it. */
export function expirePromise(p: StopPromise, now: number): StopPromise {
  return { ...p, firedAt: p.firedAt ?? now, answer: p.answer ?? 'keep_going' };
}

/** Marks the check-in as shown. Firing again changes nothing. */
export function firePromise(p: StopPromise, now: number): StopPromise {
  return p.firedAt === null ? { ...p, firedAt: now } : p;
}

export function answerPromise(
  p: StopPromise,
  answer: PromiseAnswer,
  now: number,
): { promise: StopPromise; goToWrapup: boolean; restedUntil: number | null } {
  return {
    promise: { ...p, answer },
    goToWrapup: answer === 'set_aside',
    restedUntil: answer === 'not_today' ? restUntil(now) : null,
  };
}
