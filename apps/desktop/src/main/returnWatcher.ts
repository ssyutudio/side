// Turns macOS power and input signals into "the user came back" moments for the speak policy:
// wake from sleep, screen unlock, and input after a long idle. No screen capture, no keystrokes:
// only the system idle time (seconds since the last input) is sampled.
import type { SpeakTrigger } from '../core/speakPolicy';
import { idleStart, nextIdle } from '../core/idleReturn';

export interface PowerLike {
  on(event: 'suspend' | 'resume' | 'unlock-screen' | 'lock-screen', fn: () => void): unknown;
  removeListener(event: string, fn: () => void): unknown;
  getSystemIdleTime(): number;
}

export function watchReturns(opts: {
  power: PowerLike;
  intervalMs?: number;
  onTrigger: (t: SpeakTrigger) => void;
  onAsleep: (asleep: boolean) => void;
}): () => void {
  const { power, onTrigger, onAsleep } = opts;
  let idle = idleStart();

  const suspend = () => onAsleep(true);
  const resume = () => {
    onAsleep(false);
    idle = idleStart();
    onTrigger('wake');
  };
  const unlock = () => {
    idle = idleStart();
    onTrigger('unlock');
  };
  power.on('suspend', suspend);
  power.on('resume', resume);
  power.on('unlock-screen', unlock);

  const timer = setInterval(() => {
    const step = nextIdle(idle, power.getSystemIdleTime());
    idle = step.state;
    if (step.returned) onTrigger('idle_return');
  }, opts.intervalMs ?? 30_000);

  return () => {
    clearInterval(timer);
    power.removeListener('suspend', suspend);
    power.removeListener('resume', resume);
    power.removeListener('unlock-screen', unlock);
  };
}
