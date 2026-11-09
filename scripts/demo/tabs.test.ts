import { loadDemoTabs, demoUrls, openArgs, DEMO_HOSTS } from './tabs.mjs';

const tabs = loadDemoTabs();

describe('demo tabs', () => {
  it('has at least 24 unique https tabs', () => {
    expect(tabs.length).toBeGreaterThanOrEqual(24);
    expect(new Set(tabs.map((t) => t.url)).size).toBe(tabs.length);
    for (const t of tabs) expect(t.url.startsWith('https://')).toBe(true);
  });

  it('covers four named works plus 2-3 distraction tabs', () => {
    const works = new Set(tabs.filter((t) => t.work !== 'distraction').map((t) => t.work));
    expect(works.size).toBe(4);
    const distractions = tabs.filter((t) => t.work === 'distraction');
    expect(distractions.length).toBeGreaterThanOrEqual(2);
    expect(distractions.length).toBeLessThanOrEqual(3);
  });

  it('stays mostly on the demo hosts', () => {
    const onList = tabs.filter((t) => DEMO_HOSTS.includes(new URL(t.url).hostname.replace(/^www\./, '')));
    expect(onList.length / tabs.length).toBeGreaterThanOrEqual(0.9);
  });

  it('puts an optional Google Docs URL into the retry work', () => {
    const doc = 'https://docs.google.com/document/d/abc123/edit';
    const urls = demoUrls(tabs, doc);
    expect(urls).toContain(doc);
    expect(urls.length).toBe(tabs.length + 1);
  });

  it('refuses a Docs argument that is not a Google Docs document', () => {
    expect(() => demoUrls(tabs, 'https://evil.example.com/document/d/x')).toThrow(/Google Docs/);
    expect(() => demoUrls(tabs, 'http://docs.google.com/document/d/x')).toThrow(/Google Docs/);
  });

  it('builds one open command for Google Chrome', () => {
    expect(openArgs(['https://a.com/', 'https://b.com/'])).toEqual(['-a', 'Google Chrome', 'https://a.com/', 'https://b.com/']);
  });
});
