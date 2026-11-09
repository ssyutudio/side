import type { PagePosition, SavedTab, SetAside, Step } from '@side/shared';
import { buildStep, checkStep, currentStep, latestSetAside } from './step';
import { fixedClock } from './clock';

const pos: PagePosition = { scroller: 'element', selector: '.kix-appview-editor', top: 1800, ratio: 0.4, quote: 'Retries back off', capturedAt: 1 };

function saved(tabId: number, url: string, title: string, groupKey: string, lastAccessed: number, position: PagePosition | null = null): SavedTab {
  return { tabId, url, title, lastAccessed, position, groupKey };
}

function sa(id: string, endedAt: number, tabs: SavedTab[], userLine: string | null = null, status: SetAside['status'] = 'applied'): SetAside {
  return { id, endedAt, tabs, groups: [], kept: [], userLine, todayDone: [], closeRequested: false, status, result: null };
}

const clock = fixedClock(10_000);
let n = 0;
const ids = () => `step-${++n}`;

describe('latestSetAside', () => {
  it('uses the actual latest record and skips undone ones', () => {
    const a = sa('a', 100, []);
    const b = sa('b', 300, [], null, 'undone');
    const c = sa('c', 200, []);
    expect(latestSetAside([a, b, c])?.id).toBe('c');
    expect(latestSetAside([])).toBeNull();
  });
});

describe('buildStep', () => {
  const tabs = [
    saved(1, 'https://www.youtube.com/watch?v=1', 'Talk - YouTube', 'breaks', 900),
    saved(2, 'https://github.com/acme/retry-queue/pull/12', 'PR 12 · acme/retry-queue', 'gh:acme/retry-queue', 800),
    saved(3, 'https://docs.google.com/document/d/D1/edit', 'Retry design notes - Google Docs', 'doc:D1', 700, pos),
    saved(4, 'https://github.com/acme/retry-queue', 'acme/retry-queue', 'gh:acme/retry-queue', 600, pos),
    saved(5, 'https://weather.example.com', 'Weather', 'unsorted', 950),
  ];

  it('opens the most recent work, preferring a tab with a known position inside it', () => {
    const step = buildStep(sa('s', 1000, tabs), [], clock, ids)!;
    expect(step.action.type).toBe('open_url');
    expect(step.action.url).toBe('https://github.com/acme/retry-queue');
    expect(step.action.position).toEqual(pos);
    expect(step.fromSetAside).toBe('s');
    expect(step.checks).toEqual({ noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true });
  });

  it('uses the user line and never assumes the day', () => {
    const step = buildStep(sa('s', 1000, tabs, 'Why does jitter double the wait?'), [], clock, ids)!;
    expect(step.label).toContain('Why does jitter double the wait?');
    expect(step.label.toLowerCase()).not.toContain('yesterday');
  });

  it('does not claim an exact spot when no position was captured', () => {
    const only = [saved(2, 'https://github.com/acme/retry-queue/pull/12', 'PR 12 · acme/retry-queue', 'gh:acme/retry-queue', 800)];
    const step = buildStep(sa('s', 1000, only), [], clock, ids)!;
    expect(step.label).not.toMatch(/where you (stopped|left)/i);
  });

  it('returns null when only breaks are left', () => {
    expect(buildStep(sa('s', 1000, [tabs[0]]), [], clock, ids)).toBeNull();
  });

  it('skips tabs from excluded sites', () => {
    const step = buildStep(sa('s', 1000, tabs), ['github.com'], clock, ids)!;
    expect(step.action.url).toBe('https://docs.google.com/document/d/D1/edit');
  });
});

describe('checkStep', () => {
  const base: Step = {
    id: 'x', fromSetAside: 's', createdAt: 0, label: 'l', source: 'rule',
    action: { type: 'open_url', url: 'https://docs.google.com/document/d/1', title: 't', position: null },
    checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true },
  };
  it('passes a plain work URL', () => {
    expect(checkStep(base, []).ok).toBe(true);
  });
  it('fails a video page (not a real work tool)', () => {
    const r = checkStep({ ...base, action: { ...base.action, url: 'https://www.youtube.com/watch?v=1' } }, []);
    expect(r.ok).toBe(false);
    expect(r.checks.inRealTool).toBe(false);
  });
  it('fails a URL that could not open safely', () => {
    for (const url of ['javascript:alert(1)', 'file:///etc/passwd', 'not a url', 'https://client-bank.com/x']) {
      const r = checkStep({ ...base, action: { ...base.action, url } }, ['client-bank.com']);
      expect(r.ok).toBe(false);
      expect(r.checks.cannotFail).toBe(false);
    }
  });
  it('fails anything other than opening a page', () => {
    const r = checkStep({ ...base, action: { ...base.action, type: 'run_command' as 'open_url' } }, []);
    expect(r.ok).toBe(false);
    expect(r.checks.noJudgment).toBe(false);
  });
});

describe('currentStep', () => {
  it('gives exactly one step after three days away, from the latest record, reusing the stored one', () => {
    const older = sa('old', 100, [saved(1, 'https://github.com/acme/a', 'acme/a', 'gh:acme/a', 50)]);
    const latest = sa('new', 200, [saved(2, 'https://github.com/acme/b', 'acme/b', 'gh:acme/b', 150)]);
    const threeDaysLater = fixedClock(200 + 3 * 86_400_000);
    const first = currentStep([older, latest], [], [], threeDaysLater, ids)!;
    expect(first.fromSetAside).toBe('new');
    const again = currentStep([older, latest], [first], [], threeDaysLater, ids)!;
    expect(again.id).toBe(first.id);
  });

  it('is null when nothing was ever set aside', () => {
    expect(currentStep([], [], [], clock, ids)).toBeNull();
  });
});

describe('step label with a long line from the user', () => {
  it('shortens the quoted line so the ready part always survives', async () => {
    const { step } = await import('./copy');
    const long = 'Why does the refund webhook fire twice when the customer upgrades from monthly to annual in the middle of a trial?';
    const label = step.label('Stripe webhooks', long, true);
    expect(label.endsWith('Stripe webhooks is ready where you stopped.')).toBe(true);
    expect(label.length).toBeLessThan(130);
    expect(label).toContain('…');
    expect(step.label('Pricing page', 'Will annual beat monthly?', false)).toBe('“Will annual beat monthly?” — Pricing page is ready to open.');
  });
});
