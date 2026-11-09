import { bySideCounts, buildBySideRequest, parseBySide, ruleBySide } from './llmHelpBySide';
import type { SideNumbers } from './stats';

const nums = (o: Partial<SideNumbers>): SideNumbers => ({
  connected: true, tabsInChrome: 30, tabsOpen: 5, tabsSetAside: 25, stepReady: true, todayLine: null,
  spokeToday: 1, spokeTotal: 6, shown: 6, clicked: 5, clickRate: { value: 5 / 6, n: 6 }, stillWorkingRate: { value: 0.75, n: 4 },
  lastSecondsToWork: 1.4, setAsideTotals: { tabs: 80, lines: 3 }, ...o,
});

describe('ruleBySide', () => {
  it('says it is still learning below three opened steps', () => {
    expect(ruleBySide(nums({ clicked: 2 }))).toBe(
      'sidy is still learning what gets you started. 2 steps opened so far — after 3, it can tell you which kind works for you.',
    );
  });
  it('states the kept-going share from the counts after that', () => {
    expect(ruleBySide(nums({}))).toBe('Of 4 steps you opened and stayed with long enough to tell, 3 kept you going past 10 minutes.');
  });
  it('does not claim a share before any step could be judged', () => {
    expect(ruleBySide(nums({ stillWorkingRate: { value: null, n: 0 } }))).toBe('5 steps opened so far. sidy checks 10 minutes after each one whether you kept going.');
  });
});

describe('By your side with Claude', () => {
  it('sends numbers only', () => {
    const req = buildBySideRequest(bySideCounts(nums({})));
    const sent = req.system + req.user;
    expect(req.user).toMatch(/^[A-Za-z ,:.\d\n-]+$/);
    expect(sent).not.toMatch(/https?:|\.com|title/i);
  });

  it('accepts one plain sentence that uses only the given numbers', () => {
    const c = bySideCounts(nums({}));
    expect(parseBySide('3 of the 4 steps you could judge kept you going past 10 minutes.', c)).toBe(
      '3 of the 4 steps you could judge kept you going past 10 minutes.',
    );
  });

  it('rejects invented numbers, advice, links and long answers', () => {
    const c = bySideCounts(nums({}));
    expect(parseBySide('7 of your steps kept you going past 10 minutes.', c)).toBeNull();
    expect(parseBySide('You should sleep earlier to keep going.', c)).toBeNull();
    expect(parseBySide('See https://x.example for more.', c)).toBeNull();
    expect(parseBySide('Steps help. '.repeat(30), c)).toBeNull();
  });
});
