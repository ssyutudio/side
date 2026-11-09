// Wrap up, end to end: preview -> save locally -> ask Chrome -> record only what Chrome confirmed.
// Losing tabs is the worst failure, so the record is written before any tab is touched, a retry
// resends the exact same command (the extension makes it idempotent), and Undo covers the last run.
import {
  isExcluded,
  matchExcluded,
  newId,
  type MessageType,
  type PayloadOf,
  type SetAside,
  type TabsReport,
  type WrapupResult,
} from '@side/shared';
import type { JsonStore } from './store';
import type { AppData } from './appData';
import type { CommandOutcome } from './bridge';
import type { AppsPort } from './connectors/desktopApps';
import type { Clock } from '../core/clock';
import { groupTabs } from '../core/grouping';
import { groupWithLlm, type LlmTransport } from '../core/llmGrouping';
import { buildPreview, candidateTabs, toApplyPayload, toSetAside, type WrapupPreview } from '../core/wrapupPreview';
import { todayDone, workDayOf, WORK_DAY_START_HOURS } from '../core/todayDone';
import { buildStep, enabledApps, latestSetAside } from '../core/step';

export interface CommandPort {
  command<T extends MessageType>(type: T, payload: PayloadOf<T>): Promise<CommandOutcome>;
}

export type WrapupOutcome =
  | { kind: 'applied'; setAside: SetAside }
  | { kind: 'partial'; setAside: SetAside }
  | { kind: 'chrome_failed'; setAside: SetAside; message: string }
  | { kind: 'extension_storage_failed'; setAside: SetAside; message: string }
  | { kind: 'storage_failed'; message: string }
  | { kind: 'unconfirmed'; setAside: SetAside; reason: 'timeout' | 'disconnected' | 'not_connected' }
  | { kind: 'not_found' };

export type UndoOutcome =
  | { kind: 'undone'; reopened: number }
  | { kind: 'not_latest' }
  | { kind: 'not_found' }
  | { kind: 'failed'; message: string }
  | { kind: 'unconfirmed'; reason: string };

export interface WrapupDeps {
  store: JsonStore<AppData>;
  port: CommandPort;
  clock: Clock;
  /** Present when a key exists. Used only while Settings has the LLM on (the default). */
  llm?: LlmTransport | null;
  /** Desktop apps turned on in Connections. Without it (or with none on) no file is looked at. */
  apps?: AppsPort | null;
}

const isLive = (sa: SetAside) => sa.status === 'applied' || sa.status === 'partial';

export class WrapupService {
  constructor(private readonly deps: WrapupDeps) {}

  private get data(): AppData {
    return this.deps.store.get();
  }

  /** Names of the Chrome groups Side made and has not undone. */
  sideGroupNames(): string[] {
    return this.data.setAsides.filter(isLive).flatMap((sa) => sa.groups.map((g) => g.name));
  }

  /** Files saved today in the apps turned on in Connections. Only names and times are read, never contents. */
  async filesToday(): Promise<NonNullable<SetAside['files']>> {
    const on = enabledApps(this.data.settings);
    if (!on.length || !this.deps.apps) return [];
    const dayStart = workDayOf(this.deps.clock.now()) + WORK_DAY_START_HOURS * 3_600_000;
    return this.deps.apps.filesSince(on, dayStart).catch(() => []);
  }

  /** Second guard: a report must never carry an excluded-site tab into the preview or the file. */
  private clean(report: TabsReport): TabsReport {
    const excluded = this.data.settings.excludedDomains;
    const byDomain = { ...report.skipped.excludedByDomain };
    let dropped = 0;
    const tabs = report.tabs.filter((t) => {
      const hit = matchExcluded(t.url, excluded);
      if (!hit) return true;
      byDomain[hit] = (byDomain[hit] ?? 0) + 1;
      dropped++;
      return false;
    });
    return { ...report, tabs, skipped: { ...report.skipped, excluded: report.skipped.excluded + dropped, excludedByDomain: byDomain } };
  }

  async preview(rawReport: TabsReport): Promise<WrapupPreview> {
    const report = this.clean(rawReport);
    const names = this.sideGroupNames();
    const candidates = candidateTabs(report, names);
    const { settings } = this.data;
    let groups = groupTabs(candidates);
    if (settings.llmEnabled && this.deps.llm && candidates.length > 0) {
      const outcome = await groupWithLlm(candidates, null, settings.excludedDomains, this.deps.llm, this.deps.clock);
      groups = outcome.groups;
      const at = this.deps.clock.now();
      await this.deps.store
        .update((d) => ({ ...d, llmLog: [...d.llmLog, { at, titles: candidates.length, userLine: false }].slice(-50) }))
        .catch(() => undefined);
    }
    return buildPreview(report, groups, names);
  }

  /** Saves the record, then asks Chrome. `closeGroupKeys` are groups whose list the user confirmed closing. */
  async confirm(preview: WrapupPreview, rawReport: TabsReport, closeGroupKeys: readonly string[], shownFiles?: SetAside['files']): Promise<WrapupOutcome> {
    const report = this.clean(rawReport);
    const id = newId();
    const payload = toApplyPayload(preview, id, closeGroupKeys);
    // Never send a tab the exclusion list covers, whatever the preview said.
    const excluded = this.data.settings.excludedDomains;
    payload.groups = payload.groups
      .map((g) => ({ ...g, tabIds: g.tabIds.filter((t) => !isExcluded(payload.expectUrls[String(t)] ?? '', excluded)) }))
      .filter((g) => g.tabIds.length > 0);
    const files = shownFiles ?? (await this.filesToday());
    const record: SetAside = {
      ...toSetAside(id, preview, report, this.deps.clock.now(), null, [], closeGroupKeys.length > 0),
      skipped: report.skipped,
      ...(files.length ? { files } : {}),
    };
    try {
      await this.deps.store.update((d) => ({
        ...d,
        setAsides: [...d.setAsides, record],
        applyPayloads: { ...d.applyPayloads, [id]: payload },
      }));
    } catch (err) {
      return { kind: 'storage_failed', message: (err as Error).message };
    }
    return this.send(id);
  }

  /** Sends (or resends) the saved command for a set-aside and records the confirmed result. */
  async retry(setAsideId: string): Promise<WrapupOutcome> {
    return this.send(setAsideId);
  }

  private async send(id: string): Promise<WrapupOutcome> {
    const payload = this.data.applyPayloads[id];
    if (!payload || !this.data.setAsides.some((s) => s.id === id)) return { kind: 'not_found' };
    const outcome = await this.deps.port.command('cmd.wrapup.apply', payload);

    let next: SetAside['status'];
    let result: WrapupResult | null = null;
    if (outcome.status === 'ok') {
      result = normalizeResult(outcome.result, payload.groups);
      next = result.kept.length > 0 ? 'partial' : 'applied';
    } else if (outcome.status === 'failed') {
      next = 'failed';
    } else {
      next = 'unconfirmed';
    }

    const saved = await this.patch(id, (sa) => ({ ...sa, status: next, result: result ?? sa.result }));
    if (outcome.status === 'ok') await this.afterApplied(id);
    const setAside = this.data.setAsides.find((s) => s.id === id) ?? saved;
    if (outcome.status === 'ok') return { kind: next === 'partial' ? 'partial' : 'applied', setAside };
    if (outcome.status === 'failed') {
      return outcome.error.kind === 'storage'
        ? { kind: 'extension_storage_failed', setAside, message: outcome.error.message }
        : { kind: 'chrome_failed', setAside, message: outcome.error.message };
    }
    return { kind: 'unconfirmed', setAside, reason: outcome.reason };
  }

  private async afterApplied(id: string) {
    const { clock } = this.deps;
    await this.deps.store
      .update((d) => {
        const lines = todayDone({ setAsides: d.setAsides, steps: d.steps, stepEvents: d.stepEvents }, clock);
        const setAsides = d.setAsides.map((sa) => (sa.id === id ? { ...sa, todayDone: lines } : sa));
        const sa = setAsides.find((s) => s.id === id)!;
        const step = buildStep(sa, d.settings.excludedDomains, clock, undefined, { enabled: enabledApps(d.settings), pick: this.deps.apps?.pick });
        const steps = d.steps.filter((s) => s.fromSetAside !== id);
        return { ...d, setAsides, steps: step ? [...steps, step] : steps };
      })
      .catch((err) => console.warn('[side] could not save the step:', (err as Error).message));
  }

  async undo(setAsideId: string): Promise<UndoOutcome> {
    const sa = this.data.setAsides.find((s) => s.id === setAsideId);
    if (!sa) return { kind: 'not_found' };
    const latest = latestSetAside(this.data.setAsides);
    if (!latest || latest.id !== setAsideId) return { kind: 'not_latest' };
    const outcome = await this.deps.port.command('cmd.wrapup.undo', { setAsideId });
    if (outcome.status === 'ok') {
      const reopened = Number((outcome.result as { reopened?: unknown } | undefined)?.reopened ?? 0) || 0;
      await this.patch(setAsideId, (x) => ({ ...x, status: 'undone' }));
      await this.deps.store.update((d) => ({ ...d, steps: d.steps.filter((s) => s.fromSetAside !== setAsideId) }));
      return { kind: 'undone', reopened };
    }
    if (outcome.status === 'failed') return { kind: 'failed', message: outcome.error.message };
    return { kind: 'unconfirmed', reason: outcome.reason };
  }

  /** The answer to "What are you most curious about tomorrow?". Null means skipped. */
  async setTomorrowLine(setAsideId: string, line: string | null): Promise<void> {
    const clean = line?.trim() ? line.trim().slice(0, 200) : null;
    await this.patch(setAsideId, (sa) => ({ ...sa, userLine: clean }));
    const sa = this.data.setAsides.find((s) => s.id === setAsideId);
    if (sa && isLive(sa)) await this.afterApplied(setAsideId);
  }

  private async patch(id: string, fn: (sa: SetAside) => SetAside): Promise<SetAside> {
    let out: SetAside | undefined;
    await this.deps.store.update((d) => ({
      ...d,
      setAsides: d.setAsides.map((sa) => (sa.id === id ? (out = fn(sa)) : sa)),
    }));
    return out!;
  }
}

/** The extension's result, or (if it only said ok) the command's own groups. */
function normalizeResult(raw: unknown, groups: { key: string; tabIds: number[] }[]): WrapupResult {
  const r = raw as Partial<WrapupResult> | null | undefined;
  if (r && Array.isArray(r.grouped) && Array.isArray(r.closed) && Array.isArray(r.kept)) {
    return { grouped: r.grouped, closed: r.closed, kept: r.kept };
  }
  return { grouped: groups.map((g) => ({ key: g.key, chromeGroupId: -1, tabIds: [...g.tabIds] })), closed: [], kept: [] };
}
