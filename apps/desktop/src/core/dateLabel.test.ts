import { dayLabel } from './dateLabel';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

describe('dayLabel', () => {
  it('says today for the same work day', () => {
    expect(dayLabel(at(9, 21), at(9, 23))).toBe('today');
  });

  it('treats late-night work as the evening it started', () => {
    expect(dayLabel(at(10, 1, 30), at(9, 23))).toBe('today');
    expect(dayLabel(at(10, 1, 30), at(10, 19))).toBe('yesterday');
  });

  it('names the real date when the last record is older', () => {
    expect(dayLabel(at(6, 22), at(9, 19))).toBe('Fri, Nov 6');
  });

  it('never says yesterday after three days away', () => {
    expect(dayLabel(at(9, 23), at(12, 11))).toBe('Mon, Nov 9');
  });
});
