// What sidy says, and when. It speaks only at return moments and at a check-in the user chose;
// everything else is silence with a recorded reason. While hidden or asleep, only the latest
// missed bubble is kept, and it is shown once sidy is back.
import { newId, type QuietReason, type StopPromise } from '@side/shared';
import type { JsonStore } from './store';
import type { AppData } from './appData';
import type { Clock } from '../core/clock';
import { currentStep } from '../core/step';
import { decideSpeak, keepLatest, type PendingBubble, type SpeakTrigger } from '../core/speakPolicy';
import {
  activePromise,
  answerPromise,
  choosePromise,
  firePromise,
  isDue,
  oneMoreHour,
  type PromiseAnswer,
  type PromiseChoice,
} from '../core/promise';

export type Bubble =
  | { kind: 'step'; stepId: string; trigger: SpeakTrigger }
  | { kind: 'promise'; promiseId: string }
  /** First run: a draft of how the real open tabs would fold. */
  | { kind: 'first_run'; tabs: number; groups: number };

export interface SpeakDeps {
  store: JsonStore<AppData>;
  clock: Clock;
  /** Draws (or clears, with null) the one bubble. The renderer confirms drawing via confirmDrawn. */
  render: (bubble: Bubble | null) => void;
}

const QUIET_LOG_MAX = 200;

export class SpeakService {
  private pending: PendingBubble | null = null;
  private onScreen: Bubble | null = null;
  asleep = false;

  constructor(private readonly deps: SpeakDeps) {}

  private get data() {
    return this.deps.store.get();
  }

  /** The bubble currently drawn, if any. */
  get bubble(): Bubble | null {
    return this.onScreen;
  }

  private stepId(): string | null {
    const d = this.data;
    return currentStep(d.setAsides, d.steps, d.settings.excludedDomains, this.deps.clock)?.id ?? null;
  }

  private async logQuiet(reason: QuietReason) {
    const at = this.deps.clock.now();
    await this.deps.store
      .update((d) => ({ ...d, quietLog: [...d.quietLog, { at, reason }].slice(-QUIET_LOG_MAX) }))
      .catch(() => undefined);
  }

  /** A return moment (or first run). Shows at most one bubble. */
  async trigger(trigger: SpeakTrigger): Promise<Bubble | null> {
    const d = this.data;
    const now = this.deps.clock.now();
    const stepId = this.stepId();
    const decision = decideSpeak(trigger, {
      now,
      hidden: d.hidden || this.asleep,
      quietHours: d.settings.quietHours,
      focusUntil: d.focusUntil,
      restedUntil: d.restedUntil,
      lastSpokeAt: d.spokeAt.length ? d.spokeAt[d.spokeAt.length - 1] : null,
      hasSomethingToSay: stepId !== null,
    });
    if (!decision.speak) {
      if (decision.reason === 'hidden' && stepId) this.pending = keepLatest(this.pending, { trigger, at: now, stepId });
      await this.logQuiet(decision.reason);
      return null;
    }
    return this.show({ kind: 'step', stepId: stepId!, trigger });
  }

  /** First connection: sidy opens with a draft built from the real tabs, not a question. */
  async firstRun(draft: { tabs: number; groups: number }): Promise<Bubble | null> {
    const d = this.data;
    const decision = decideSpeak('first_run', {
      now: this.deps.clock.now(),
      hidden: d.hidden || this.asleep,
      quietHours: d.settings.quietHours,
      focusUntil: d.focusUntil,
      restedUntil: d.restedUntil,
      lastSpokeAt: null,
      hasSomethingToSay: draft.tabs > 0,
    });
    if (!decision.speak) {
      await this.logQuiet(decision.reason);
      return null;
    }
    return this.show({ kind: 'first_run', tabs: draft.tabs, groups: draft.groups });
  }

  private show(b: Bubble): Bubble {
    this.onScreen = b;
    this.pending = null;
    this.deps.render(b);
    return b;
  }

  /** The renderer drew the current bubble: this is when sidy "spoke". */
  async confirmDrawn(): Promise<void> {
    if (!this.onScreen) return;
    const at = this.deps.clock.now();
    const firstRun = this.onScreen.kind === 'first_run';
    await this.deps.store.update((d) => ({ ...d, spokeAt: [...d.spokeAt, at], firstRunDone: d.firstRunDone || firstRun }));
  }

  /** The user closed the bubble (or acted on it). */
  clear() {
    this.onScreen = null;
    this.deps.render(null);
  }

  async setHidden(hidden: boolean): Promise<void> {
    await this.deps.store.update((d) => ({ ...d, hidden }));
    if (hidden) {
      this.onScreen = null;
      return;
    }
    // Back on screen: show only the latest missed bubble, if it still applies.
    const missed = this.pending;
    this.pending = null;
    if (missed && missed.stepId && missed.stepId === this.stepId()) {
      await this.trigger(missed.trigger);
    }
  }

  async setFocus(minutes: number | null): Promise<void> {
    const until = minutes ? this.deps.clock.now() + minutes * 60_000 : null;
    await this.deps.store.update((d) => ({ ...d, focusUntil: until }));
  }

  // ---- One more hour ----

  /** Never blocks. Saves the summary so far first, then answers with respect and one fact. */
  async oneMoreHour(summary: string[]): Promise<{ respect: string; fact: string | null }> {
    this.summary = [...summary];
    const now = this.deps.clock.now();
    return oneMoreHour(now, this.data.settings.wakeMinutes);
  }
  private summary: string[] = [];

  /** The user picked when to stop. Choosing again replaces it; one promise stays active. */
  async choose(minutes: PromiseChoice): Promise<StopPromise | null> {
    const now = this.deps.clock.now();
    const d = await this.deps.store.update((x) => ({
      ...x,
      promises: choosePromise(x.promises, minutes, now, this.summary, newId),
    }));
    return activePromise(d.promises);
  }

  /** Called on a timer. Fires the check-in exactly once when it is due. */
  async tick(): Promise<Bubble | null> {
    const now = this.deps.clock.now();
    const p = activePromise(this.data.promises);
    if (!isDue(p, now) || !p) return null;
    const decision = decideSpeak('promise_due', {
      now,
      hidden: this.data.hidden || this.asleep,
      quietHours: this.data.settings.quietHours,
      focusUntil: this.data.focusUntil,
      restedUntil: this.data.restedUntil,
      lastSpokeAt: null,
      hasSomethingToSay: true,
    });
    if (!decision.speak) {
      await this.logQuiet(decision.reason);
      return null;
    }
    await this.deps.store.update((d) => ({
      ...d,
      promises: d.promises.map((x) => (x.id === p.id ? firePromise(x, now) : x)),
    }));
    return this.show({ kind: 'promise', promiseId: p.id });
  }

  async answer(answer: PromiseAnswer): Promise<{ goToWrapup: boolean }> {
    const now = this.deps.clock.now();
    const p = [...this.data.promises].reverse().find((x) => x.firedAt !== null && x.answer === null);
    if (!p) return { goToWrapup: answer === 'set_aside' };
    const out = answerPromise(p, answer, now);
    await this.deps.store.update((d) => ({
      ...d,
      promises: d.promises.map((x) => (x.id === p.id ? out.promise : x)),
      restedUntil: out.restedUntil ?? d.restedUntil,
    }));
    this.clear();
    return { goToWrapup: out.goToWrapup };
  }
}
