import type { SetAside, Step, StepEvent } from '@side/shared';
import { STILL_WORKING_AFTER_MS } from '@side/shared';
import { STILL_WORKING_GRACE_MS, applyStillWorking, judgeStillWorking, markClicked, markDismissed, markOpened, markShown, secondsToWork } from './stepEvents';

const step: Step = {
  id: 's1', fromSetAside: 'sa1', createdAt: 0, label: 'l', source: 'rule',
  action: { type: 'open_url', url: 'https://docs.google.com/document/d/D1/edit', title: 'Notes', position: null },
  checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true },
};

const sa: SetAside = {
  id: 'sa1', endedAt: 0, groups: [], kept: [], userLine: null, todayDone: [], closeRequested: false, status: 'applied', result: null,
  tabs: [
    { tabId: 1, url: 'https://github.com/acme/retry-queue/pull/12', title: 'PR', lastAccessed: 1, position: null, groupKey: 'gh:acme/retry-queue' },
    { tabId: 2, url: 'https://www.youtube.com/watch?v=1', title: 'Talk', lastAccessed: 1, position: null, groupKey: 'breaks' },
  ],
};

describe('markShown', () => {
  it('records shownAt only when the bubble was drawn while sidy was visible and awake', () => {
    let evs: StepEvent[] = [];
    evs = markShown(evs, 's1', 100, { hidden: true, asleep: false });
    expect(evs).toEqual([]);
    evs = markShown(evs, 's1', 110, { hidden: false, asleep: true });
    expect(evs).toEqual([]);
    evs = markShown(evs, 's1', 120, { hidden: false, asleep: false });
    expect(evs[0].shownAt).toBe(120);
  });

  it('keeps the first shownAt', () => {
    let evs = markShown([], 's1', 120, { hidden: false, asleep: false });
    evs = markShown(evs, 's1', 500, { hidden: false, asleep: false });
    expect(evs).toHaveLength(1);
    expect(evs[0].shownAt).toBe(120);
  });
});

describe('click, open, dismiss', () => {
  it('records click and the confirmed open, and the seconds in between', () => {
    let evs = markShown([], 's1', 100, { hidden: false, asleep: false });
    evs = markClicked(evs, 's1', 1_000);
    evs = markOpened(evs, 's1', 3_500);
    expect(evs[0].clickedAt).toBe(1_000);
    expect(evs[0].openedAt).toBe(3_500);
    expect(secondsToWork(evs[0])).toBe(2.5);
  });

  it('records rest today and not now', () => {
    const a = markDismissed([], 's1', 'rest_today');
    expect(a[0].dismissed).toBe('rest_today');
    expect(a[0].clickedAt).toBeNull();
    expect(markDismissed(a, 's1', 'not_now')[0].dismissed).toBe('not_now');
  });

  it('does not change other steps', () => {
    let evs = markClicked([], 'other', 5);
    evs = markClicked(evs, 's1', 9);
    expect(evs.find((e) => e.stepId === 'other')?.clickedAt).toBe(5);
  });
});

describe('judgeStillWorking', () => {
  const clicked: StepEvent = { stepId: 's1', shownAt: 0, clickedAt: 1_000, openedAt: 2_000, stillWorkingAt10m: null, dismissed: null };
  const due = 1_000 + STILL_WORKING_AFTER_MS;

  it('waits until ten minutes after the click', () => {
    expect(judgeStillWorking(clicked, step, sa, 'https://docs.google.com/x', due - 1)).toBeNull();
  });
  it('counts the same site as the step', () => {
    expect(judgeStillWorking(clicked, step, sa, 'https://docs.google.com/document/d/OTHER/edit', due)).toBe(true);
  });
  it('counts a page from that set-aside work', () => {
    expect(judgeStillWorking(clicked, step, sa, 'https://github.com/acme/retry-queue/pull/12#discussion', due)).toBe(true);
  });
  it('does not count a break page or no active tab', () => {
    expect(judgeStillWorking(clicked, step, sa, 'https://www.youtube.com/watch?v=1', due)).toBe(false);
    expect(judgeStillWorking(clicked, step, sa, null, due)).toBe(false);
  });
  it('leaves it unjudged when the first report comes long after the due time', () => {
    expect(judgeStillWorking(clicked, step, sa, 'https://docs.google.com/x', due + STILL_WORKING_GRACE_MS)).toBe(true);
    expect(judgeStillWorking(clicked, step, sa, 'https://docs.google.com/x', due + STILL_WORKING_GRACE_MS + 1)).toBeNull();
    expect(judgeStillWorking(clicked, step, sa, null, due + 3 * 3_600_000)).toBeNull();
  });
  it('leaves it open when Chrome is not connected', () => {
    expect(judgeStillWorking(clicked, step, sa, undefined, due)).toBeNull();
  });
  it('does not judge a step that was never clicked', () => {
    expect(judgeStillWorking({ ...clicked, clickedAt: null }, step, sa, 'https://docs.google.com', due)).toBeNull();
  });
});

describe('applyStillWorking', () => {
  it('fills in only due, unjudged events', () => {
    const evs: StepEvent[] = [{ stepId: 's1', shownAt: 0, clickedAt: 0, openedAt: 1, stillWorkingAt10m: null, dismissed: null }];
    const out = applyStillWorking(evs, [step], [sa], 'https://docs.google.com/document/d/D1/edit', STILL_WORKING_AFTER_MS);
    expect(out[0].stillWorkingAt10m).toBe(true);
    const again = applyStillWorking(out, [step], [sa], 'https://www.youtube.com', STILL_WORKING_AFTER_MS * 2);
    expect(again[0].stillWorkingAt10m).toBe(true);
  });
});
