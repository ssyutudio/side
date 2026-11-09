import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { ConnectionsService } from './connectionsService';
import { connectionsView } from '../renderer/main/connections';
import { FIXTURES } from '../renderer/shared/fixtures';

async function setup(found = [{ id: 'excel', tool: 'Excel' }, { id: 'word', tool: 'Word' }, { id: 'preview', tool: 'Preview' }]) {
  const store = new JsonStore<AppData>(join(mkdtempSync(join(tmpdir(), 'side-conn-')), 'd.json'), defaultAppData);
  await store.load();
  let changes = 0;
  const svc = new ConnectionsService({ store, installedApps: async () => found, onChange: () => changes++ });
  await svc.refresh();
  return { store, svc, changes: () => changes };
}

describe('Connections · desktop apps', () => {
  it('lists the apps found on this computer, all off by default, without playback-only apps', async () => {
    const { svc } = await setup();
    expect(svc.view()).toEqual({ apps: [{ id: 'excel', tool: 'Excel', on: false }, { id: 'word', tool: 'Word', on: false }] });
  });

  it('turns one app on and off, and refuses an app that is not on this computer', async () => {
    const { svc, store } = await setup();
    await svc.setApp('excel', true);
    expect(store.get().settings.apps).toEqual(['excel']);
    await svc.setApp('photoshop', true);
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
