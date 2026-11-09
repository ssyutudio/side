import { FIXTURES } from '../shared/fixtures';
import { shellView, loadingView, errorView } from './shell';
import { todayView } from './today';
import { historyView } from './history';
import { excludedView } from './excluded';
import { sawView } from './saw';
import { settingsView } from './settings';
import { shortcutKeys, minutesToClock, splitStepLabel } from './format';

const s = (x: unknown) => String(x);
const fills = (h: string) => (h.match(/class="btn fill/g) ?? []).length;
const BANNED = /backlog|missed|overdue|this Mac|Mac app|lorem|TODO/i;

describe('format helpers', () => {
  it('shows the shortcut as macOS key symbols', () => {
    expect(shortcutKeys('Control+Alt+S')).toBe('⌃⌥S');
    expect(shortcutKeys('CommandOrControl+Shift+K')).toBe('⌘⇧K');
  });
  it('turns minutes after midnight into a clock time', () => {
    expect(minutesToClock(0)).toBe('12:00 AM');
    expect(minutesToClock(7 * 60 + 30)).toBe('7:30 AM');
    expect(minutesToClock(22 * 60)).toBe('10:00 PM');
  });
  it('splits a step label into the question the user asked and the step', () => {
    expect(splitStepLabel('“Will annual pricing beat monthly?” — Pricing page is ready where you stopped.')).toEqual({
      asked: 'Will annual pricing beat monthly?',
      title: 'Pricing page is ready where you stopped.',
    });
    expect(splitStepLabel('Pricing page is ready to open.')).toEqual({ asked: null, title: 'Pricing page is ready to open.' });
  });
});

describe('shell', () => {
  it('marks the current section and shows the connection truthfully', () => {
    const h = s(shellView('history', FIXTURES.offline, s(historyView(FIXTURES.offline))));
    expect(h).toMatch(/aria-current="page"[^>]*data-section="history"|data-section="history"[^>]*aria-current="page"/);
    expect(h).toContain('Chrome not connected');
    for (const t of ['Today', 'History', 'Excluded sites', 'What Side saw', 'Settings']) expect(h).toContain(t);
  });
  it('has loading and error states with what to do next', () => {
    expect(s(loadingView())).toContain('Loading your history…');
    const e = s(errorView());
    expect(e).toContain("Side couldn't read its data file on this computer. Your tabs in Chrome are untouched.");
    expect(e).toContain('Try again');
    expect(fills(e)).toBe(1);
  });
});

describe('Today', () => {
  it('puts the next step first, with its real date and one filled button', () => {
    const h = s(todayView(FIXTURES.day));
    expect(h.indexOf('Next step · from yesterday')).toBeLessThan(h.indexOf('tabs in Chrome'));
    expect(h).toContain('Pricing page is ready where you stopped.');
    expect(h).toContain('You asked: “Will annual pricing beat monthly?”');
    expect(h).not.toContain('““');
    expect(h).toContain('data-act="step-open" data-step="st1"');
    expect(fills(h)).toBe(1);
    expect(h).not.toMatch(BANNED);
  });
  it('says it is still learning until three steps were opened, from counts only', () => {
    const h = s(todayView(FIXTURES.day));
    expect(h).toContain('sidy is still learning what gets you started. 2 steps opened so far');
    expect(h).toContain('From your own counts only — no titles or sites.');
  });
  it('labels a sentence Claude wrote from the counts', () => {
    const h = s(todayView({ ...FIXTURES.day, bySide: { text: '3 of the 4 steps you could judge kept you going past 10 minutes.', byClaude: true } }));
    expect(h).toContain('3 of the 4 steps you could judge kept you going past 10 minutes.');
    expect(h).toContain('Written by Claude from your own counts only — no titles or sites.');
  });
  it('shows today\'s moments with times and why sidy stayed quiet', () => {
    const h = s(todayView(FIXTURES.day));
    expect(h).toContain('9:05 AM');
    expect(h).toContain('You stepped inside — page ready in 1.4 s');
    expect(h).toContain('Why sidy stayed quiet');
    expect(h).toContain('already spoke within the hour');
  });
  it('offers to set today aside on the first day', () => {
    const h = s(todayView(FIXTURES['first-day']));
    expect(h).toContain('Set today aside when you stop');
    expect(h).toContain('data-act="wrap"');
    expect(h).toContain('Nothing yet. Steps and wrap-ups show up here.');
    expect(fills(h)).toBe(1);
  });
  it('labels a step from days ago by its date', () => {
    expect(s(todayView(FIXTURES['three-days']))).toContain('Next step · from Mon, Nov 9');
  });
});

describe('History', () => {
  it('gives each day its own detail and never counts days off', () => {
    const h = s(historyView(FIXTURES.day));
    expect((h.match(/<details/g) ?? []).length).toBe(2);
    expect(h).toContain('Set aside 31 tabs · 3 groups');
    expect(h).toContain('Will annual pricing beat monthly?');
    expect(h).toContain('(skipped)');
    expect(h).not.toMatch(BANNED);
  });
  it('has an empty state with one action', () => {
    const h = s(historyView(FIXTURES['first-day']));
    expect(h).toContain('No days yet. Your first wrap-up shows up here.');
    expect(fills(h)).toBe(1);
  });
});

describe('Excluded sites', () => {
  it('lists sites with skipped counts only, never a tab title', () => {
    const h = s(excludedView(FIXTURES.day, { input: '', error: null }));
    expect(h).toContain('client-portal.acme.com');
    expect(h).toContain('1 tab');
    expect(h).toContain('data-act="exclude-remove" data-domain="client-portal.acme.com"');
    expect(h).toContain('<label for="exclude-domain">Add a site</label>');
  });
  it('shows a specific message under the field', () => {
    const h = s(excludedView(FIXTURES.day, { input: 'not a site', error: "That doesn't look like a site address. Try something like mybank.com." }));
    expect(h).toContain('role="alert"');
    expect(h).toContain('value="not a site"');
  });
  it('has an empty state', () => {
    expect(s(excludedView(FIXTURES['first-day'], { input: '', error: null }))).toContain('No sites excluded. Add one above — its tabs are never saved or sent.');
  });
});

describe('What Side saw', () => {
  it('shows what was read, skipped by count, and exactly what was sent', () => {
    const h = s(sawView(FIXTURES.day, { showAll: false }));
    expect(h).toContain('<b>37</b>tabs read');
    expect(h).toContain('<b>36</b>titles sent to Claude');
    expect(h).toContain('1 tab from client-portal.acme.com — excluded site, not read.');
    expect(h).toContain('36 tab titles and your one line, to Claude (Anthropic), to name groups. No addresses, no page text, nothing from excluded sites.');
    expect(h).toContain('Anonymous counts: off.');
    expect(h).toContain('Show all 37');
    expect((h.match(/<tr>/g) ?? []).length).toBe(11);
    expect(h).not.toMatch(BANNED);
  });
  it('lists every tab when asked', () => {
    expect((s(sawView(FIXTURES.day, { showAll: true })).match(/<tr>/g) ?? []).length).toBe(38);
  });
  it('says nothing was sent when AI drafting is off', () => {
    const off = { ...FIXTURES.day, saw: { ...FIXTURES.day.saw, llm: { ...FIXTURES.day.saw.llm, enabled: false } } };
    expect(s(sawView(off, { showAll: false }))).toContain('AI drafting is off');
  });
  it('has an empty state', () => {
    expect(s(sawView(FIXTURES['first-day'], { showAll: false }))).toContain("After your first wrap-up you'll see every tab Side read and skipped.");
  });
});

describe('Settings', () => {
  it('shows the current size, the shortcut, and AI drafting on with its data promise', () => {
    const h = s(settingsView(FIXTURES.day));
    expect(h).toMatch(/aria-pressed="true"[^>]*data-size="small"|data-size="small"[^>]*aria-pressed="true"/);
    expect(h).toContain('⌃⌥S');
    expect(h).toContain('On: sends tab titles and your one line to Claude (Anthropic) to name groups. Never addresses, page text or excluded sites. Off: sidy uses simple rules.');
    expect(h).toMatch(/data-key="llmEnabled"[^>]*aria-checked="true"|aria-checked="true"[^>]*data-key="llmEnabled"/);
    expect(h).toMatch(/data-key="uploadEnabled"[^>]*aria-checked="false"|aria-checked="false"[^>]*data-key="uploadEnabled"/);
    expect(h).toContain('Connections');
    expect(h).not.toMatch(BANNED);
  });
  it('shows times with English clock labels, not the system locale', () => {
    const h = s(settingsView(FIXTURES.day));
    expect(h).not.toContain('type="time"');
    expect(h).toMatch(/<option value="1350" selected>10:30 PM<\/option>/);
    expect(h).toMatch(/<option value="450" selected>7:30 AM<\/option>/);
  });

  it('shows Chrome as not connected with a way to check again', () => {
    const h = s(settingsView(FIXTURES.offline));
    expect(h).toContain('Not connected');
    expect(h).toContain('data-act="check"');
  });
});
