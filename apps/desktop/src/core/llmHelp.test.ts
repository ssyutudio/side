import type { SavedTab } from '@side/shared';
import {
  askOnce,
  buildRecallRequest,
  buildSuggestRequest,
  parseRecall,
  parseSuggestions,
} from './llmHelp';

const tab = (tabId: number, title: string, url = `https://github.com/acme/r/${tabId}`): SavedTab => ({
  tabId, url, title, lastAccessed: tabId, position: null, groupKey: 'g1',
});

describe('night suggestions', () => {
  it('sends group names only, never addresses', () => {
    const req = buildSuggestRequest(['Retry research', 'Stripe webhooks https://evil.example/x', 'client-bank.com notes']);
    const sent = req.system + req.user;
    expect(sent).toContain('Retry research');
    expect(sent).not.toMatch(/https?:\/\//);
    expect(sent).not.toContain('client-bank.com');
  });

  it('keeps at most two short questions and drops anything else', () => {
    const out = parseSuggestions(JSON.stringify({ suggestions: [
      'Why does the refund webhook fire twice?',
      'Will annual pricing beat monthly?',
      'A third one?',
    ] }));
    expect(out).toEqual(['Why does the refund webhook fire twice?', 'Will annual pricing beat monthly?']);
  });

  it('rejects long lines, non-questions, links and advice', () => {
    const out = parseSuggestions(JSON.stringify({ suggestions: [
      'x'.repeat(80) + '?',
      'Read the docs.',
      'What is at https://example.com?',
      'Should you sleep more before deciding?',
      'What breaks when the queue is full?',
    ] }));
    expect(out).toEqual(['What breaks when the queue is full?']);
  });

  it('returns nothing for an answer that is not JSON', () => {
    expect(parseSuggestions('Sure! Here are some ideas')).toEqual([]);
  });
});

describe('morning recall', () => {
  const tabs = [
    tab(11, 'Exponential backoff - Wikipedia'),
    tab(12, 'Retry-After header https://developer.mozilla.org - MDN'),
    tab(13, 'Client 991 balance', 'https://client-bank.com/accounts/991'),
  ];

  it('sends the user line and titles with temporary ids, no URLs and no excluded tab', () => {
    const req = buildRecallRequest('Why does the 429 retry need jitter?', tabs, ['client-bank.com']);
    const sent = req.system + req.user;
    expect(sent).toContain('Why does the 429 retry need jitter?');
    expect(sent).toContain('T1: Exponential backoff - Wikipedia');
    expect(sent).not.toMatch(/https?:\/\//);
    expect(sent).not.toContain('Client 991');
    expect([...req.ids.values()]).toEqual([11, 12]);
  });

  it('accepts only an id that was sent', () => {
    const req = buildRecallRequest('jitter?', tabs, ['client-bank.com']);
    expect(parseRecall('{"id":"T2"}', req.ids)).toBe(12);
    expect(parseRecall('{"id":"T3"}', req.ids)).toBeNull();
    expect(parseRecall('{"id":"T9"}', req.ids)).toBeNull();
    expect(parseRecall('T1 looks best', req.ids)).toBeNull();
  });
});

describe('askOnce', () => {
  it('gives up at the deadline and ignores the late answer', async () => {
    let resolveLate!: (s: string) => void;
    const late = new Promise<string>((r) => (resolveLate = r));
    const out = await askOnce(() => late, { system: 's', user: 'u' }, 30);
    resolveLate('{"id":"T1"}');
    expect(out).toBeNull();
  });

  it('turns a failure into null', async () => {
    expect(await askOnce(async () => { throw new Error('529'); }, { system: 's', user: 'u' }, 1000)).toBeNull();
  });

  it('returns the text when it arrives in time', async () => {
    expect(await askOnce(async () => 'ok', { system: 's', user: 'u' }, 1000)).toBe('ok');
  });
});

import { stepForTab } from './llmHelp';
import type { SetAside } from '@side/shared';

describe('stepForTab', () => {
  const sa: SetAside = {
    id: 'sa1', endedAt: 1, status: 'applied', result: null, kept: [], todayDone: [], closeRequested: false,
    userLine: 'Why does the 429 retry need jitter?',
    groups: [{ key: 'g1', name: 'Retry research', tabIds: [11, 12], source: 'llm' }, { key: 'breaks', name: 'Breaks', tabIds: [13], source: 'rule' }],
    tabs: [
      { tabId: 11, url: 'https://en.wikipedia.org/wiki/Exponential_backoff', title: 'Exponential backoff - Wikipedia', lastAccessed: 1, position: { scroller: 'window', selector: null, top: 900, ratio: 0.4, quote: null, capturedAt: 1 }, groupKey: 'g1' },
      { tabId: 12, url: 'https://developer.mozilla.org/x', title: 'Retry-After - MDN', lastAccessed: 2, position: null, groupKey: 'g1' },
      { tabId: 13, url: 'https://www.youtube.com/watch?v=1', title: 'Lofi', lastAccessed: 3, position: null, groupKey: 'breaks' },
    ],
  };
  const clock = { now: () => 5 };

  it('builds a checked step for the picked tab, with the user line and the work name', () => {
    const st = stepForTab(sa, 11, [], clock, () => 'stX')!;
    expect(st.action.url).toBe('https://en.wikipedia.org/wiki/Exponential_backoff');
    expect(st.label).toBe('“Why does the 429 retry need jitter?” — Retry research is ready where you stopped.');
    expect(st.source).toBe('llm');
    expect(Object.values(st.checks).every(Boolean)).toBe(true);
  });

  it('refuses a break tab or an unknown tab', () => {
    expect(stepForTab(sa, 13, [], clock)).toBeNull();
    expect(stepForTab(sa, 99, [], clock)).toBeNull();
  });
});
