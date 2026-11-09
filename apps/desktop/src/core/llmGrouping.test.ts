import type { TabSnapshot } from '@side/shared';
import { buildGroupingRequest, parseGroupingAnswer, groupWithLlm } from './llmGrouping';
import { fixedClock } from './clock';

function tab(tabId: number, url: string, title: string): TabSnapshot {
  return {
    tabId, windowId: 1, index: tabId, url, title, lastAccessed: tabId, active: false, pinned: false,
    audible: false, incognito: false, groupId: -1, groupTitle: null, position: null,
  };
}

const tabs = [
  tab(1, 'https://github.com/acme/retry-queue/pull/12', 'Add jitter · Pull Request #12 · acme/retry-queue'),
  tab(2, 'https://docs.google.com/document/d/1AbC/edit', 'Retry design notes - Google Docs'),
  tab(3, 'https://www.youtube.com/watch?v=x', 'Lo-fi beats - YouTube'),
  tab(4, 'https://client-bank.com/accounts', 'Client ledger'),
];

describe('buildGroupingRequest', () => {
  it('sends titles with temporary ids and the user line, never URLs', () => {
    const req = buildGroupingRequest(tabs, 'Why does jitter double the wait?', [], fixedClock(0));
    const text = req.system + '\n' + req.user;
    expect(req.user).toContain('T1: Add jitter');
    expect(req.user).toContain('Why does jitter double the wait?');
    for (const t of tabs) {
      expect(text).not.toContain(t.url);
      expect(text).not.toContain(new URL(t.url).host);
    }
    expect(text).not.toMatch(/https?:/);
  });

  it('leaves out tabs from excluded sites entirely', () => {
    const req = buildGroupingRequest(tabs, null, ['client-bank.com'], fixedClock(0));
    expect(req.user).not.toContain('Client ledger');
    expect([...req.ids.values()]).not.toContain(4);
  });
});

describe('parseGroupingAnswer', () => {
  const clock = fixedClock(1000);
  const req = buildGroupingRequest(tabs.slice(0, 3), null, [], fixedClock(0), 5000);

  it('turns a valid answer into llm groups and validates names', () => {
    const answer = '```json\n{"groups":[{"name":"  Retry queue jitter fix for the durable job runner  ","ids":["T1","T2"]},{"name":"Breaks","ids":["T3"]}]}\n```';
    const r = parseGroupingAnswer(answer, req, req.token, tabs.slice(0, 3), clock);
    expect(r.applied).toBe(true);
    expect(r.groups[0].tabIds).toEqual([1, 2]);
    expect(r.groups[0].source).toBe('llm');
    expect(r.groups[0].name.length).toBeLessThanOrEqual(40);
    expect(r.groups[1].tabIds).toEqual([3]);
  });

  it('drops unknown ids, uses each id once and sends leftovers to the rules', () => {
    const answer = '{"groups":[{"name":"Retry","ids":["T1","T9","T1"]}]}';
    const r = parseGroupingAnswer(answer, req, req.token, tabs.slice(0, 3), clock);
    expect(r.applied).toBe(true);
    expect(r.groups.find((g) => g.source === 'llm')?.tabIds).toEqual([1]);
    const all = r.groups.flatMap((g) => g.tabIds).sort();
    expect(all).toEqual([1, 2, 3]);
    expect(r.groups.filter((g) => g.source === 'rule').length).toBeGreaterThan(0);
  });

  it('falls back to rules on text that is not the expected JSON', () => {
    const r = parseGroupingAnswer('Sure! Here are your groups: retry stuff.', req, req.token, tabs.slice(0, 3), clock);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('unparseable');
    expect(r.groups.every((g) => g.source === 'rule')).toBe(true);
  });

  it('does not apply a late answer', () => {
    const late = parseGroupingAnswer('{"groups":[{"name":"X","ids":["T1"]}]}', req, req.token, tabs.slice(0, 3), fixedClock(999_999));
    expect(late.applied).toBe(false);
    expect(late.reason).toBe('late');
  });

  it('does not apply an answer for an older request', () => {
    const stale = parseGroupingAnswer('{"groups":[{"name":"X","ids":["T1"]}]}', req, 'newer-token', tabs.slice(0, 3), clock);
    expect(stale.applied).toBe(false);
    expect(stale.reason).toBe('stale');
  });
});

describe('groupWithLlm', () => {
  it('uses the rules when the transport fails', async () => {
    const r = await groupWithLlm(tabs.slice(0, 3), null, [], async () => {
      throw new Error('network down');
    }, fixedClock(0), 1000);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('error');
    expect(r.groups.flatMap((g) => g.tabIds).sort()).toEqual([1, 2, 3]);
  });

  it('uses the rules when the transport is too slow', async () => {
    const r = await groupWithLlm(tabs.slice(0, 3), null, [], () => new Promise((res) => setTimeout(() => res('{}'), 200)), fixedClock(0), 20);
    expect(r.applied).toBe(false);
    expect(r.reason).toBe('timeout');
  });

  it('applies a good answer and reports what was sent', async () => {
    const r = await groupWithLlm(tabs.slice(0, 3), null, [], async () => '{"groups":[{"name":"Retry work","ids":["T1","T2"]}]}', fixedClock(0), 1000);
    expect(r.applied).toBe(true);
    expect(r.sent).toContain('T1:');
    expect(r.groups[0].name).toBe('Retry work');
  });
});
