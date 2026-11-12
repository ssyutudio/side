import { FIXTURES, FIXTURE_PREVIEW, FIXTURE_PREVIEW_FILES } from '../shared/fixtures';
import { homeView } from './homeView';
import { askBlock, actFor } from './askView';
import { previewView, checkingView, doneView, failedView, primaryLabel } from './wrapView';
import { oneMoreView, untilWake } from './oneMoreView';
import { clock } from './parts';
import { stepOpenedText } from '../shared/stepText';
import { setLanguage, t, tn } from '../../i18n';
import { KO } from '../../i18n/ko';
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
    // The preview folds fewer than all open tabs, so no number is promised here.
    expect(h).toContain('Fold your open tabs into groups');
    expect(h).not.toMatch(/38 open tabs/);
    expect(h).not.toContain('Undo any time tonight');
    expect(h).toMatch(/btn fill[^>]*data-act="wrap"/);
  });

  it('day: the next step is the filled action, and tabs in Chrome and set aside are separate facts', () => {
    const h = s(homeView(FIXTURES.day, {}));
    expect(h).toContain('Next step · from yesterday');
    expect(h).toMatch(/btn fill[^>]*data-act="step-open"/);
    expect(h).toContain('<span>Tabs in Chrome</span><b>38</b>');
    expect(h).toContain('<span>Set aside</span><b>31 in 3 groups</b>');
    // The step label already carries the user's line, so it is not repeated.
    expect(h.match(/Will annual pricing beat monthly\?/g)).toHaveLength(1);
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

  it('while checking, does not claim a save, lets the footer grow, and only reports what Chrome confirms', () => {
    const h = s(checkingView(FIXTURE_PREVIEW, { close: [], open: [] }));
    expect(h).not.toContain('Saved on this computer.');
    expect(h).not.toMatch(/[^-]height:44px/);
    expect(h).toContain('min-height:44px');
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
    // No step events today: the result below is the only set-aside line.
    expect(h).not.toContain('Today:');
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

  it('counts tabs Side skipped (excluded, incognito, browser pages) as still open too', () => {
    const sa = { ...confirmed(), skipped: { excluded: 1, excludedByDomain: { 'bank.com': 1 }, incognito: 0, internal: 1 } };
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

  it('leaves out the sleep fact when the wake-up time is more than 12 hours away (daytime)', () => {
    const evening = new Date(2026, 10, 9, 19, 5).getTime();
    expect(s(oneMoreView(evening, 450, 60))).not.toContain('Stop now and you get');
  });

  it('never claims what sleep does', () => {
    expect(s(oneMoreView(now, 450, 60))).not.toMatch(/better|healthier|rested|productive/i);
    expect(untilWake(now, 450)).toBe('7 h 50 min');
  });
});

describe('Wrap up preview: drag to regroup', () => {
  it('lets each tab in an open group be dragged, and each group take drops or be dragged onto another', () => {
    const h = s(previewView(FIXTURE_PREVIEW, { close: [], open: ['g1'] }));
    expect(h).toContain('Drag a tab to another group or to a new one, or a group onto another to merge them.');
    expect(h).toMatch(/<li data-tab="\d+" title="Pricing table patterns">Pricing table patterns<\/li>/);
    expect((h.match(/data-drop="g\d"/g) ?? []).length).toBe(3);
    expect((h.match(/data-drag-group="g\d"/g) ?? []).length).toBe(3);
    // Native HTML5 dragging never delivers drops in a macOS panel window (Mini is one), so the
    // screen drags with pointer events and must not mark anything draggable.
    expect(h).not.toContain('draggable=');
  });
});

describe('Wrap up preview: files saved today (desktop apps)', () => {
  it('lists the files apart from the tab groups, says they are left alone, and keeps one filled button', () => {
    const h = s(previewView(FIXTURE_PREVIEW_FILES, { close: [], open: [] }));
    expect(h).toContain('<h4>Files saved today</h4>');
    expect(h).toContain('<li>november-orders.xlsx — Excel</li>');
    expect(h).toContain('Left as they are. sidy only remembers them for tomorrow.');
    expect(fills(h)).toBe(1);
    // Files never change the tab count on the button.
    expect(h).toMatch(/btn fill[^>]*>Set aside 31 tabs</);
  });

  it('shows no files block when no app is turned on', () => {
    expect(s(previewView(FIXTURE_PREVIEW, { close: [], open: [] }))).not.toContain('Files saved today');
  });
});

describe('Ask sidy in Mini', () => {
  it('idle: one line box with Ask, what goes to Claude, and still one filled button on the screen', () => {
    const h = s(homeView(FIXTURES.night, {}));
    expect(h).toContain('<label for="ask">Ask sidy</label>');
    expect(h).toContain('placeholder="e.g. I\'m done for today"');
    expect(h).toContain('Only this line goes to Claude, to pick one action.');
    expect(fills(h)).toBe(1);
  });

  it('asking: says so and locks the box', () => {
    const h = s(askBlock({ line: "I'm done for today", state: 'asking' }));
    expect(h).toContain('Asking sidy…');
    expect(h).toContain('readonly');
  });

  it('nothing fits, or a "do it for me": fixed sentence and the seven actions as buttons', () => {
    const h = s(askBlock({ line: 'order the groceries', state: 'reply', reply: { kind: 'declined', reason: 'outside_action', by: 'claude' } }));
    expect(h).toContain("I can't do that for you. I can open your work so you can do it yourself. I can do these:");
    expect((h.match(/data-act="ask-do"/g) ?? []).length).toBe(7);
    expect(h).toContain('Set aside today opens the preview first. Nothing closes.');
    expect(s(askBlock({ line: 'x', state: 'reply', reply: { kind: 'menu', by: 'words' } }))).toContain('I can do these:');
  });

  it('how-to: only a search phrase with Copy; a crisis line: the crisis sentence and no actions', () => {
    const how = s(askBlock({ line: 'vlookup?', state: 'reply', reply: { kind: 'how_to', search: 'Excel VLOOKUP tutorial', by: 'claude' } }));
    expect(how).toContain('<code>Excel VLOOKUP tutorial</code>');
    expect(how).toContain('data-act="ask-copy"');
    const crisis = s(askBlock({ line: 'x', state: 'reply', reply: { kind: 'crisis', by: 'words' } }));
    expect(crisis).toContain('988');
    expect(crisis).not.toContain('ask-do');
  });

  it('escapes the typed line, and each action maps to one of Mini\'s own buttons', () => {
    expect(s(askBlock({ line: '"><script>x</script>', state: 'idle' }))).not.toContain('<script>');
    expect(actFor('set_aside')).toBe('wrap');
    expect(actFor('set_session_check')).toBe('one-more');
    expect(actFor('quiet_hour')).toBe('focus');
  });
});

describe('One more hour with the calendar on', () => {
  it("counts to tomorrow's first event (time only, no title) instead of the wake-up time", () => {
    const st = FIXTURES['cal-on'];
    const h = s(oneMoreView(st.now, 450, 60, st));
    expect(h).toContain('<span>First event tomorrow</span><b>9:30 AM</b>');
    expect(h).toContain('<span>Stop now and you get</span><b>9 h 50 min</b>');
    expect(h).not.toContain('Your wake-up');
  });

  it('falls back to the wake-up time when the calendar is off', () => {
    expect(s(oneMoreView(FIXTURES['cal-on'].now, 450, 60, FIXTURES.day))).toContain('Your wake-up');
  });
});

describe('Mini shows the desktop apps that are on', () => {
  it('lists them as one fact, and shows nothing when none is on', () => {
    expect(s(homeView(FIXTURES['apps-on'], {}))).toContain('<span>Desktop apps</span><b>Excel</b>');
    expect(s(homeView(FIXTURES.night, {}))).not.toContain('Desktop apps');
  });
});

describe('Wrap up preview: new group and rename', () => {
  it('has a pencil per group and one dashed drop box for a new group', () => {
    const h = s(previewView(FIXTURE_PREVIEW, { close: [], open: [] }));
    expect((h.match(/data-act="rename"/g) ?? []).length).toBe(3);
    expect(h).toContain('data-drop="__new"');
    expect(fills(h)).toBe(1);
  });

  it('while renaming, shows the name in a box with Save instead of the group button', () => {
    const h = s(previewView(FIXTURE_PREVIEW, { close: [], open: [], renaming: 'g2' }));
    expect(h).toMatch(/<form class="rn" data-key="g2">[\s\S]*value="Stripe webhooks"[\s\S]*>Save<\/button><\/form>/);
    expect(h).not.toContain('data-drag-group="g2"');
    expect(h).toContain('data-drag-group="g1"');
  });
});

describe('Mini in Korean', () => {
  beforeEach(() => setLanguage('ko'));
  afterEach(() => setLanguage('en'));

  /** The screen has the Korean for an English key, and not the English. */
  const says = (h: string, en: string, vars?: Record<string, string | number>) => {
    const ko = t(en, vars);
    // The side wordplay names stay English on Korean screens.
    if (KO[en] === en) return void expect(h).toContain(en);
    expect(ko).not.toBe(en.replace(/\{(\w+)\}/g, (m, k) => String(vars?.[k] ?? m)));
    expect(h).toContain(ko);
    expect(h).not.toContain(en);
  };

  it('home: night, day, wrapped and offline', () => {
    const night = s(homeView(FIXTURES.night, {}));
    says(night, 'Stopping for today?');
    says(night, 'Fold your open tabs into groups');
    says(night, 'Ask sidy');
    says(night, 'Open Side');
    expect(night).toContain(`<span>${t('Tabs in Chrome')}</span><b>38</b>`);
    expect(night).toContain(t('Chrome connected'));
    const day = s(homeView(FIXTURES.day, {}));
    says(day, 'Step inside');
    expect(day).toContain(`<b>${t('{tabs} in {groups}', { tabs: 31, groups: tn(3, '{n} group', '{n} groups') })}</b>`);
    const wrapped = s(homeView(FIXTURES.wrapped, {}));
    says(wrapped, '{tabs} tabs set aside in {groups}.', { tabs: 31, groups: tn(3, '{n} group', '{n} groups') });
    says(wrapped, "Bring back today's tabs");
    const offline = s(homeView(FIXTURES.offline, {}));
    says(offline, "Chrome isn't connected.");
    says(offline, 'Check again');
  });

  it('preview, checking, done, failed', () => {
    const local = { close: [], open: [] };
    const preview = s(previewView(FIXTURE_PREVIEW, local));
    for (const en of ['Set today aside', 'Fold', 'Rename', 'Drop a tab here to start a new group', 'Cancel']) says(preview, en);
    says(s(checkingView(FIXTURE_PREVIEW, local)), 'Checking with Chrome…');
    const done = s(doneView(FIXTURES.day, confirmed(), { line: '' }));
    says(done, 'Chrome confirmed.');
    says(done, 'What are you most curious about tomorrow?');
    says(done, 'Skip');
    expect(done).toContain(t('Today: {text}', { text: '' }));
    says(s(failedView({ kind: 'unconfirmed' })), "Chrome didn't answer.");
    says(s(failedView({ kind: 'storage_failed', message: 'ENOSPC' })), "Couldn't save on this computer.");
  });

  it('one more hour and the clock', () => {
    const h = s(oneMoreView(FIXTURES.night.now, 450, 60, FIXTURES.night));
    says(h, 'Done — set aside now');
    says(s(failedView({ kind: 'unconfirmed' })), 'Try again');
    says(h, 'Check in with me in');
    // 11:40 PM reads as "PM 11:40": the part of day first.
    expect(clock(new Date(2026, 10, 12, 23, 40).getTime())).toBe('\uC624\uD6C4 11:40');
    expect(clock(new Date(2026, 10, 12, 0, 5).getTime())).toBe('\uC624\uC804 12:05');
  });

  it('ask: the note, and a reply', () => {
    says(s(askBlock({ line: '', state: 'idle' })), 'Tell sidy in a few words. Only this line goes to Claude, to pick one action. Set aside only opens the preview.');
    const how = s(askBlock({ line: 'x', state: 'reply', reply: { kind: 'how_to', search: 'Excel VLOOKUP tutorial', by: 'claude' } }));
    says(how, "I don't give guides. Search for:");
    says(how, 'Copy');
    expect(how).toContain('<code>Excel VLOOKUP tutorial</code>');
  });

  it('step text', () => {
    expect(stepOpenedText({ kind: 'opened', restored: 'top' })).toBe(t("Opened the page. sidy couldn't find the exact spot."));
    expect(stepOpenedText({ kind: 'opened', restored: 'top' })).not.toContain('Opened');
  });
});

describe('Mini QA fixes', () => {
  it('group names and tab rows carry the full text in a title', () => {
    const long = { ...FIXTURE_PREVIEW, groups: [{ ...FIXTURE_PREVIEW.groups[0], name: 'A very long group name that gets cut off by the panel' }, ...FIXTURE_PREVIEW.groups.slice(1)] };
    const h = s(previewView(long, { close: [], open: [long.groups[0].key] }));
    expect(h).toContain('title="A very long group name that gets cut off by the panel"');
    expect(h).toContain(`title="${long.groups[0].tabs[0].title}"`);
  });

  it('the header close button is named Close Mini', () => {
    expect(s(homeView(FIXTURES.night, {}))).toContain('aria-label="Close Mini"');
    expect(s(homeView(FIXTURES.night, {}))).not.toContain('aria-label="Close"');
  });

  it('says 1 tab, not 1 tabs', () => {
    const one = { ...FIXTURE_PREVIEW, groups: [{ ...FIXTURE_PREVIEW.groups[0], tabs: FIXTURE_PREVIEW.groups[0].tabs.slice(0, 1) }] };
    const key = one.groups[0].key;
    expect(primaryLabel(one, [key])).toBe('Close 1 tab');
    expect(s(previewView(one, { close: [key], open: [] }))).toContain('This 1 tab will close. Undo brings it back.');
    const w = { ...FIXTURES.wrapped, lastWrapup: { ...FIXTURES.wrapped.lastWrapup!, groups: [{ key: 'g1', name: 'One', count: 1 }] } };
    expect(s(homeView(w, {}))).toContain('1 tab set aside in 1 group.');
    const sa = { ...confirmed([7]), result: { grouped: [{ key: 'g1', chromeGroupId: 1, tabIds: [1] }], closed: [7], kept: [] } };
    expect(s(doneView(FIXTURES.wrapped, sa, { line: '' }))).toContain('1 tab folded in 1 group, 1 closed.');
  });

  it('done: no repeated set-aside line, no "0 still open", but step events still lead', () => {
    const noEvents = s(doneView(FIXTURES.wrapped, { ...confirmed(), todayDone: ['Set aside 31 tabs in 3 groups.'] }, { line: '' }));
    expect(noEvents).not.toContain('class="today"');
    expect(noEvents).not.toContain('still open.');
    expect(s(doneView(FIXTURES.day, confirmed(), { line: '' }))).toContain('class="today"');
  });

  it('home: a wrap-up Chrome never confirmed offers Try again with that id', () => {
    for (const status of ['unconfirmed', 'failed'] as const) {
      const w = { ...FIXTURES.night, lastWrapup: { ...FIXTURES.wrapped.lastWrapup!, status, id: 'sa7' } };
      const h = s(homeView(w, {}));
      expect(h).toContain("Chrome didn't confirm the last wrap-up.");
      expect(h).toMatch(/data-act="retry-last" data-id="sa7"/);
    }
    expect(s(homeView(FIXTURES.wrapped, {}))).not.toContain('retry-last');
  });

  it('Step inside shows Opening… and locks the button while waiting', () => {
    const h = s(homeView(FIXTURES.day, { stepBusy: true }));
    expect(h).toContain('Opening…');
    expect(h).toMatch(/data-act="step-open"[^>]*aria-disabled="true"/);
    expect(s(homeView(FIXTURES.day, {}))).not.toContain('Opening…');
  });

  it('Ask sidy: no next-step button without a step; Exclude points at Open Side; privacy note follows Claude', () => {
    const menu = { kind: 'menu' as const, by: 'words' as const };
    const reply = { line: 'x', state: 'reply' as const, reply: menu };
    expect(s(askBlock(reply, { hasStep: false }))).not.toContain('data-action="open_step"');
    expect(s(askBlock(reply, { hasStep: true }))).toContain('data-action="open_step"');
    const all = s(askBlock(reply));
    expect(all).not.toContain('Exclude this site');
    expect(all).toContain('Open Side, then Excluded sites');
    expect(s(askBlock({ line: '', state: 'idle' }, { claude: false }))).toContain('This line stays on this computer, and simple rules pick one action.');
    expect(s(askBlock({ line: '', state: 'idle' }, { claude: false }))).not.toContain('goes to Claude');
    expect(s(askBlock({ line: '', state: 'idle' }, { claude: true }))).toContain('Only this line goes to Claude');
    const off = { ...FIXTURES.night, settings: { ...FIXTURES.night.settings, llmEnabled: false } };
    expect(s(homeView(off, {}))).toContain('stays on this computer');
    const noKey = { ...FIXTURES.night, saw: { ...FIXTURES.night.saw, llm: { ...FIXTURES.night.saw.llm, available: false } } };
    expect(s(homeView(noKey, {}))).toContain('stays on this computer');
    expect(s(homeView(FIXTURES.night, {}))).toContain('Only this line goes to Claude');
    expect(s(homeView(FIXTURES.night, { ask: reply }))).not.toContain('data-action="open_step"');
  });
});
