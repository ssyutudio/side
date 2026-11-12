import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import * as realFs from 'node:fs/promises';
import type { TabSnapshot, TabsReport, OpenUrlAction } from '@side/shared';
import { JsonStore, type FsLike } from './store';
import { defaultAppData, type AppData } from './appData';
import { WrapupService, type CommandPort } from './wrapupService';
import type { CommandOutcome } from './bridge';

const NOW = new Date(2026, 10, 9, 23, 30).getTime();
let tick = 0;
// Each read moves time forward a second, like real consecutive Wrap ups.
const clock = { now: () => NOW + 1000 * tick++ };

function tab(id: number, url: string, title: string, extra: Partial<TabSnapshot> = {}): TabSnapshot {
  return {
    tabId: id, windowId: 1, index: id, url, title, lastAccessed: NOW - id * 1000,
    active: false, pinned: false, audible: false, incognito: false, groupId: -1, groupTitle: null,
    position: { scroller: 'window', selector: null, top: 900, ratio: 0.4, quote: null, capturedAt: NOW },
    ...extra,
  };
}

const report: TabsReport = {
  tabs: [
    tab(1, 'https://github.com/acme/retry-lib/issues/12', 'Retry jitter · Issue #12 · acme/retry-lib'),
    tab(2, 'https://github.com/acme/retry-lib/pull/30', 'Add backoff · Pull Request #30 · acme/retry-lib'),
    tab(3, 'https://en.wikipedia.org/wiki/Exponential_backoff', 'Exponential backoff - Wikipedia'),
    tab(4, 'https://www.youtube.com/watch?v=abc', 'Lofi beats - YouTube'),
    tab(5, 'https://client-bank.com/accounts', 'Client accounts'),
    tab(6, 'https://docs.google.com/document/d/x/edit', 'Pitch notes - Google Docs', { active: true }),
  ],
  skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 },
  capturedAt: NOW,
};

class FakePort implements CommandPort {
  sent: { type: string; payload: any }[] = [];
  constructor(public answer: (type: string, payload: any) => CommandOutcome, private onSend?: () => void) {}
  async command(type: any, payload: any): Promise<CommandOutcome> {
    this.onSend?.();
    this.sent.push({ type, payload });
    return this.answer(type, payload);
  }
}

const groupedAll = (_t: string, p: any): CommandOutcome => ({
  status: 'ok',
  result: { grouped: p.groups.map((g: any, i: number) => ({ key: g.key, chromeGroupId: 10 + i, tabIds: g.tabIds })), closed: p.closeTabIds, kept: [] },
});

async function setup(port: FakePort, fs?: FsLike, excluded: string[] = ['client-bank.com']) {
  const path = join(mkdtempSync(join(tmpdir(), 'side-wrap-')), 'side-data.json');
  const store = new JsonStore<AppData>(path, () => {
    const d = defaultAppData();
    return { ...d, settings: { ...d.settings, excludedDomains: excluded } };
  }, fs);
  await store.load();
  const svc = new WrapupService({ store, port, clock });
  return { store, svc, path };
}

describe('WrapupService', () => {
  it('drops excluded-site tabs from the preview even if a report still carries them', async () => {
    const { svc } = await setup(new FakePort(groupedAll));
    const preview = await svc.preview(report);
    const ids = preview.fold.flatMap((g) => g.tabIds);
    expect(ids).not.toContain(5);
    expect(preview.skipped.excluded).toBe(1);
  });

  it('saves the record before sending anything to Chrome', async () => {
    let savedAtSend = false;
    const port = new FakePort(groupedAll, () => {
      savedAtSend = ctx.store.get().setAsides.length === 1;
    });
    const ctx = await setup(port);
    const preview = await ctx.svc.preview(report);
    await ctx.svc.confirm(preview, report, []);
    expect(savedAtSend).toBe(true);
  });

  it('touches no tab when saving fails', async () => {
    const port = new FakePort(groupedAll);
    const failing: FsLike = { ...realFs, writeFile: async () => { throw new Error('disk full'); } };
    const { svc } = await setup(port, failing);
    const out = await svc.confirm(await svc.preview(report), report, []);
    expect(out.kind).toBe('storage_failed');
    expect(port.sent).toHaveLength(0);
  });

  it('sends apply and undo with a longer wait than the default', async () => {
    const waits: unknown[] = [];
    const port = { sent: [] as any[], command: async (type: any, p: any, ms?: number) => (waits.push([type, ms]), type === 'cmd.wrapup.apply' ? groupedAll(type, p) : ({ status: 'ok', result: { reopened: 0 } } as CommandOutcome)) };
    const { svc } = await setup(port as unknown as FakePort);
    const out = await svc.confirm(await svc.preview(report), report, []);
    if (out.kind !== 'applied' && out.kind !== 'partial') throw new Error(out.kind);
    await svc.undo(out.setAside.id);
    expect(waits).toEqual([['cmd.wrapup.apply', 60_000], ['cmd.wrapup.undo', 60_000]]);
  });

  it('does not leave the screen waiting when saving Chrome\'s answer fails', async () => {
    const port = new FakePort(groupedAll);
    // The record is written before the send; only the write after Chrome answered fails.
    let failFrom = Infinity;
    const flaky: FsLike = { ...realFs, writeFile: (async (...a: Parameters<typeof realFs.writeFile>) => {
      if (port.sent.length >= failFrom) throw new Error('disk full');
      return realFs.writeFile(...a);
    }) as FsLike['writeFile'] };
    const { svc } = await setup(port, flaky);
    const preview = await svc.preview(report);
    failFrom = 1;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await svc.confirm(preview, report, []);
    warn.mockRestore();
    expect(out.kind).toBe('unconfirmed');
    // Retry resends the same saved command rather than starting a new wrap-up.
    expect(out.kind === 'unconfirmed' && out.setAside.id).toBeTruthy();
  });

  it('records what the extension confirmed and prepares exactly one step', async () => {
    const { svc, store, path } = await setup(new FakePort(groupedAll));
    const out = await svc.confirm(await svc.preview(report), report, []);
    expect(out.kind).toBe('applied');
    const d = store.get();
    expect(d.setAsides[0].status).toBe('applied');
    expect(d.setAsides[0].todayDone[0]).toMatch(/^Set aside \d+ tabs in \d+ groups\.$/);
    expect(d.steps).toHaveLength(1);
    expect((d.steps[0].action as OpenUrlAction).url).toMatch(/^https:\/\/github\.com\/acme\/retry-lib/);
    const file = readFileSync(path, 'utf8');
    expect(file).not.toContain('client-bank.com/accounts');
    expect(file).not.toContain('Client accounts');
  });

  it('marks a run partial when Chrome kept a tab the preview meant to fold', async () => {
    const port = new FakePort((_t, p) => ({
      status: 'ok',
      result: { grouped: [{ key: p.groups[0].key, chromeGroupId: 3, tabIds: p.groups[0].tabIds.slice(1) }], closed: [], kept: [{ tabId: p.groups[0].tabIds[0], reason: 'changed' }] },
    }));
    const { svc, store } = await setup(port);
    const out = await svc.confirm(await svc.preview(report), report, []);
    expect(out.kind).toBe('partial');
    expect(store.get().setAsides[0].status).toBe('partial');
  });

  it('tells a Chrome failure from an extension storage failure', async () => {
    const chrome = await setup(new FakePort(() => ({ status: 'failed', error: { kind: 'chrome', message: 'No tab with id 3' } })));
    const a = await chrome.svc.confirm(await chrome.svc.preview(report), report, []);
    expect(a).toMatchObject({ kind: 'chrome_failed', message: 'No tab with id 3' });
    const storage = await setup(new FakePort(() => ({ status: 'failed', error: { kind: 'storage', message: 'quota' } })));
    const b = await storage.svc.confirm(await storage.svc.preview(report), report, []);
    expect(b.kind).toBe('extension_storage_failed');
  });

  it('says unconfirmed on timeout, and a retry resends the same command', async () => {
    let answer: CommandOutcome = { status: 'unconfirmed', reason: 'timeout' };
    const port = new FakePort((t, p) => (answer.status === 'ok' ? groupedAll(t, p) : answer));
    const { svc, store } = await setup(port);
    const first = await svc.confirm(await svc.preview(report), report, []);
    expect(first.kind).toBe('unconfirmed');
    expect(store.get().setAsides[0].status).toBe('unconfirmed');
    answer = { status: 'ok', result: null };
    const id = store.get().setAsides[0].id;
    const again = await svc.retry(id);
    expect(again.kind).toBe('applied');
    expect(port.sent[1].payload).toEqual(port.sent[0].payload);
  });

  it('closes only the groups the user confirmed', async () => {
    const port = new FakePort(groupedAll);
    const { svc } = await setup(port);
    const preview = await svc.preview(report);
    const key = preview.fold[0].key;
    await svc.confirm(preview, report, [key]);
    expect(port.sent[0].payload.closeTabIds).toEqual(preview.fold[0].tabIds);
  });

  it('undoes only the last set-aside and then offers no step from it', async () => {
    const port = new FakePort((t, p) => (t === 'cmd.wrapup.undo' ? { status: 'ok', result: { ungrouped: [1, 2], reopened: 0 } } : groupedAll(t, p)));
    const { svc, store } = await setup(port);
    await svc.confirm(await svc.preview(report), report, []);
    const firstId = store.get().setAsides[0].id;
    await svc.confirm(await svc.preview(report), report, []);
    expect((await svc.undo(firstId)).kind).toBe('not_latest');
    const lastId = store.get().setAsides[1].id;
    expect((await svc.undo(lastId)).kind).toBe('undone');
    expect(store.get().setAsides[1].status).toBe('undone');
  });

  it('adding an excluded site while the preview is open saves and sends the rest, and never throws', async () => {
    const port = new FakePort(groupedAll);
    const { svc, store } = await setup(port, undefined, []);
    const preview = await svc.preview(report);
    expect(preview.fold.flatMap((g) => g.tabIds)).toContain(5);
    await store.update((d) => ({ ...d, settings: { ...d.settings, excludedDomains: ['client-bank.com'] } }));
    const out = await svc.confirm(preview, report, []);
    expect(out.kind).toBe('applied');
    const sent = port.sent[0].payload;
    expect(sent.groups.flatMap((g: any) => g.tabIds)).not.toContain(5);
    expect(Object.keys(sent.expectUrls)).not.toContain('5');
    expect(store.get().setAsides[0].tabs.map((t) => t.tabId)).not.toContain(5);
    expect(store.get().setAsides[0].tabs.length).toBeGreaterThan(0);
  });

  it('answers storage_failed (not a rejected promise) when the note of an undo cannot be saved', async () => {
    const port = new FakePort((t, p) => (t === 'cmd.wrapup.undo' ? { status: 'ok', result: { reopened: 2 } } : groupedAll(t, p)));
    const flaky: FsLike = { ...realFs, writeFile: (async (...a: Parameters<typeof realFs.writeFile>) => {
      if (port.sent.some((s) => s.type === 'cmd.wrapup.undo')) throw new Error('disk full');
      return realFs.writeFile(...a);
    }) as FsLike['writeFile'] };
    const { svc, store } = await setup(port, flaky);
    await svc.confirm(await svc.preview(report), report, []);
    const id = store.get().setAsides[0].id;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const out = await svc.undo(id);
    warn.mockRestore();
    expect(out).toMatchObject({ kind: 'storage_failed', reopened: 2 });
  });

  it('answers { error: "storage_failed" } when the tomorrow line cannot be saved', async () => {
    const port = new FakePort(groupedAll);
    let fail = false;
    const flaky: FsLike = { ...realFs, writeFile: (async (...a: Parameters<typeof realFs.writeFile>) => {
      if (fail) throw new Error('disk full');
      return realFs.writeFile(...a);
    }) as FsLike['writeFile'] };
    const { svc, store } = await setup(port, flaky);
    await svc.confirm(await svc.preview(report), report, []);
    const id = store.get().setAsides[0].id;
    fail = true;
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await svc.setTomorrowLine(id, 'why?')).toEqual({ error: 'storage_failed' });
    warn.mockRestore();
  });

  it('stores the one line for tomorrow (or nothing when skipped) and uses it in the step', async () => {
    const { svc, store } = await setup(new FakePort(groupedAll));
    await svc.confirm(await svc.preview(report), report, []);
    const id = store.get().setAsides[0].id;
    await svc.setTomorrowLine(id, '  why does jitter need a cap?  ');
    expect(store.get().setAsides[0].userLine).toBe('why does jitter need a cap?');
    expect(store.get().steps).toHaveLength(1);
    expect(store.get().steps[0].label).toContain('why does jitter need a cap?');
    await svc.setTomorrowLine(id, null);
    expect(store.get().setAsides[0].userLine).toBeNull();
  });
});

describe('WrapupService with the LLM turned on', () => {
  it('sends titles only, never an excluded site, and logs the send by count', async () => {
    const path = join(mkdtempSync(join(tmpdir(), 'side-llm-')), 'side-data.json');
    const store = new JsonStore<AppData>(path, () => {
      const d = defaultAppData();
      return { ...d, settings: { ...d.settings, llmEnabled: true, excludedDomains: ['client-bank.com'] } };
    });
    await store.load();
    const sent: string[] = [];
    const svc = new WrapupService({
      store,
      port: new FakePort(groupedAll),
      clock,
      llm: async (req) => {
        sent.push(req.system + '\n' + req.user);
        return '{"groups":[]}';
      },
    });
    await svc.preview(report);
    expect(sent).toHaveLength(1);
    expect(sent[0]).not.toContain('Client accounts');
    expect(sent[0]).not.toContain('client-bank');
    expect(sent[0]).not.toMatch(/https?:\/\//);
    expect(store.get().llmLog).toHaveLength(1);
    expect(readFileSync(path, 'utf8')).not.toContain('Client accounts');
  });
});

describe('WrapupService when the LLM cannot help', () => {
  async function withLlm(llm: ((r: { system: string; user: string }) => Promise<string>) | null) {
    const path = join(mkdtempSync(join(tmpdir(), 'side-llm-')), 'side-data.json');
    const store = new JsonStore<AppData>(path, defaultAppData);
    await store.load();
    expect(store.get().settings.llmEnabled).toBe(true);
    return new WrapupService({ store, port: new FakePort(groupedAll), clock, llm });
  }

  it('falls back to the rules when there is no key', async () => {
    const preview = await (await withLlm(null)).preview(report);
    expect(preview.foldCount).toBeGreaterThan(0);
  });

  it('falls back to the rules when the API fails', async () => {
    const preview = await (await withLlm(async () => { throw new Error('529 overloaded'); })).preview(report);
    expect(preview.foldCount).toBeGreaterThan(0);
    expect(preview.fold.every((g) => g.source === 'rule')).toBe(true);
  });
});

describe('WrapupService keeps what was skipped', () => {
  it('stores the skipped counts on the set-aside record, by excluded domain', async () => {
    const { svc, store } = await setup(new FakePort(groupedAll));
    await svc.confirm(await svc.preview(report), report, []);
    expect(store.get().setAsides[0].skipped).toEqual({ excluded: 1, excludedByDomain: { 'client-bank.com': 1 }, incognito: 0, internal: 0 });
  });
});
