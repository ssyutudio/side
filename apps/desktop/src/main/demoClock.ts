// Demo clock commands for recording the video. They move only Side's own clock (an offset kept in
// the data file), never the system clock. Jumps are relative to the work day (which starts at
// 4 a.m.), so a late-night Wrap up reads as "yesterday" on the next evening.
import { startOfLocalDay } from '../core/clock';
import { WORK_DAY_START_HOURS, workDayOf } from '../core/todayDone';

export const DEMO_COMMANDS = ['night', 'plus-30', 'next-day', 'three-days', 'reset'] as const;
export type DemoCommand = (typeof DEMO_COMMANDS)[number];

const NIGHT_AT = { h: 1, m: 30 };
const EVENING_AT = { h: 19, m: 0 };

function at(dayStart: number, addDays: number, h: number, m: number): number {
  const d = new Date(dayStart);
  d.setDate(d.getDate() + addDays);
  d.setHours(h, m, 0, 0);
  return d.getTime();
}

/** The moment a command jumps to, or null for "back to real time". */
export function demoTarget(cmd: DemoCommand, now: number): number | null {
  const day = startOfLocalDay(workDayOf(now));
  switch (cmd) {
    case 'night':
      // Early hours after this work day's midnight: still the same work day.
      return at(day, 1, NIGHT_AT.h, NIGHT_AT.m);
    case 'plus-30':
      // Just past a 30-minute check-in.
      return now + 31 * 60_000;
    case 'next-day':
      return at(day, 1, EVENING_AT.h, EVENING_AT.m);
    case 'three-days':
      return at(day, 3, EVENING_AT.h, EVENING_AT.m);
    case 'reset':
      return null;
  }
}

export function parseDemoCommand(raw: unknown): DemoCommand | null {
  if (typeof raw !== 'string') return null;
  const s = raw.trim().toLowerCase();
  return (DEMO_COMMANDS as readonly string[]).includes(s) ? (s as DemoCommand) : null;
}

/** Offset to store so that real `realNow` reads as the command's target. */
export function demoOffset(cmd: DemoCommand, realNow: number, currentOffset: number): number {
  const target = demoTarget(cmd, realNow + currentOffset);
  return target === null ? 0 : target - realNow;
}

// Keeps the constant referenced for readers: night stays before the work day boundary.
if (NIGHT_AT.h >= WORK_DAY_START_HOURS) throw new Error('night must stay before the work day starts');
