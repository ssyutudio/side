// What Settings → Connections shows for desktop apps: the apps found on this computer that Side can
// open a file in, and which ones are turned on (all off by default). The probe runs when asked
// (startup, Check again), never in the background.
import type { JsonStore } from './store';
import type { AppData } from './appData';

/** Apps that only play back an export (no files of their own to open) are not listed. */
const NOT_LISTED = new Set(['quicktime', 'preview']);

export interface ConnectionsView {
  apps: { id: string; tool: string; on: boolean }[];
}

export interface ConnectionsDeps {
  store: JsonStore<AppData>;
  installedApps: () => Promise<{ id: string; tool: string }[]>;
  onChange: () => void;
}

export class ConnectionsService {
  private installed: { id: string; tool: string }[] = [];

  constructor(private readonly deps: ConnectionsDeps) {}

  /** Looks again (startup, Check again). */
  async refresh(): Promise<void> {
    const apps = await this.deps.installedApps().catch(() => []);
    this.installed = apps.filter((a) => !NOT_LISTED.has(a.id));
    this.deps.onChange();
  }

  view(): ConnectionsView {
    const on = new Set(this.deps.store.get().settings.apps ?? []);
    return { apps: this.installed.map((a) => ({ id: a.id, tool: a.tool, on: on.has(a.id) })) };
  }

  /** Turning an app on or off. Only apps found on this computer can be turned on. */
  async setApp(id: string, on: boolean): Promise<void> {
    if (on && !this.installed.some((a) => a.id === id)) return;
    await this.deps.store.update((d) => {
      const next = new Set(d.settings.apps ?? []);
      if (on) next.add(id);
      else next.delete(id);
      return { ...d, settings: { ...d.settings, apps: [...next] } };
    });
    this.deps.onChange();
  }
}
