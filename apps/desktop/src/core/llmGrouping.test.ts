import type { TabSnapshot } from '@side/shared';
import { buildGroupingRequest, parseGroupingAnswer, groupWithLlm } from './llmGrouping';
import { fixedClock } from './clock';
import { BREAKS_KEY } from './grouping';

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

describe('addresses never reach the model', () => {
  it('strips one-dot domains and www tokens from titles and the user line', () => {
    const t = [tab(1, 'https://stripe.com/x', 'Pricing | stripe.com'), tab(2, 'https://notion.so/x', 'Plan on notion.so/team and www.example.org'), tab(3, 'https://nodejs.org', 'Node.js streams')];
    const req = buildGroupingRequest(t, 'see bit.ly/abc and \uB124\uC774\uBC84.co.kr', [], fixedClock(0));
    for (const bad of ['stripe.com', 'notion.so', 'example.org', 'bit.ly', 'co.kr', 'www.']) expect(req.user).not.toContain(bad);
    expect(req.user).toContain('T1: Pricing');
  });
  it('keeps ordinary words that contain a dot', () => {
    const req = buildGroupingRequest([tab(1, 'https://a.dev', 'Node.js streams and install.sh')], null, [], fixedClock(0));
    expect(req.user).toContain('Node.js streams and install.sh');
  });
  it('strips an address out of a name the model returns', () => {
    const req = buildGroupingRequest(tabs, null, [], fixedClock(0));
    const out = parseGroupingAnswer('{"groups":[{"name":"Notes on stripe.com","ids":["T1"]}]}', req, req.token, tabs, fixedClock(0));
    expect(out.groups[0].name).toBe('Notes on');
  });
});

describe('group keys', () => {
  it('keeps different Korean names apart and merges identical ones', () => {
    const req = buildGroupingRequest(tabs, null, [], fixedClock(0));
    const answer = '{"groups":[{"name":"\uACB0\uC81C \uC791\uC5C5","ids":["T1"]},{"name":"\uB514\uC790\uC778 \uB9AC\uBDF0","ids":["T2"]},{"name":"\uACB0\uC81C \uC791\uC5C5","ids":["T3"]}]}';
    const out = parseGroupingAnswer(answer, req, req.token, tabs, fixedClock(0));
    const llm = out.groups.filter((g) => g.source === 'llm');
    expect(llm.map((g) => g.name)).toEqual(['\uACB0\uC81C \uC791\uC5C5', '\uB514\uC790\uC778 \uB9AC\uBDF0']);
    expect(llm[0].tabIds).toHaveLength(2);
    expect(new Set(llm.map((g) => g.key)).size).toBe(2);
    expect(llm.every((g) => g.key.length <= 100)).toBe(true);
  });
  it('keeps C++ and C# and different emoji names apart, and caps the key length', () => {
    const req = buildGroupingRequest(tabs, null, [], fixedClock(0));
    const answer = JSON.stringify({ groups: [{ name: 'C++', ids: ['T1'] }, { name: 'C#', ids: ['T2'] }, { name: '🎵', ids: ['T3'] }, { name: '🎬', ids: ['T4'] }] });
    const out = parseGroupingAnswer(answer, req, req.token, tabs, fixedClock(0));
    expect(new Set(out.groups.map((g) => g.key)).size).toBe(4);
    const long = JSON.stringify({ groups: [{ name: '\uAC00'.repeat(40), ids: ['T1'] }] });
    expect(parseGroupingAnswer(long, req, req.token, tabs, fixedClock(0)).groups[0].key.length).toBeLessThanOrEqual(100);
  });
});

describe('a model group named Breaks', () => {
  it('is the Breaks group, and merges with the rules leftover Breaks group', () => {
    const req = buildGroupingRequest(tabs, null, [], fixedClock(0));
    const out = parseGroupingAnswer('{"groups":[{"name":"breaks","ids":["T1"]},{"name":"Retry","ids":["T2"]}]}', req, req.token, tabs, fixedClock(0));
    const breaks = out.groups.filter((g) => g.key === BREAKS_KEY);
    expect(breaks).toHaveLength(1);
    expect(breaks[0].name).toBe('Breaks');
    expect(breaks[0].tabIds.sort()).toEqual([1, 3]); // the model's T1 plus the YouTube tab the rules found
  });
});
