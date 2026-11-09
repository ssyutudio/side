// Clocks for the core logic. Everything that needs "now" takes a Clock so tests
// and the demo clock (next day, three days later) use the same code paths.

export interface Clock {
  now(): number;
}

export const realClock: Clock = { now: () => Date.now() };

export function fixedClock(ms: number): Clock {
  return { now: () => ms };
}

/** Local midnight of the day that contains `ms`. */
export function startOfLocalDay(ms: number): number {
  const d = new Date(ms);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Minutes since local midnight. */
export function localMinutes(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** Same local wall time `days` later (handles DST by using calendar math), optionally at `atMinutes`. */
function shiftLocal(ms: number, days: number, atMinutes?: number): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  if (atMinutes !== undefined) d.setHours(Math.floor(atMinutes / 60), atMinutes % 60, 0, 0);
  return d.getTime();
}

/**
 * Real clock plus an offset. The offset is what the app stores, so the demo
 * clock survives a restart. It never changes the system clock.
 */
export class DemoClock implements Clock {
  constructor(
    private readonly base: Clock = realClock,
    private offsetMs = 0,
  ) {}

  now(): number {
    return this.base.now() + this.offsetMs;
  }

  get offset(): number {
    return this.offsetMs;
  }

  setOffset(ms: number): void {
    this.offsetMs = ms;
  }

  private jumpTo(target: number): void {
    this.offsetMs += target - this.now();
  }

  /** Today at a local time (used to make "late night" for the demo). */
  todayAt(atMinutes: number): void {
    this.jumpTo(shiftLocal(this.now(), 0, atMinutes));
  }

  /** The next day at the same local time, or at `atMinutes`. */
  nextDay(atMinutes?: number): void {
    this.jumpTo(shiftLocal(this.now(), 1, atMinutes));
  }

  /** Three days later at the same local time, or at `atMinutes`. */
  threeDaysLater(atMinutes?: number): void {
    this.jumpTo(shiftLocal(this.now(), 3, atMinutes));
  }

  reset(): void {
    this.offsetMs = 0;
  }
}
