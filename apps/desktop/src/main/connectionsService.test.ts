import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { ConnectionsService } from './connectionsService';
import { connectionsView } from '../renderer/main/connections';
import { FIXTURES } from '../renderer/shared/fixtures';

async function setup(found = [{ id: 'excel', tool: 'Excel' }, { id: 'word', tool: 'Word' }, { id: 'preview', tool: 'Preview' }, { id: 'notion', tool: 'Notion' }, { id: 'figma', tool: 'Figma' }]) {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-conn-')), 'd.json'), defaultAppData);
  await store.load();
  let changes = 0;
  const svc = new ConnectionsService({ store, installedApps: async () => found, onChange: () => changes++ });
  await svc.refresh();
  return { store, svc, changes: () => changes };
}

describe('Connections · desktop apps', () => {
  it('lists only the approved apps found on this computer (Word, Excel, PowerPoint, Photoshop, in that order), all off', async () => {
    const { svc } = await setup();
    expect(svc.view()).toEqual({ apps: [{ id: 'word', tool: 'Word', on: false }, { id: 'excel', tool: 'Excel', on: false }] });
  });

  it('turns one app on and off, and refuses an app that is not on this computer', async () => {
    const { svc, store } = await setup();
    await svc.setApp('excel', true);
    expect(store.get().settings.apps).toEqual(['excel']);
    await svc.setApp('photoshop', true);
    await svc.setApp('notion', true);
    expect(store.get().settings.apps).toEqual(['excel']);
    await svc.setApp('excel', false);
    expect(store.get().settings.apps).toEqual([]);
  });

  it('survives a failing probe: no apps, nothing on', async () => {
    const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-conn-')), 'd.json'), defaultAppData);
    await store.load();
    const svc = new ConnectionsService({ store, installedApps: async () => { throw new Error('mdfind'); }, onChange: () => undefined });
    await svc.refresh();
    expect(svc.view()).toEqual({ apps: [] });
  });

  it('the screen: one switch per app, says what is on, and what is read and sent', () => {
    const closed = String(connectionsView(FIXTURES.day, false));
    expect(closed).toContain('Turn on the apps sidy may open a file in.');
    expect(closed).not.toContain('data-act="app-toggle"');
    const open = String(connectionsView(FIXTURES['apps-on'], true));
    expect(open).toContain('On: Excel.');
    expect((open.match(/data-act="app-toggle"/g) ?? []).length).toBe(4);
    expect(open).toMatch(/aria-checked="true" data-act="app-toggle" data-app="excel"/);
    expect(open).toContain('Photoshop · <span class="st">Off</span>');
    expect(open).toContain("never what's inside");
    expect(open).toContain('file names (no folders) go to Claude');
  });
});

describe('Connections · calendar', () => {
  const peek = (status: string, firstTomorrow: number | null = null) => ({ status, firstTomorrow, leftToday: 0 }) as any;
  async function make(answer: string) {
    const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-cal-')), 'd.json'), defaultAppData);
    await store.load();
    const calls: string[] = [];
    const calendar = {
      status: async () => (calls.push('status'), peek('not_asked')),
      request: async () => (calls.push('request'), peek(answer)),
      peek: async () => (calls.push('peek'), peek('allowed', 1794182400000)),
    };
    const svc = new ConnectionsService({ store, installedApps: async () => [], calendar, now: () => 1, onChange: () => undefined });
    await svc.refresh();
    return { store, svc, calls };
  }

  it('is off by default and reads no event until turned on', async () => {
    const { svc, calls } = await make('allowed');
    expect(svc.view().calendar).toEqual({ on: false, status: 'not_asked', firstTomorrow: null });
    expect(calls).toEqual(['status']);
  });

  it('turning it on asks macOS once, then reads tomorrow\'s first event time', async () => {
    const { svc, store, calls } = await make('allowed');
    await svc.setCalendar(true);
    expect(store.get().settings.calendar).toBe(true);
    expect(svc.view().calendar).toEqual({ on: true, status: 'allowed', firstTomorrow: 1794182400000 });
    expect(calls).toEqual(['status', 'request', 'peek']);
    await svc.setCalendar(false);
    expect(svc.view().calendar).toEqual({ on: false, status: 'allowed', firstTomorrow: null });
  });

  it('a "no" from macOS leaves it off and says so', async () => {
    const { svc, store } = await make('denied');
    await svc.setCalendar(true);
    expect(store.get().settings.calendar).toBe(false);
    expect(svc.view().calendar).toMatchObject({ on: false, status: 'denied' });
    expect(String(connectionsView(FIXTURES['cal-denied'], false))).toContain('macOS said no. Allow Side in System Settings &gt; Privacy &amp; Security &gt; Calendars.');
  });

  it('the screen says what it reads and that titles stay on this computer', () => {
    expect(String(connectionsView(FIXTURES.day, false))).toContain('Turn it on so sidy knows when tomorrow starts. Titles stay on this computer.');
    expect(String(connectionsView(FIXTURES['cal-on'], false))).toContain("Reads tomorrow's first event time and how many are left today.");
  });
});
