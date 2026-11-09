// The shape of Side's local data file and its defaults.
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
} from '@side/shared';

export interface AppData {
  version: 1;
  installId: string;
  settings: Settings;
  /** chrome-extension://<id> pinned on first connection. */
  pairedOrigin: string | null;
  setAsides: SetAside[];
  steps: Step[];
  stepEvents: StepEvent[];
  quietLog: QuietEntry[];
  /** Times sidy spoke first (epoch ms). */
  spokeAt: number[];
  promises: StopPromise[];
  /** Local date key (YYYY-MM-DD) of the day the user chose "Rest today". */
  restedOn: string | null;
  focusUntil: number | null;
  /** Demo clock offset in ms; 0 means real time. */
  demoOffsetMs: number;
  /** sidy is hidden until the shortcut or the Dock brings it back. */
  hidden: boolean;
  firstRunDone: boolean;
  /** What was sent to the LLM (counts only), for "What Side saw". */
  llmLog: { at: number; titles: number; userLine: boolean }[];
}

export function defaultSettings(): Settings {
  return {
    sidySize: 'small',
    shortcut: 'Control+Alt+S',
    quietHours: null,
    wakeMinutes: DEFAULT_WAKE_MINUTES,
    llmEnabled: false,
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
    steps: [],
    stepEvents: [],
    quietLog: [],
    spokeAt: [],
    promises: [],
    restedOn: null,
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
    excludedDomains: domains,
  };
}
