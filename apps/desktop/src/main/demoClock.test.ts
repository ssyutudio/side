import { demoTarget, parseDemoCommand } from './demoClock';
import { dayLabel } from '../core/dateLabel';
import { workDayOf } from '../core/todayDone';

const afternoon = new Date(2026, 10, 9, 15, 0).getTime();

describe('demoTarget', () => {
  it('makes tonight late: after midnight but still the same work day', () => {
    const night = demoTarget('night', afternoon)!;
    expect(new Date(night).getHours()).toBe(1);
    expect(workDayOf(night)).toBe(workDayOf(afternoon));
  });

  it('makes the next work day evening, which reads as yesterday for a late-night record', () => {
    const night = demoTarget('night', afternoon)!;
    const next = demoTarget('next-day', night)!;
    expect(new Date(next).getHours()).toBe(19);
    expect(dayLabel(night, next)).toBe('yesterday');
  });

  it('makes three days later read as a real date, not yesterday', () => {
    const night = demoTarget('night', afternoon)!;
    const later = demoTarget('three-days', night)!;
    expect(dayLabel(night, later)).toBe('Mon, Nov 9');
  });

  it('resets to real time', () => {
    expect(demoTarget('reset', afternoon)).toBeNull();
  });
});

describe('parseDemoCommand', () => {
  it('accepts only known commands', () => {
    expect(parseDemoCommand('next-day')).toBe('next-day');
    expect(parseDemoCommand(' Night ')).toBe('night');
    expect(parseDemoCommand('rm -rf')).toBeNull();
    expect(parseDemoCommand(undefined)).toBeNull();
  });
});

describe('demoOffset', () => {
  it('stores an offset that makes the real clock read as the target, and chains from the demo time', async () => {
    const { demoOffset } = await import('./demoClock');
    const real = afternoon;
    const o1 = demoOffset('night', real, 0);
    expect(real + o1).toBe(demoTarget('night', real));
    const o2 = demoOffset('next-day', real, o1);
    expect(dayLabel(real + o1, real + o2)).toBe('yesterday');
    expect(demoOffset('reset', real, o2)).toBe(0);
  });
});
