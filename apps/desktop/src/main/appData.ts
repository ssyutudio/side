// The shape of Side's local data file and its defaults.
import type { AgentRun } from './connectors/claudeCode';
import {
  DEFAULT_WAKE_MINUTES,
  SIDY_SIZES,
  normalizeDomain,
  type QuietEntry,
  type SetAside,
  type Settings,
  type Step,
  type StepEvent,
  type StopPromise,
  type WrapupApplyPayload,
} from '@side/shared';

export interface AppData {
  version: 1;
  installId: string;
  settings: Settings;
  /** chrome-extension://<id> pinned on first connection. */
  pairedOrigin: string | null;
  setAsides: SetAside[];
  /** The exact command sent for each set-aside, so a retry resends the same thing. */
  applyPayloads: Record<string, WrapupApplyPayload>;
  steps: Step[];
  stepEvents: StepEvent[];
  quietLog: QuietEntry[];
  /** Times sidy spoke first (epoch ms). */
  spokeAt: number[];
  promises: StopPromise[];
  /** After "Rest today" / "Not today", sidy stays quiet until this time (next work day). */
  restedUntil: number | null;
  focusUntil: number | null;
  /** Demo clock offset in ms; 0 means real time. */
  demoOffsetMs: number;
  /** sidy is hidden until the shortcut or the Dock brings it back. */
  hidden: boolean;
  firstRunDone: boolean;
  /** What was sent to the LLM (counts only), for "What Side saw". */
  llmLog: { at: number; titles: number; userLine: boolean; files?: number }[];
  /** Claude Code sessions that finished (folder kept on this computer only). Newest last, at most 20. */
  agentRuns?: AgentRun[];
}

export function defaultSettings(): Settings {
  return {
    sidySize: 'small',
    shortcut: 'Control+Alt+S',
    quietHours: null,
    wakeMinutes: DEFAULT_WAKE_MINUTES,
    llmEnabled: true,
    uploadEnabled: false,
    excludedDomains: [],
  };
}

export function defaultAppData(): AppData {
  return {
    version: 1,
    installId: globalThis.crypto.randomUUID(),
    settings: defaultSettings(),
    pairedOrigin: null,
    setAsides: [],
    applyPayloads: {},
    steps: [],
    stepEvents: [],
    quietLog: [],
    spokeAt: [],
    promises: [],
    restedUntil: null,
    focusUntil: null,
    demoOffsetMs: 0,
    hidden: false,
    firstRunDone: false,
    llmLog: [],
  };
}

export function sanitizeSettings(s: Settings): Settings {
  const domains: string[] = [];
  for (const raw of s.excludedDomains ?? []) {
    const d = normalizeDomain(String(raw));
    if (d && !domains.includes(d)) domains.push(d);
  }
  return {
    ...defaultSettings(),
    ...s,
    sidySize: (SIDY_SIZES as readonly string[]).includes(s.sidySize) ? s.sidySize : 'small',
    language: s.language === 'ko' || s.language === 'en' ? s.language : undefined,
    sidyAnchor: typeof s.sidyAnchor === 'number' && s.sidyAnchor >= 0 && s.sidyAnchor <= 1 ? s.sidyAnchor : undefined,
    excludedDomains: domains,
    apps: [...new Set((s.apps ?? []).filter((a) => typeof a === 'string' && /^[a-z_]{1,40}$/.test(a)))].slice(0, 40),
  };
}
