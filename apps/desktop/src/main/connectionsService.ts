// What Settings → Connections shows: the desktop apps found on this computer that this build opens
// files in (Word, Excel, PowerPoint, Photoshop — the approved list; all off by default), and the
// calendar (off by default; macOS asks the first time it is turned on). Probes run when asked
// (startup, Check again, turning something on, One more hour), never in the background.
import type { JsonStore } from './store';
import type { AppData } from './appData';
import type { CalendarPort, CalendarStatus } from './connectors/calendar';

/** The apps listed, in this order (approved mockup m1-conn-apps). Others found are not listed. */
export const LISTED_APPS = ['word', 'excel', 'powerpoint', 'photoshop'] as const;

export interface ConnectionsView {
  apps: { id: string; tool: string; on: boolean }[];
  /** no_answer: turned on, but macOS never showed its question (or the helper couldn't run). */
  calendar?: { on: boolean; status: CalendarStatus | 'checking' | 'no_answer'; firstTomorrow: number | null };
}

export interface ConnectionsDeps {
  store: JsonStore<AppData>;
  installedApps: () => Promise<{ id: string; tool: string }[]>;
  calendar?: CalendarPort;
  now?: () => number;
  onChange: () => void;
}

export class ConnectionsService {
  private installed: { id: string; tool: string }[] = [];
  private calStatus: CalendarStatus = 'not_asked';
  private checking = false;
  /** The last time it was turned on, macOS never answered. Cleared by the next answer. */
  private noAnswer = false;
  private firstTomorrow: number | null = null;

  constructor(private readonly deps: ConnectionsDeps) {}

  private get on() {
    return this.deps.store.get().settings.calendar === true;
  }

  /** Looks again (startup, Check again). */
  async refresh(): Promise<void> {
    const apps = await this.deps.installedApps().catch(() => []);
    this.installed = LISTED_APPS.flatMap((id) => apps.filter((a) => a.id === id));
    if (this.deps.calendar) this.calStatus = (await this.deps.calendar.status()).status;
    await this.peekCalendar();
    this.deps.onChange();
  }

  view(): ConnectionsView {
    const on = new Set(this.deps.store.get().settings.apps ?? []);
    return {
      apps: this.installed.map((a) => ({ id: a.id, tool: a.tool, on: on.has(a.id) })),
      ...(this.deps.calendar
        ? {
            calendar: {
              on: this.on && this.calStatus === 'allowed',
              status: this.checking ? 'checking' : this.noAnswer ? 'no_answer' : this.calStatus,
              firstTomorrow: this.on ? this.firstTomorrow : null,
            },
          }
        : {}),
    };
  }

  /** Turning an app on or off. Only listed apps found on this computer can be turned on. */
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

  /** Reads tomorrow's first event time, only while the calendar is on and allowed. */
  async peekCalendar(): Promise<number | null> {
    if (!this.deps.calendar || !this.on || this.calStatus !== 'allowed') return (this.firstTomorrow = null);
    const p = await this.deps.calendar.peek((this.deps.now ?? Date.now)());
    this.calStatus = p.status === 'unavailable' ? this.calStatus : p.status;
    return (this.firstTomorrow = p.status === 'allowed' ? p.firstTomorrow : null);
  }

  /** Turning the calendar on asks macOS the first time; a "no" leaves it off and is said as it is. */
  async setCalendar(on: boolean): Promise<void> {
    if (!this.deps.calendar) return;
    if (!on) {
      this.noAnswer = false;
      await this.deps.store.update((d) => ({ ...d, settings: { ...d.settings, calendar: false } }));
      this.firstTomorrow = null;
      return this.deps.onChange();
    }
    this.checking = true;
    this.deps.onChange();
    try {
      this.calStatus = (await this.deps.calendar.request((this.deps.now ?? Date.now)())).status;
    } finally {
      this.checking = false;
    }
    // Still "not asked" afterwards: no question ever appeared. Said as it is, not as a plain Off.
    this.noAnswer = this.calStatus === 'not_asked' || this.calStatus === 'unavailable';
    await this.deps.store.update((d) => ({ ...d, settings: { ...d.settings, calendar: this.calStatus === 'allowed' } }));
    await this.peekCalendar();
    this.deps.onChange();
  }
}
