// Glue between the extension bridge, the services and the screens. Electron-free so it can be tested.
import { hostOf, type MessageType, type PayloadOf, type Settings, type TabsReport } from '@side/shared';
import type { JsonStore } from './store';
import { sanitizeSettings, type AppData } from './appData';
import type { BridgeStatus, CommandOutcome } from './bridge';
import type { DemoClock } from '../core/clock';
import type { LlmTransport } from '../core/llmGrouping';
import type { KeepReason } from '@side/shared';
import { WrapupService, type WrapupOutcome } from './wrapupService';
import { StepService } from './stepService';
import { SpeakService, type Bubble } from './speakService';
import { buildViewState, type ViewState } from './viewState';
import { demoOffset, type DemoCommand } from './demoClock';
import { todayDone } from '../core/todayDone';
import type { WrapupPreview } from '../core/wrapupPreview';

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
  edge: EdgePort | null;
  registerShortcut: (accelerator: string) => boolean;
  push: (state: ViewState) => void;
  renderBubble: (bubble: Bubble | null) => void;
  openMain: () => void;
  /** Real time, for computing demo offsets. */
  realNow?: () => number;
}

export interface PreviewView {
  groups: { key: string; name: string; tabs: { title: string; host: string | null }[] }[];
  kept: { title: string; reason: KeepReason }[];
  alreadySetAside: number;
  skipped: WrapupPreview['skipped'];
  foldCount: number;
}

export class SideController {
  readonly wrapup: WrapupService;
  readonly step: StepService;
  readonly speak: SpeakService;
  lastReport: TabsReport | null = null;
  private waiters: ((r: TabsReport | null) => void)[] = [];
  private draft: { preview: WrapupPreview; report: TabsReport } | null = null;

  constructor(private readonly deps: ControllerDeps) {
    const { store, bridge, clock, llm } = deps;
    this.wrapup = new WrapupService({ store, port: bridge, clock, llm });
    this.step = new StepService({ store, port: bridge, clock });
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
    return buildViewState({
      data: this.data,
      report: this.deps.bridge.status === 'connected' ? this.lastReport : null,
      bridge: this.deps.bridge.status,
      bubble: this.speak.bubble,
      now: this.deps.clock.now(),
    });
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
    if (s === 'connected' && !this.data.firstRunDone && !this.firstRunBusy) await this.greetFirstRun();
  }

  private firstRunBusy = false;

  /** The first words come from the user's real tabs: a fold draft, made by the LLM when it is on and reachable, else by rules. */
  private async greetFirstRun() {
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
    const preview = await this.wrapup.preview(report);
    this.draft = { preview, report };
    const byId = new Map(report.tabs.map((t) => [t.tabId, t]));
    return {
      groups: preview.fold.map((g) => ({
        key: g.key,
        name: g.name,
        tabs: g.tabIds.map((id) => ({ title: byId.get(id)?.title ?? '', host: hostOf(byId.get(id)?.url ?? '') })),
      })),
      kept: preview.kept.map((k) => ({ title: k.title, reason: k.reason })),
      alreadySetAside: preview.alreadySetAside.length,
      skipped: preview.skipped,
      foldCount: preview.foldCount,
    };
  }

  async confirmWrapup(closeGroupKeys: string[]): Promise<WrapupOutcome | { kind: 'no_preview' }> {
    if (!this.draft) return { kind: 'no_preview' };
    const { preview, report } = this.draft;
    const keys = closeGroupKeys.filter((k) => preview.fold.some((g) => g.key === k));
    const out = await this.wrapup.confirm(preview, report, keys);
    if (out.kind !== 'storage_failed') this.draft = null;
    this.publish();
    return out;
  }

  // ---- One more hour ----

  async oneMoreHour() {
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
