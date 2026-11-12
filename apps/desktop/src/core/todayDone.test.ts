import type { SetAside, Step, StepEvent } from '@side/shared';
import { todayDone, todayLine, workDayOf, workDayStart } from './todayDone';
import { fixedClock } from './clock';

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();

function setAside(id: string, endedAt: number, status: SetAside['status'], tabsGrouped: number[][]): SetAside {
  return {
    id, endedAt, tabs: [], groups: [], kept: [], userLine: null, todayDone: [], closeRequested: false, status,
    result: status === 'saved' ? null : { grouped: tabsGrouped.map((ids, i) => ({ key: `g${i}`, chromeGroupId: i, tabIds: ids })), closed: [], kept: [] },
  };
}

const step: Step = {
  id: 's1', fromSetAside: 'sa0', createdAt: at(9, 8), label: 'Your retry notes are open where you stopped.',
  action: { type: 'open_url', url: 'https://docs.google.com/document/d/1/edit', title: 'Retry design notes - Google Docs', position: null },
  checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true }, source: 'rule',
};

describe('workDayOf', () => {
  it('counts the hours after midnight as the previous work day', () => {
    expect(workDayOf(at(10, 1, 30))).toBe(workDayOf(at(9, 22)));
    expect(workDayOf(at(10, 5))).not.toBe(workDayOf(at(9, 22)));
  });
});

describe('todayDone', () => {
  it('is empty when nothing was confirmed', () => {
    expect(todayDone({ setAsides: [], steps: [], stepEvents: [] }, fixedClock(at(9, 20)))).toEqual([]);
  });

  it('uses confirmed set-asides only, not ones Chrome never confirmed', () => {
    const lines = todayDone(
      { setAsides: [setAside('a', at(9, 23), 'applied', [[1, 2, 3], [4]]), setAside('b', at(9, 23, 30), 'unconfirmed', [[5]]), setAside('c', at(9, 23, 40), 'saved', [])], steps: [], stepEvents: [] },
      fixedClock(at(10, 1)),
    );
    expect(lines).toEqual(['Set aside 4 tabs in 2 groups.']);
  });

  it('uses a clicked step and ten minutes of keeping at it, never a step that was only shown', () => {
    const shownOnly: StepEvent = { stepId: 's1', shownAt: at(9, 9), clickedAt: null, openedAt: null, stillWorkingAt10m: null, dismissed: null };
    expect(todayDone({ setAsides: [], steps: [step], stepEvents: [shownOnly] }, fixedClock(at(9, 20)))).toEqual([]);

    const clicked: StepEvent = { ...shownOnly, clickedAt: at(9, 9, 1), openedAt: at(9, 9, 1), stillWorkingAt10m: true };
    const lines = todayDone({ setAsides: [], steps: [step], stepEvents: [clicked] }, fixedClock(at(9, 20)));
    expect(lines).toEqual(['Came back to Retry design notes.', 'Kept going on Retry design notes for 10+ minutes.']);
  });

  it('puts the user own words in as written and ignores other days', () => {
    const lines = todayDone(
      { setAsides: [setAside('old', at(7, 22), 'applied', [[1]])], steps: [], stepEvents: [], notes: [{ at: at(9, 21), text: '  Fixed the jitter bug  ' }] },
      fixedClock(at(9, 22)),
    );
    expect(lines).toEqual(['Fixed the jitter bug']);
  });
});

describe('todayLine', () => {
  it('prefers the user own words, then the latest event, else null', () => {
    expect(todayLine([])).toBeNull();
    expect(todayLine(['Set aside 4 tabs in 2 groups.'], ['Fixed the jitter bug'])).toBe('Fixed the jitter bug');
    expect(todayLine(['Came back to X.', 'Set aside 4 tabs in 2 groups.'])).toBe('Set aside 4 tabs in 2 groups.');
  });
});

describe('workDayOf on a DST change day', () => {
  const prev = process.env.TZ;
  afterEach(() => {
    if (prev === undefined) delete process.env.TZ;
    else process.env.TZ = prev;
  });

  it('3:30 a.m. on a 25-hour day still belongs to the evening before', () => {
    process.env.TZ = 'America/New_York'; // 2026-11-01: clocks go back at 2:00
    const early = new Date(2026, 10, 1, 3, 30).getTime();
    expect(workDayOf(early)).toBe(new Date(2026, 9, 31).getTime());
    expect(workDayOf(new Date(2026, 10, 1, 4, 0).getTime())).toBe(new Date(2026, 10, 1).getTime());
  });

  it('workDayStart is 4 a.m. local, even across the change', () => {
    process.env.TZ = 'America/New_York';
    const now = new Date(2026, 9, 31, 23, 0).getTime();
    expect(workDayStart(now, 1)).toBe(new Date(2026, 10, 1, 4, 0).getTime());
    expect(workDayStart(now, 2)).toBe(new Date(2026, 10, 2, 4, 0).getTime());
  });
});
