// When sidy may speak first. Most of the time it says nothing.
// It speaks only at a return moment (app start, wake, unlock, input after a long
// idle), at most once an hour, never while hidden, in quiet hours, during focus,
// or after "Rest today". A check-in the user asked for (promise_due) is kept
// even through focus, cooldown and quiet hours, because the user chose it.
// Every silence carries a reason so Main can show why sidy was quiet.
import type { QuietReason, Settings } from '@side/shared';
import { SPEAK_COOLDOWN_MS } from '@side/shared';
import { localMinutes } from './clock';
import { WORK_DAY_START_HOURS, workDayOf } from './todayDone';

export type SpeakTrigger = 'app_start' | 'wake' | 'unlock' | 'idle_return' | 'promise_due' | 'first_run';

export interface SpeakContext {
  now: number;
  hidden: boolean;
  quietHours: Settings['quietHours'];
  focusUntil: number | null;
  /** Set by "Rest today" or "Not today"; sidy stays quiet until then. */
  restedUntil: number | null;
  lastSpokeAt: number | null;
  /** A step is ready (or, for promise_due, the promise is pending). */
  hasSomethingToSay: boolean;
}

export type SpeakDecision = { speak: true } | { speak: false; reason: QuietReason };

export function inQuietHours(now: number, window: Settings['quietHours']): boolean {
  if (!window || window.start === window.end) return false;
  const m = localMinutes(now);
  return window.start < window.end ? m >= window.start && m < window.end : m >= window.start || m < window.end;
}

/** "Rest today" lasts until the next work day starts (4 a.m.). */
export function restUntil(now: number): number {
  const d = new Date(workDayOf(now));
  d.setDate(d.getDate() + 1);
  d.setHours(WORK_DAY_START_HOURS, 0, 0, 0);
  return d.getTime();
}

const quiet = (reason: QuietReason): SpeakDecision => ({ speak: false, reason });

export function decideSpeak(trigger: SpeakTrigger, c: SpeakContext): SpeakDecision {
  if (c.hidden) return quiet('hidden');
  if (!c.hasSomethingToSay) return quiet('nothing_to_say');
  if (trigger === 'promise_due' || trigger === 'first_run') return { speak: true };
  if (c.restedUntil !== null && c.now < c.restedUntil) return quiet('rested_today');
  if (inQuietHours(c.now, c.quietHours)) return quiet('quiet_hours');
  if (c.focusUntil !== null && c.now < c.focusUntil) return quiet('focus');
  if (c.lastSpokeAt !== null && c.now - c.lastSpokeAt < SPEAK_COOLDOWN_MS) return quiet('spoke_recently');
  return { speak: true };
}

/** A bubble that could not be shown (asleep, hidden). Only the latest one survives. */
export interface PendingBubble {
  trigger: SpeakTrigger;
  at: number;
  stepId: string | null;
}

export function keepLatest(current: PendingBubble | null, next: PendingBubble): PendingBubble {
  if (!current) return next;
  return next.at >= current.at ? next : current;
}
