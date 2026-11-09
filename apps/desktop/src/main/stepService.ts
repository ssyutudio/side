// The one step on return: offered, drawn, clicked, opened in Chrome, and judged ten minutes later.
// Chrome is touched only when the user clicks; nothing opens on its own.
import type { DismissKind, Step, StepOpenResult, TabsReport } from '@side/shared';
import type { JsonStore } from './store';
import type { AppData } from './appData';
import type { CommandPort } from './wrapupService';
import type { Clock } from '../core/clock';
import { currentStep } from '../core/step';
import { restUntil } from '../core/speakPolicy';
import { applyStillWorking, markClicked, markDismissed, markOpened, markShown, secondsToWork } from '../core/stepEvents';

export type OpenOutcome =
  | { kind: 'opened'; restored: StepOpenResult['restored']; seconds: number | null }
  | { kind: 'failed'; message: string }
  | { kind: 'unconfirmed'; reason: string }
  | { kind: 'not_found' };

/** Local calendar date as YYYY-MM-DD (date precision only). */
export function localDateKey(ms: number): string {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** URL of the tab the user is on: the active tab used most recently. Undefined when unknown. */
export function activeUrlOf(report: TabsReport | null): string | null | undefined {
  if (!report) return undefined;
  const active = report.tabs.filter((t) => t.active);
  if (!active.length) return null;
  return active.reduce((a, b) => ((b.lastAccessed ?? 0) > (a.lastAccessed ?? 0) ? b : a)).url;
}

export class StepService {
  constructor(private readonly deps: { store: JsonStore<AppData>; port: CommandPort; clock: Clock }) {}

  private get data() {
    return this.deps.store.get();
  }

  current(): Step | null {
    const d = this.data;
    return currentStep(d.setAsides, d.steps, d.settings.excludedDomains, this.deps.clock);
  }

  /** Called by the renderer after the bubble is actually on screen. */
  async shown(stepId: string, state: { hidden: boolean; asleep: boolean }): Promise<void> {
    const at = this.deps.clock.now();
    await this.deps.store.update((d) => {
      const steps = d.steps.some((s) => s.id === stepId) ? d.steps : this.withCurrent(d.steps, stepId);
      return { ...d, steps, stepEvents: markShown(d.stepEvents, stepId, at, state) };
    });
  }

  async open(stepId: string): Promise<OpenOutcome> {
    const step = this.find(stepId);
    if (!step) return { kind: 'not_found' };
    const clickedAt = this.deps.clock.now();
    await this.deps.store.update((d) => ({
      ...d,
      steps: d.steps.some((s) => s.id === stepId) ? d.steps : [...d.steps, step],
      stepEvents: markClicked(d.stepEvents, stepId, clickedAt),
    }));
    const outcome = await this.deps.port.command('cmd.step.open', {
      stepId,
      url: step.action.url,
      position: step.action.position,
    });
    if (outcome.status === 'ok') {
      const openedAt = this.deps.clock.now();
      const d = await this.deps.store.update((x) => ({ ...x, stepEvents: markOpened(x.stepEvents, stepId, openedAt) }));
      const ev = d.stepEvents.find((e) => e.stepId === stepId)!;
      const restored = ((outcome.result as Partial<StepOpenResult> | undefined)?.restored ?? 'top') as StepOpenResult['restored'];
      return { kind: 'opened', restored, seconds: secondsToWork(ev) };
    }
    if (outcome.status === 'failed') return { kind: 'failed', message: outcome.error.message };
    return { kind: 'unconfirmed', reason: outcome.reason };
  }

  async dismiss(stepId: string, kind: DismissKind): Promise<void> {
    const until = restUntil(this.deps.clock.now());
    await this.deps.store.update((d) => ({
      ...d,
      stepEvents: markDismissed(d.stepEvents, stepId, kind),
      restedUntil: kind === 'rest_today' ? until : d.restedUntil,
    }));
  }

  /** Feed every tab report here; due "still working" checks are filled in once and never change. */
  async observe(report: TabsReport | null): Promise<void> {
    const d = this.data;
    const next = applyStillWorking(d.stepEvents, d.steps, d.setAsides, activeUrlOf(report), this.deps.clock.now());
    const changed = next.some((e, i) => e !== d.stepEvents[i]);
    if (changed) await this.deps.store.update((x) => ({ ...x, stepEvents: next }));
  }

  private find(stepId: string): Step | null {
    return this.data.steps.find((s) => s.id === stepId) ?? (this.current()?.id === stepId ? this.current() : null);
  }

  private withCurrent(steps: Step[], stepId: string): Step[] {
    const cur = this.current();
    return cur && cur.id === stepId ? [...steps, cur] : steps;
  }
}
