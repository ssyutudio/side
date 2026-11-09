// Detects "no input for a long time, then input again" from periodic samples of
// the system idle time (seconds since the last keyboard or mouse input).
import { IDLE_RETURN_MS } from '@side/shared';

export interface IdleState {
  /** Longest idle seen in the current stretch, in seconds. */
  peak: number;
  last: number;
}

export function idleStart(): IdleState {
  return { peak: 0, last: 0 };
}

/** Feed one sample. `returned` is true exactly once when input resumes after a long idle. */
export function nextIdle(s: IdleState, idleSeconds: number, thresholdMs = IDLE_RETURN_MS): { state: IdleState; returned: boolean } {
  const inputHappened = idleSeconds < s.last;
  if (inputHappened) {
    const returned = s.peak * 1000 >= thresholdMs;
    return { state: { peak: idleSeconds, last: idleSeconds }, returned };
  }
  return { state: { peak: Math.max(s.peak, idleSeconds), last: idleSeconds }, returned: false };
}
