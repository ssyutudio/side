import { EventEmitter } from 'node:events';
import { IDLE_RETURN_MS } from '@side/shared';
import { watchReturns } from './returnWatcher';

class FakePower extends EventEmitter {
  idle = 0;
  getSystemIdleTime() {
    return this.idle;
  }
}

function setup() {
  vi.useFakeTimers();
  const power = new FakePower();
  const triggers: string[] = [];
  const sleeps: boolean[] = [];
  const stop = watchReturns({
    power,
    intervalMs: 1000,
    onTrigger: (t) => triggers.push(t),
    onAsleep: (a) => sleeps.push(a),
  });
  return { power, triggers, sleeps, stop };
}

afterEach(() => vi.useRealTimers());

describe('watchReturns', () => {
  it('turns wake and unlock into return moments and tracks sleep', () => {
    const { power, triggers, sleeps, stop } = setup();
    power.emit('suspend');
    power.emit('resume');
    power.emit('unlock-screen');
    expect(triggers).toEqual(['wake', 'unlock']);
    expect(sleeps).toEqual([true, false]);
    stop();
  });

  it('fires idle_return once when input resumes after a long idle', () => {
    const { power, triggers, stop } = setup();
    for (let s = 0; s <= IDLE_RETURN_MS / 1000 + 5; s += 60) {
      power.idle = s;
      vi.advanceTimersByTime(1000);
    }
    power.idle = 1;
    vi.advanceTimersByTime(1000);
    power.idle = 2;
    vi.advanceTimersByTime(1000);
    expect(triggers).toEqual(['idle_return']);
    stop();
  });

  it('stays silent after a short idle', () => {
    const { power, triggers, stop } = setup();
    power.idle = 120;
    vi.advanceTimersByTime(1000);
    power.idle = 0;
    vi.advanceTimersByTime(1000);
    expect(triggers).toEqual([]);
    stop();
  });

  it('stops listening when stopped', () => {
    const { power, triggers, stop } = setup();
    stop();
    power.emit('resume');
    expect(triggers).toEqual([]);
  });
});
