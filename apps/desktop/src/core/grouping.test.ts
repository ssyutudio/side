import type { TabSnapshot } from '@side/shared';
import { groupTabs, isBreakUrl, cleanTitle, BREAKS_KEY, UNSORTED_KEY } from './grouping';

let nextId = 1;
function tab(url: string, title: string, extra: Partial<TabSnapshot> = {}): TabSnapshot {
  const id = nextId++;
  return {
    tabId: id,
    windowId: 1,
    index: id,
    url,
    title,
    lastAccessed: 1000 + id,
    active: false,
    pinned: false,
    audible: false,
    incognito: false,
    groupId: -1,
    groupTitle: null,
    position: null,
    ...extra,
  };
}

function groupOf(groups: ReturnType<typeof groupTabs>, tabId: number) {
  return groups.find((g) => g.tabIds.includes(tabId));
}

describe('groupTabs (rules)', () => {
  it('puts tabs of the same GitHub repo in one group named after the repo', () => {
    const a = tab('https://github.com/acme/retry-queue/pull/12', 'Add jitter by sam · Pull Request #12 · acme/retry-queue');
    const b = tab('https://github.com/acme/retry-queue/blob/main/src/backoff.ts', 'retry-queue/src/backoff.ts at main · acme/retry-queue');
    const groups = groupTabs([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('retry-queue');
    expect(groups[0].tabIds).toEqual([a.tabId, b.tabId]);
    expect(groups[0].source).toBe('rule');
  });

  it('names a Google Docs group after the document title without the suffix', () => {
    const d = tab('https://docs.google.com/document/d/1AbC/edit', 'Retry design notes - Google Docs');
    const groups = groupTabs([d]);
    expect(groups[0].name).toBe('Retry design notes');
    expect(groups[0].key).toBe('doc:1AbC');
  });

  it('collects video and social tabs into Breaks', () => {
    const y = tab('https://www.youtube.com/watch?v=x', 'Lo-fi beats - YouTube');
    const x = tab('https://x.com/home', 'Home / X');
    const groups = groupTabs([y, x]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(BREAKS_KEY);
    expect(groups[0].name).toBe('Breaks');
  });

  it('attaches a reference tab to the work it shares a word with', () => {
    const repo = tab('https://github.com/acme/retry-queue', 'acme/retry-queue: durable jobs');
    const so = tab('https://stackoverflow.com/questions/1/backoff', 'How to back off retries in Node.js - Stack Overflow');
    const groups = groupTabs([repo, so]);
    expect(groups).toHaveLength(1);
    expect(groupOf(groups, so.tabId)?.name).toBe('retry-queue');
  });

  it('clusters loose tabs that share a meaningful word', () => {
    const a = tab('https://stripe.com/blog/pricing', 'How we run pricing experiments');
    const b = tab('https://www.example-saas.com/blog/pricing-pages', 'Pricing pages that convert');
    const groups = groupTabs([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('Pricing');
  });

  it('treats a Figma file as its own work', () => {
    const f = tab('https://www.figma.com/design/AbC123/Checkout?node-id=1', 'Checkout flow v3 - Figma');
    const groups = groupTabs([f]);
    expect(groups[0].key).toBe('figma:AbC123');
    expect(groups[0].name).toBe('Checkout flow v3');
  });

  it('groups loose tabs from the same site', () => {
    const a = tab('https://linear.app/acme/issue/SID-1', 'SID-1 Onboarding copy');
    const b = tab('https://linear.app/acme/issue/SID-7', 'SID-7 Crash on wake');
    const groups = groupTabs([a, b]);
    expect(groups).toHaveLength(1);
    expect(groups[0].name).toBe('linear.app');
  });

  it('puts tabs it is unsure about into one Not sorted yet group', () => {
    const w = tab('https://weather.example.com/seoul', 'Weather in Seoul');
    const r = tab('https://recipes.example.org/kimchi', 'Kimchi stew');
    const groups = groupTabs([w, r]);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe(UNSORTED_KEY);
    expect(groups[0].name).toBe('Not sorted yet');
  });

  it('keeps names at 40 characters or fewer', () => {
    const d = tab('https://docs.google.com/document/d/LONG/edit', 'A very long document title that keeps going and going forever - Google Docs');
    const [g] = groupTabs([d]);
    expect(g.name.length).toBeLessThanOrEqual(40);
  });

  it('is deterministic for the same input in any order', () => {
    const tabs = [
      tab('https://github.com/acme/retry-queue', 'acme/retry-queue'),
      tab('https://docs.google.com/document/d/Z9/edit', 'Launch plan - Google Docs'),
      tab('https://www.youtube.com/watch?v=1', 'Talk - YouTube'),
      tab('https://weather.example.com', 'Weather'),
    ];
    const a = groupTabs(tabs);
    const b = groupTabs([...tabs].reverse());
    expect(b).toEqual(a);
  });

  it('gives every tab exactly one group', () => {
    const tabs = [
      tab('https://github.com/acme/web', 'acme/web'),
      tab('http://localhost:3000/', 'Dev server'),
      tab('https://www.youtube.com/watch?v=1', 'Talk - YouTube'),
      tab('https://news.example.com/a', 'Something else'),
    ];
    const groups = groupTabs(tabs);
    const all = groups.flatMap((g) => g.tabIds).sort((x, y) => x - y);
    expect(all).toEqual(tabs.map((t) => t.tabId).sort((x, y) => x - y));
  });
});

describe('helpers', () => {
  it('detects break urls', () => {
    expect(isBreakUrl('https://m.youtube.com/watch?v=1')).toBe(true);
    expect(isBreakUrl('https://docs.google.com/document/d/1')).toBe(false);
  });
  it('strips app suffixes from titles', () => {
    expect(cleanTitle('Q3 numbers - Google Sheets')).toBe('Q3 numbers');
    expect(cleanTitle('Roadmap | Notion')).toBe('Roadmap');
  });
});
