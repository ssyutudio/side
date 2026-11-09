// Glue between the extension bridge, the services and the screens. Electron-free so it can be tested.
import { hostOf, type MessageType, type PayloadOf, type SetAside, type Settings, type TabsReport } from '@side/shared';
import type { JsonStore } from './store';
import { sanitizeSettings, type AppData } from './appData';
import type { BridgeStatus, CommandOutcome } from './bridge';
import type { DemoClock } from '../core/clock';
import type { LlmTransport } from '../core/llmGrouping';
import type { KeepReason } from '@side/shared';
import { WrapupService, type WrapupOutcome } from './wrapupService';
import { StepService } from './stepService';
import { SpeakService, type Bubble } from './speakService';
import { HelpService } from './helpService';
import { AskService } from './askService';
import { ConnectionsService } from './connectionsService';
import type { CalendarPort } from './connectors/calendar';
import { buildViewState, type ViewState } from './viewState';
import { demoOffset, type DemoCommand } from './demoClock';
import { todayDone } from '../core/todayDone';
import type { WrapupPreview } from '../core/wrapupPreview';
import { mergeGroups, moveTab } from '../core/previewEdit';
import type { AppsPort } from './connectors/desktopApps';
import type { AgentRun } from './connectors/claudeCode';

export interface BridgePort {
  readonly status: BridgeStatus;
  send<T extends MessageType>(type: T, payload: PayloadOf<T>): boolean;
  command<T extends MessageType>(type: T, payload: PayloadOf<T>): Promise<CommandOutcome>;
}

export interface EdgePort {
  resize(size: Settings['sidySize']): void;
  show(): void;
  hide(): void;
}

export interface ControllerDeps {
  store: JsonStore<AppData>;
  bridge: BridgePort;
  clock: DemoClock;
  llm: LlmTransport | null;
  /** Desktop apps (Connections). Absent in tests that don't need it. */
  apps?: AppsPort | null;
  /** Desktop apps found on this computer, for Settings → Connections. */
  installedApps?: () => Promise<{ id: string; tool: string }[]>;
  /** This computer's calendar (Connections), read-only. */
  calendar?: CalendarPort;
  edge: EdgePort | null;
  registerShortcut: (accelerator: string) => boolean;
  push: (state: ViewState) => void;
  renderBubble: (bubble: Bubble | null) => void;
  openMain: () => void;
  /** Real time, for computing demo offsets. */
  realNow?: () => number;
  /** False while the setup window is open: its "Meet sidy" button greets instead. */
  greetOnConnect?: () => boolean;
}

export interface PreviewView {
  groups: { key: string; name: string; tabs: { id: number; title: string; host: string | null }[] }[];
  kept: { title: string; reason: KeepReason }[];
  alreadySetAside: number;
  skipped: WrapupPreview['skipped'];
  foldCount: number;
  /** Files saved today in the desktop apps turned on: name and app only. Never closed or touched. */
  files?: { name: string; tool: string }[];
}

export class SideController {
  readonly wrapup: WrapupService;
  readonly step: StepService;
  readonly speak: SpeakService;
  readonly help: HelpService;
  readonly ask: AskService;
  readonly conn: ConnectionsService;
  lastReport: TabsReport | null = null;
  private waiters: ((r: TabsReport | null) => void)[] = [];
  private draft: { preview: WrapupPreview; report: TabsReport; files?: NonNullable<SetAside['files']> } | null = null;

  constructor(private readonly deps: ControllerDeps) {
    const { store, bridge, clock, llm } = deps;
    this.wrapup = new WrapupService({ store, port: bridge, clock, llm, apps: deps.apps ?? null });
    this.step = new StepService({ store, port: bridge, clock, apps: deps.apps ?? null });
    this.help = new HelpService({ store, clock, llm, apps: deps.apps ?? null });
    this.ask = new AskService({ store, clock, llm });
    this.conn = new ConnectionsService({ store, installedApps: deps.installedApps ?? (async () => []), calendar: deps.calendar, now: () => clock.now(), onChange: () => this.publish() });
    this.speak = new SpeakService({
      store,
      clock,
      render: (b) => {
        deps.renderBubble(b);
        this.publish();
      },
    });
  }

  private get data() {
    return this.deps.store.get();
  }

  state(): ViewState {
    const view = buildViewState({
      data: this.data,
      report: this.deps.bridge.status === 'connected' ? this.lastReport : null,
      bridge: this.deps.bridge.status,
      bubble: this.speak.bubble,
      now: this.deps.clock.now(),
    });
    // Claude's By your side sentence is cached per set of counts; a new one republishes once.
    return { ...view, bySide: this.help.bySideFor(view.numbers, () => this.publish()), connections: this.conn.view() };
  }

  publish() {
    this.deps.push(this.state());
  }

  // ---- bridge events ----

  async onReport(report: TabsReport) {
    this.lastReport = report;
    const waiting = this.waiters;
    this.waiters = [];
    waiting.forEach((w) => w(report));
    await this.step.observe(report).catch(() => undefined);
    this.publish();
  }

  async onBridgeStatus(s: BridgeStatus) {
    if (s !== 'connected') {
      const waiting = this.waiters;
      this.waiters = [];
      waiting.forEach((w) => w(null));
    }
    this.publish();
    const allowed = this.deps.greetOnConnect?.() ?? true;
    if (s === 'connected' && allowed && !this.data.firstRunDone && !this.firstRunBusy) await this.greetFirstRun();
  }

  private firstRunBusy = false;

  /** The first words come from the user's real tabs: a fold draft, made by the LLM when it is on and reachable, else by rules. */
  async greetFirstRun() {
    this.firstRunBusy = true;
    try {
      const preview = await this.previewWrapup();
      if ('error' in preview) return;
      await this.speak.firstRun({ tabs: preview.foldCount, groups: preview.groups.length });
    } finally {
      this.firstRunBusy = false;
    }
  }

  /** Asks the extension for a fresh report (it captures the active tabs' positions first). */
  freshReport(timeoutMs = 2500): Promise<TabsReport | null> {
    if (!this.deps.bridge.send('tabs.request', {})) return Promise.resolve(this.lastReport);
    return new Promise((resolve) => {
      const t = setTimeout(() => {
        this.waiters = this.waiters.filter((w) => w !== done);
        resolve(this.lastReport);
      }, timeoutMs);
      const done = (r: TabsReport | null) => {
        clearTimeout(t);
        resolve(r ?? this.lastReport);
      };
      this.waiters.push(done);
    });
  }

  // ---- Wrap up ----

  async previewWrapup(): Promise<PreviewView | { error: 'not_connected' }> {
    const report = await this.freshReport();
    if (!report || this.deps.bridge.status !== 'connected') return { error: 'not_connected' };
    const [preview, files] = await Promise.all([this.wrapup.preview(report), this.wrapup.filesToday()]);
    this.draft = { preview, report, files };
    return this.viewOf(preview, report, files);
  }

  private viewOf(preview: WrapupPreview, report: TabsReport, files: NonNullable<SetAside['files']> = []): PreviewView {
    const byId = new Map(report.tabs.map((t) => [t.tabId, t]));
    return {
      ...(files.length ? { files: files.map((f) => ({ name: f.name, tool: f.tool })) } : {}),
      groups: preview.fold.map((g) => ({
        key: g.key,
        name: g.name,
        tabs: g.tabIds.map((id) => ({ id, title: byId.get(id)?.title ?? '', host: hostOf(byId.get(id)?.url ?? '') })),
      })),
      kept: preview.kept.map((k) => ({ title: k.title, reason: k.reason })),
      alreadySetAside: preview.alreadySetAside.length,
      skipped: preview.skipped,
      foldCount: preview.foldCount,
    };
  }

  /** The user dragged a tab to another group, or a group onto another, before confirming. */
  async editWrapup(op: { op: 'move'; tabId: number; to: string } | { op: 'merge'; from: string; into: string }): Promise<PreviewView | { error: 'no_preview' }> {
    if (!this.draft) return { error: 'no_preview' };
    const { preview, report, files } = this.draft;
    const next = op.op === 'move' ? moveTab(preview, op.tabId, op.to) : mergeGroups(preview, op.from, op.into);
    this.draft = { preview: next, report, files };
    return this.viewOf(next, report, files);
  }

  async confirmWrapup(closeGroupKeys: string[]): Promise<WrapupOutcome | { kind: 'no_preview' }> {
    if (!this.draft) return { kind: 'no_preview' };
    const { preview, report, files } = this.draft;
    const keys = closeGroupKeys.filter((k) => preview.fold.some((g) => g.key === k));
    // The files the person saw in the preview are the ones remembered.
    const out = await this.wrapup.confirm(preview, report, keys, files);
    if (out.kind !== 'storage_failed') this.draft = null;
    this.publish();
    return out;
  }

  // ---- Tomorrow's line (Claude's two suggestions, then the morning recall) ----

  /** Two questions for tomorrow from the group names; none when the LLM is off or slow. */
  suggestTomorrow(setAsideId: string): Promise<string[]> {
    return this.help.suggest(setAsideId);
  }

  /** Saves the line (or skip). With a line and the LLM on, the next step may move to the tab that matches it. */
  async saveTomorrowLine(setAsideId: string, line: string | null): Promise<void> {
    await this.wrapup.setTomorrowLine(setAsideId, line);
    this.publish();
    if (line && line.trim()) {
      void this.help.recall(setAsideId).then((r) => {
        if (r === 'replaced') this.publish();
      });
    }
  }

  // ---- Claude Code (K4) ----

  /** Finished Claude Code sessions from the inbox: recorded only. Nothing is run. */
  async onAgentRuns(runs: AgentRun[]) {
    if (!runs.length) return;
    await this.deps.store
      .update((d) => ({ ...d, agentRuns: [...(d.agentRuns ?? []), ...runs].slice(-20) }))
      .catch(() => undefined);
    this.publish();
  }

  // ---- Step inside ----

  /** Right after a relaunch or wake the extension may still be reconnecting: wait a little first. */
  async openStep(stepId: string, waitMs = 10_000) {
    // A file in a desktop app doesn't need Chrome at all.
    if (!this.step.needsChrome(stepId)) return this.step.open(stepId);
    const end = Date.now() + waitMs;
    while (this.deps.bridge.status !== 'connected' && Date.now() < end) await new Promise((r) => setTimeout(r, 200));
    if (this.deps.bridge.status !== 'connected') return { kind: 'unconfirmed' as const, reason: 'not_connected' };
    return this.step.open(stepId);
  }

  // ---- One more hour ----

  async oneMoreHour() {
    // The calendar's first event tomorrow, if it is on, for the one fact line.
    await this.conn.peekCalendar().catch(() => null);
    this.publish();
    const lines = todayDone({ setAsides: this.data.setAsides, steps: this.data.steps, stepEvents: this.data.stepEvents }, this.deps.clock);
    return this.speak.oneMoreHour(lines);
  }

  // ---- bubble ----

  async bubbleDrawn() {
    const b = this.speak.bubble;
    if (!b) return;
    await this.speak.confirmDrawn();
    if (b.kind === 'step') await this.step.shown(b.stepId, { hidden: this.data.hidden, asleep: this.speak.asleep });
    this.publish();
  }

  // ---- settings, hide, demo ----

  async updateSettings(patch: Partial<Settings>): Promise<Settings> {
    const before = this.data.settings;
    let next = sanitizeSettings({ ...before, ...patch });
    if (next.shortcut !== before.shortcut && !this.deps.registerShortcut(next.shortcut)) {
      this.deps.registerShortcut(before.shortcut);
      next = { ...next, shortcut: before.shortcut };
    }
    await this.deps.store.update((d) => ({ ...d, settings: next }));
    if (next.sidySize !== before.sidySize) this.deps.edge?.resize(next.sidySize);
    if (next.excludedDomains.join('\n') !== before.excludedDomains.join('\n')) {
      this.deps.bridge.send('exclusions.set', { domains: next.excludedDomains });
      this.deps.bridge.send('tabs.request', {});
    }
    this.publish();
    return next;
  }

  async setHidden(hidden: boolean) {
    if (hidden) this.deps.edge?.hide();
    else this.deps.edge?.show();
    await this.speak.setHidden(hidden);
    this.publish();
  }

  async demo(cmd: DemoCommand) {
    const realNow = this.deps.realNow?.() ?? Date.now();
    const offset = demoOffset(cmd, realNow, this.data.demoOffsetMs);
    this.deps.clock.setOffset(offset);
    await this.deps.store.update((d) => ({ ...d, demoOffsetMs: offset }));
    this.publish();
  }

  openMain() {
    this.deps.openMain();
  }
}
