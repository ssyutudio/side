// A step that opens a file in a desktop app (Connections → desktop apps): how it is chosen, checked,
// run, and what sidy says afterwards. The adapters themselves are tested in connectors/apps.
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { SavedFile, SetAside, Step } from '@side/shared';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { StepService } from './stepService';
import { WrapupService } from './wrapupService';
import type { AppsPort } from './connectors/desktopApps';
import { buildStep, checkStep, currentStep } from '../core/step';
import { stepOpenedText } from '../renderer/shared/stepText';
import type { WrapupPreview } from '../core/wrapupPreview';

let now = new Date(2026, 10, 10, 9, 0).getTime();
const clock = { now: () => now };
const ids = () => 'st-new';

const xlsx: SavedFile = {
  workId: 'doc-orders', adapterId: 'excel', path: '/Users/someone/Documents/november-orders.xlsx', key: '/Users/someone/Documents/november-orders.xlsx',
  name: 'november-orders.xlsx', app: 'Microsoft Excel', tool: 'Excel', touchedAt: new Date(2026, 10, 9, 23, 30).getTime(),
};

const sa = (o: Partial<SetAside> = {}): SetAside => ({
  id: 'sa1', endedAt: new Date(2026, 10, 9, 23, 50).getTime(),
  tabs: [{ tabId: 1, url: 'https://github.com/acme/retry-lib/issues/12', title: 'Retry jitter', lastAccessed: new Date(2026, 10, 9, 22, 0).getTime(), position: null, groupKey: 'g1' }],
  groups: [{ key: 'g1', name: 'retry-lib', tabIds: [1], source: 'rule' }],
  kept: [], userLine: 'why does row 88 not add up', todayDone: [], closeRequested: false, status: 'applied', result: null,
  files: [xlsx],
  ...o,
});

const pick = (f: SavedFile) => (f.adapterId === 'excel' ? { candidateId: 'app-last-cell', tool: 'Excel', effect: 'runs' as const, label: `Go to the last filled cell of november-orders in Excel` } : null);

describe('choosing between a tab and a file', () => {
  it('offers the file when it was touched after the newest tab, opening it in its own app', () => {
    const s = buildStep(sa(), [], clock, ids, { enabled: ['excel'], pick })!;
    expect(s.action).toEqual({ type: 'app', workId: 'doc-orders', adapterId: 'excel', candidateId: 'app-last-cell', tool: 'Excel', effect: 'runs', label: 'Go to the last filled cell of november-orders in Excel', name: 'november-orders.xlsx' });
    expect(s.label).toBe('“why does row 88 not add up” — november-orders is ready to open in Excel.');
    // It never claims the spot inside the file.
    expect(s.label).not.toMatch(/where you stopped/);
  });

  it('offers the tab when the tab was touched later', () => {
    const later = sa({ files: [{ ...xlsx, touchedAt: new Date(2026, 10, 9, 20, 0).getTime() }] });
    expect(buildStep(later, [], clock, ids, { enabled: ['excel'], pick })!.action.type).toBe('open_url');
  });

  it('never offers a file from an app that is turned off, or one the adapters can do nothing with', () => {
    expect(buildStep(sa(), [], clock, ids, { enabled: [], pick })!.action.type).toBe('open_url');
    expect(buildStep(sa(), [], clock, ids, { enabled: ['excel'], pick: () => null })!.action.type).toBe('open_url');
    expect(buildStep(sa(), [], clock, ids, undefined)!.action.type).toBe('open_url');
  });

  it('drops a stored file step once its app is turned off, and falls back to the tab', () => {
    const stored = buildStep(sa(), [], clock, ids, { enabled: ['excel'], pick })!;
    expect(currentStep([sa()], [stored], [], clock, ids, { enabled: ['excel'] })!.id).toBe(stored.id);
    expect(checkStep(stored, [], []).ok).toBe(false);
    const after = currentStep([sa()], [stored], [], clock, () => 'st-tab', { enabled: [] })!;
    expect(after.action.type).toBe('open_url');
  });

  it('never accepts a step type it does not know (a command, say)', () => {
    const odd = { ...buildStep(sa(), [], clock, ids, { enabled: ['excel'], pick })!, action: { type: 'shell', command: 'rm -rf ~' } } as unknown as Step;
    expect(checkStep(odd, [], ['excel']).ok).toBe(false);
  });
});

class FakeApps implements AppsPort {
  runs: { file: SavedFile; id: string }[] = [];
  scans: { enabled: readonly string[]; since: number }[] = [];
  constructor(private answer: Awaited<ReturnType<AppsPort['run']>>, private found: SavedFile[] = [xlsx]) {}
  async filesSince(enabled: readonly string[], since: number) {
    this.scans.push({ enabled, since });
    return this.found.filter((f) => enabled.includes(f.adapterId) && f.touchedAt >= since);
  }
  pick = pick;
  async run(file: SavedFile, id: string) {
    this.runs.push({ file, id });
    return this.answer;
  }
}

class Chrome {
  sent: { type: string; payload: unknown }[] = [];
  async command(type: any, payload: any) {
    this.sent.push({ type, payload });
    return { status: 'ok' as const, result: {} };
  }
}

async function store(o: Partial<AppData> = {}) {
  const s = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-appstep-')), 'd.json'), () => ({ ...defaultAppData(), ...o }));
  await s.load();
  return s;
}

describe('Step inside a desktop app', () => {
  const step = buildStep(sa(), [], clock, ids, { enabled: ['excel'], pick })!;

  it('runs only the candidate it was given, never touches Chrome, and records the open', async () => {
    const st = await store({ setAsides: [sa()], steps: [step], settings: { ...defaultAppData().settings, apps: ['excel'] } });
    const apps = new FakeApps({ ok: true, did: 'ran', tool: 'Excel' });
    const chrome = new Chrome();
    const svc = new StepService({ store: st, port: chrome, clock, apps });
    expect(svc.needsChrome(step.id)).toBe(false);
    const out = await svc.open(step.id);
    expect(out).toMatchObject({ kind: 'app_opened', did: 'ran', tool: 'Excel' });
    expect(apps.runs).toEqual([{ file: xlsx, id: 'app-last-cell' }]);
    expect(chrome.sent).toEqual([]);
    const ev = st.get().stepEvents[0];
    expect(ev.clickedAt).toBe(now);
    expect(ev.openedAt).toBe(now);
  });

  it('says it failed, and records no open, when the app could not do it', async () => {
    const st = await store({ setAsides: [sa()], steps: [step], settings: { ...defaultAppData().settings, apps: ['excel'] } });
    const apps = new FakeApps({ ok: false, did: null, tool: 'Excel', error: 'file_moved', message: "Couldn't find that file. It may have been moved or renamed." });
    const out = await new StepService({ store: st, port: new Chrome(), clock, apps }).open(step.id);
    expect(out).toEqual({ kind: 'app_failed', tool: 'Excel', message: "Couldn't find that file. It may have been moved or renamed." });
    expect(st.get().stepEvents[0].openedAt).toBeNull();
  });
});

describe('Wrap up keeps the files saved today', () => {
  const report = { tabs: [], skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 }, capturedAt: now };
  const preview: WrapupPreview = { fold: [], kept: [], alreadySetAside: [], skipped: { excluded: 0, incognito: 0, internal: 0 }, foldCount: 0, expectUrls: {} };

  it('looks at nothing while no app is turned on (the default)', async () => {
    const st = await store();
    const apps = new FakeApps({ ok: true, did: 'opened', tool: 'Excel' });
    const svc = new WrapupService({ store: st, port: new Chrome(), clock, apps });
    await svc.confirm(preview, report, []);
    expect(apps.scans).toEqual([]);
    expect(st.get().setAsides[0].files).toBeUndefined();
  });

  it('saves the files of the turned-on apps from the start of the work day, and sends Chrome nothing about them', async () => {
    now = new Date(2026, 10, 9, 23, 55).getTime();
    const st = await store({ settings: { ...defaultAppData().settings, apps: ['excel'] } });
    const apps = new FakeApps({ ok: true, did: 'opened', tool: 'Excel' }, [xlsx, { ...xlsx, workId: 'doc-old', touchedAt: new Date(2026, 10, 9, 3, 0).getTime() }]);
    const chrome = new Chrome();
    await new WrapupService({ store: st, port: chrome, clock, apps }).confirm(preview, report, []);
    expect(apps.scans[0]).toEqual({ enabled: ['excel'], since: new Date(2026, 10, 9, 4, 0).getTime() });
    expect(st.get().setAsides[0].files).toEqual([xlsx]);
    expect(JSON.stringify(chrome.sent)).not.toContain('november-orders');
  });
});

describe('what sidy says after Step inside a desktop app', () => {
  it('says what the app did, and only that', () => {
    expect(stepOpenedText({ kind: 'app_opened', did: 'ran', tool: 'Excel', name: 'november-orders.xlsx', label: 'Go to the last filled cell of november-orders in Excel' }))
      .toBe('Go to the last filled cell of november-orders in Excel — done.');
    expect(stepOpenedText({ kind: 'app_opened', did: 'opened', tool: 'Photoshop', name: 'cover.psd', message: null })).toBe('Opened cover.psd in Photoshop.');
  });

  it('keeps the reason when the app only opened the file', () => {
    expect(stepOpenedText({ kind: 'app_opened', did: 'opened', tool: 'Excel', name: 'a.xlsx', message: 'Opened it, but no further. To allow the rest, turn on Excel under the app running Side, in System Settings > Privacy & Security > Automation.' }))
      .toBe('Opened a.xlsx in Excel. To allow the rest, turn on Excel under the app running Side, in System Settings > Privacy & Security > Automation.');
    expect(stepOpenedText({ kind: 'app_opened', did: 'opened', tool: 'Excel', name: 'a.xlsx', message: 'Opened it, but no further.' })).toBe('Opened a.xlsx in Excel.');
  });

  it('does not say "opened" when the app was already running and the file was not passed', () => {
    const t = stepOpenedText({ kind: 'app_opened', did: 'opened', tool: 'Logic Pro', name: 'song.logicx', message: "Logic Pro was already running, so I only brought it to the front. I didn't open the file, so nothing unsaved is touched." });
    expect(t).not.toMatch(/^Opened/);
    expect(t).toContain("didn't open the file");
  });

  it('passes the failure sentence through', () => {
    expect(stepOpenedText({ kind: 'app_failed', tool: 'Excel', message: "Couldn't find that file. It may have been moved or renamed." })).toBe("Couldn't find that file. It may have been moved or renamed.");
  });
});
