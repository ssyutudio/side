import { FIXTURES, FIXTURE_PREVIEW } from '../shared/fixtures';
import { homeView } from './homeView';
import { previewView, checkingView, doneView, failedView, primaryLabel } from './wrapView';
import { oneMoreView, untilWake } from './oneMoreView';
import type { SetAside } from '@side/shared';

const s = (x: unknown) => String(x);
const fills = (h: string) => (h.match(/class="btn fill/g) ?? []).length;
const quickCount = (h: string) => (h.match(/<div class="qa">([\s\S]*?)<\/div>/)?.[1].match(/<button/g) ?? []).length;

describe('homeView', () => {
  for (const name of ['night', 'day', 'wrapped', 'offline']) {
    it(`${name}: at most one filled button, at least three quick actions, Open Side`, () => {
      const h = s(homeView(FIXTURES[name], {}));
      // Right after a wrap-up nothing needs doing, so there is no filled button (approved board).
      expect(fills(h)).toBe(name === 'wrapped' ? 0 : 1);
      expect(quickCount(h)).toBeGreaterThanOrEqual(3);
      expect(h).toContain('data-act="open-main"');
    });
  }

  it('night: offers to set today aside', () => {
    const h = s(homeView(FIXTURES.night, {}));
    expect(h).toContain('Stopping for today?');
    expect(h).toContain('Fold your 38 open tabs into groups');
    expect(h).toMatch(/btn fill[^>]*data-act="wrap"/);
  });

  it('day: the next step is the filled action, and tabs in Chrome and set aside are separate facts', () => {
    const h = s(homeView(FIXTURES.day, {}));
    expect(h).toContain('Next step · from yesterday');
    expect(h).toMatch(/btn fill[^>]*data-act="step-open"/);
    expect(h).toContain('<span>Tabs in Chrome</span><b>38</b>');
    expect(h).toContain('<span>Set aside</span><b>31 in 3 groups</b>');
    expect(h).toContain('You asked: Will annual pricing beat monthly?');
  });

  it('offline: says what is true, what to do, and greys out the two actions that need Chrome', () => {
    const h = s(homeView(FIXTURES.offline, {}));
    expect(h).toContain("Chrome isn't connected.");
    expect(h).toMatch(/btn fill[^>]*data-act="check"/);
    expect(h).toContain('Unknown until connected');
    expect((h.match(/Needs Chrome — connect first\./g) ?? []).length).toBe(2);
  });

  it('wrapped: says what Chrome confirmed and offers to bring the tabs back', () => {
    const h = s(homeView(FIXTURES.wrapped, {}));
    expect(h).toContain('31 tabs set aside in 3 groups.');
    expect(h).toContain("Bring back today's tabs");
  });
});

describe('Wrap up preview', () => {
  it('folds by default, with the result on the main button', () => {
    const h = s(previewView(FIXTURE_PREVIEW, { close: [], open: [] }));
    expect(h).toContain('Set today aside');
    expect(h).toMatch(/btn fill[^>]*>Set aside 31 tabs</);
    expect(fills(h)).toBe(1);
  });

  it('shows the tabs that will close as soon as Close is picked, and says the split', () => {
    const h = s(previewView(FIXTURE_PREVIEW, { close: ['g1'], open: [] }));
    expect(h).toContain('These 12 tabs will close. Undo brings them back.');
    expect(h).toContain('Pricing table patterns');
    expect(primaryLabel(FIXTURE_PREVIEW, ['g1'])).toBe('Fold 19 · Close 12');
    expect(primaryLabel(FIXTURE_PREVIEW, ['g1', 'g2', 'g3'])).toBe('Close 31 tabs');
  });

  it('lists what stays open with a reason, and excluded tabs only as a count', () => {
    const h = s(previewView(FIXTURE_PREVIEW, { close: [], open: [] }));
    expect(h).toContain("Pricing page — draft<span>You're on it</span>");
    expect(h).toContain('Inbox<span>Pinned</span>');
    expect(h).toContain('1 tab from an excluded site<span>Not read</span>');
  });

  it('says plainly when there is nothing to fold', () => {
    const h = s(previewView({ ...FIXTURE_PREVIEW, groups: [], foldCount: 0 }, { close: [], open: [] }));
    expect(h).toContain('Nothing to fold right now.');
  });

  it('while checking, says it saved first and only reports what Chrome confirms', () => {
    const h = s(checkingView(FIXTURE_PREVIEW, { close: [], open: [] }));
    expect(h).toContain('Saved on this computer.');
    expect(h).toContain('Checking with Chrome…');
    expect(h).toContain('sidy only reports what Chrome confirms.');
  });
});

const confirmed = (closed: number[] = []): SetAside => ({
  id: 'sa9', endedAt: 1, tabs: [], groups: [], kept: [], userLine: null, todayDone: [], closeRequested: closed.length > 0,
  status: 'applied',
  result: { grouped: [{ key: 'g1', chromeGroupId: 1, tabIds: [1, 2, 3] }, { key: 'g2', chromeGroupId: 2, tabIds: [4, 5] }], closed, kept: [] },
});

describe('Wrap up done', () => {
  it('leads with today, then the confirmed result, Undo, and one optional line', () => {
    const h = s(doneView(FIXTURES.wrapped, confirmed(), { line: '' }));
    expect(h).toContain('Today: set aside 31 tabs in 3 groups.');
    expect(h).toContain('5 tabs set aside in 2 groups.');
    expect(h).toContain('Chrome confirmed.');
    expect(h).toContain('Undo · bring back 5 tabs');
    expect(h).toContain('What are you most curious about tomorrow?');
    expect(h).toContain('data-act="skip"');
    expect(fills(h)).toBe(1);
  });

  it('counts what is still open from the confirmed record, not from an older tab count', () => {
    const sa = { ...confirmed(), kept: [{ tabId: 9, title: 'Draft', reason: 'active' as const }] };
    sa.result = { ...sa.result!, kept: [{ tabId: 10, reason: 'changed' as const }] };
    expect(s(doneView(FIXTURES.wrapped, sa, { line: '' }))).toContain('2 still open.');
  });

  it('counts closed tabs separately', () => {
    expect(s(doneView(FIXTURES.wrapped, confirmed([7, 8]), { line: '' }))).toContain('5 tabs folded in 2 groups, 2 closed.');
  });

  it('builds the today line from confirmed events, not page titles', () => {
    const h = s(doneView(FIXTURES.day, confirmed(), { line: '' }));
    expect(h).toContain('Today: came back to Pricing page — draft. Kept going on Pricing page — draft for 10+ minutes.');
  });
});

describe('Wrap up tomorrow suggestions', () => {
  const two = ['Why does the refund webhook fire twice?', 'Will annual pricing beat monthly?'];

  it('shows two tappable suggestions from Claude with their source, and the own-words field', () => {
    const h = s(doneView(FIXTURES.wrapped, confirmed(), { line: '', suggestions: two }));
    expect(h).toContain('data-act="chip" data-text="Why does the refund webhook fire twice?"');
    expect(h).toContain('Suggested by Claude from your group names.');
    expect(h).toContain('placeholder="Or write your own"');
  });

  it('marks only the picked one, and the line field holds it', () => {
    const h = s(doneView(FIXTURES.wrapped, confirmed(), { line: two[1], suggestions: two }));
    expect((h.match(/aria-pressed="true"/g) ?? []).length).toBe(1);
    expect(h).toMatch(/aria-pressed="true"[^>]*data-text="Will annual pricing beat monthly\?"/);
  });

  it('shows no chips and no Claude note when there are none', () => {
    const h = s(doneView(FIXTURES.wrapped, confirmed(), { line: '', suggestions: [] }));
    expect(h).not.toContain('data-act="chip"');
    expect(h).not.toContain('Suggested by Claude');
  });
});

describe('Wrap up failures', () => {
  it('tells a Chrome silence from a save failure, each with Try again', () => {
    const silent = s(failedView({ kind: 'unconfirmed' }));
    expect(silent).toContain("Chrome didn't answer.");
    expect(silent).toContain('nothing closes twice');
    const save = s(failedView({ kind: 'storage_failed', message: 'ENOSPC' }));
    expect(save).toContain("Couldn't save on this computer.");
    expect(save).toContain('Nothing was changed in Chrome.');
    for (const h of [silent, save]) expect(h).toMatch(/btn fill[^>]*data-act="retry"/);
  });
});

describe('One more hour', () => {
  const now = new Date(2026, 10, 9, 23, 40).getTime();
  it('respects, gives one fact, saves first, closes nothing, and asks when to check in', () => {
    const h = s(oneMoreView(now, 7 * 60 + 30, 60));
    expect(h).toContain('Sure. Keep going.');
    expect(h).toContain('What you did so far is saved. No tabs closed.');
    expect(h).toContain('<span>Now</span><b>11:40 PM</b>');
    expect(h).toContain('<span>Your wake-up</span><b>7:30 AM</b>');
    expect(h).toContain('<span>Stop now and you get</span><b>7 h 50 min</b>');
    expect(h).toMatch(/btn fill[^>]*>Check in at 12:40 AM</);
    expect(s(oneMoreView(now, 7 * 60 + 30, 30))).toContain('Check in at 12:10 AM');
  });

  it('never claims what sleep does', () => {
    expect(s(oneMoreView(now, 450, 60))).not.toMatch(/better|healthier|rested|productive/i);
    expect(untilWake(now, 450)).toBe('7 h 50 min');
  });
});
