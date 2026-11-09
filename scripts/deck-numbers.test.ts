import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { computeNumbers, waitlistUrlFrom, writeNumbers } from './deck-numbers.mjs';

const applied = (id: string, tabIds: number[], closed: number[], userLine: string | null) => ({
  id, endedAt: 1, tabs: tabIds.map((t) => ({ tabId: t })), groups: [], kept: [], userLine, todayDone: [],
  closeRequested: closed.length > 0, status: 'applied',
  result: { grouped: [{ key: 'g', chromeGroupId: 1, tabIds }], closed, kept: [] },
});

describe('computeNumbers', () => {
  it('reports no data for an empty or missing file, with no invented values', () => {
    const n = computeNumbers(null);
    expect(n.hasData).toBe(false);
    expect(n.tabsSetAside).toBe(0);
    expect(n.clickRate).toEqual({ value: null, n: 0 });
  });

  it('counts only confirmed set-asides, unique tabs, and lines actually written', () => {
    const n = computeNumbers({
      setAsides: [
        applied('a', [1, 2, 3], [3], 'why cap jitter?'),
        applied('b', [4, 5], [], null),
        { ...applied('c', [6, 7], [], 'x'), status: 'unconfirmed', result: null },
        { ...applied('d', [8], [], 'y'), status: 'undone' },
      ],
      spokeAt: [1, 2, 3],
      stepEvents: [
        { stepId: 's1', shownAt: 1, clickedAt: 2, openedAt: 3, stillWorkingAt10m: true, dismissed: null },
        { stepId: 's2', shownAt: 1, clickedAt: null, openedAt: null, stillWorkingAt10m: null, dismissed: 'not_now' },
        { stepId: 's3', shownAt: 1, clickedAt: 5, openedAt: 6, stillWorkingAt10m: false, dismissed: null },
      ],
    });
    expect(n.wrapUps).toBe(2);
    expect(n.tabsSetAside).toBe(5);
    expect(n.linesSetAside).toBe(1);
    expect(n.broughtBackWithUndo).toBe(1);
    expect(n.sidySpoke).toBe(3);
    expect(n.stepsShown).toBe(3);
    expect(n.stepsClicked).toBe(2);
    expect(n.clickRate).toEqual({ value: 2 / 3, n: 3 });
    expect(n.stillWorking10m).toBe(1);
    expect(n.stillWorkingRate).toEqual({ value: 1 / 2, n: 2 });
    expect(n.hasData).toBe(true);
    expect(n.users).toBe(1);
  });
});

describe('waitlistUrlFrom', () => {
  it('takes the origin of the deployed usage endpoint, or null while it is not set', () => {
    expect(waitlistUrlFrom("export const USAGE_ENDPOINT: string | null = 'https://side-waitlist.vercel.app/api/usage';")).toBe('https://side-waitlist.vercel.app');
    expect(waitlistUrlFrom('export const USAGE_ENDPOINT: string | null = null;')).toBeNull();
  });
});

describe('writeNumbers', () => {
  it('writes the JSON and a script file the deck can load from file://', () => {
    const dir = mkdtempSync(join(tmpdir(), 'deck-'));
    writeNumbers(dir, { ...computeNumbers(null), generatedAt: '2026-11-09T12:00:00.000Z' });
    const json = JSON.parse(readFileSync(join(dir, 'numbers.json'), 'utf8'));
    expect(json.hasData).toBe(false);
    const js = readFileSync(join(dir, 'numbers.js'), 'utf8');
    expect(js.startsWith('window.SIDE_NUMBERS = ')).toBe(true);
    writeFileSync(join(dir, 'x'), '');
  });
});
