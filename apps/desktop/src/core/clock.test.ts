import { DemoClock, fixedClock, localMinutes, startOfLocalDay } from './clock';

function at(y: number, mo: number, d: number, h: number, mi: number): number {
  return new Date(y, mo - 1, d, h, mi, 0, 0).getTime();
}

describe('DemoClock', () => {
  it('follows the real clock with no offset', () => {
    const base = fixedClock(at(2026, 11, 9, 23, 40));
    const c = new DemoClock(base);
    expect(c.now()).toBe(at(2026, 11, 9, 23, 40));
    expect(c.offset).toBe(0);
  });

  it('adds the stored offset', () => {
    const c = new DemoClock(fixedClock(1000), 500);
    expect(c.now()).toBe(1500);
  });

  it('jumps to the same local time the next day', () => {
    const c = new DemoClock(fixedClock(at(2026, 11, 9, 23, 40)));
    c.nextDay();
    expect(c.now()).toBe(at(2026, 11, 10, 23, 40));
  });

  it('jumps to a given evening time the next day', () => {
    const c = new DemoClock(fixedClock(at(2026, 11, 9, 23, 40)));
    c.nextDay(19 * 60 + 30);
    expect(c.now()).toBe(at(2026, 11, 10, 19, 30));
  });

  it('jumps three days later and resets', () => {
    const c = new DemoClock(fixedClock(at(2026, 11, 9, 23, 40)));
    c.threeDaysLater(11 * 60);
    expect(c.now()).toBe(at(2026, 11, 12, 11, 0));
    c.reset();
    expect(c.now()).toBe(at(2026, 11, 9, 23, 40));
    expect(c.offset).toBe(0);
  });

  it('can make tonight at a given time', () => {
    const c = new DemoClock(fixedClock(at(2026, 11, 9, 14, 5)));
    c.todayAt(23 * 60 + 50);
    expect(c.now()).toBe(at(2026, 11, 9, 23, 50));
  });
});

describe('local day helpers', () => {
  it('finds the start of the local day and minutes since midnight', () => {
    const t = at(2026, 11, 9, 7, 15);
    expect(startOfLocalDay(t)).toBe(at(2026, 11, 9, 0, 0));
    expect(localMinutes(t)).toBe(7 * 60 + 15);
  });
});
