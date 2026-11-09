// Data model shared by the desktop app, the extension and the core logic.
// Starts from the plan draft (TabSnapshot, SetAside, Step, StepEvent) with fields added
// for tab safety (expected URLs, keep reasons) and honest wording (date precision).

/** Where the user was looking on a page. `scroller` tells which element actually scrolled. */
export interface PagePosition {
  scroller: 'window' | 'element';
  /** CSS selector of the inner scroller when scroller === 'element' (Google Docs, Notion). */
  selector: string | null;
  /** Scroll offset in px of the scroller. */
  top: number;
  /** top / (scrollHeight - clientHeight), 0..1. Survives small layout changes. */
  ratio: number;
  /** A short sentence that was visible, used for a #:~:text= link when scrolling fails. */
  quote: string | null;
  capturedAt: number;
}

/** One Chrome tab as the extension saw it. Excluded-site tabs never become a TabSnapshot. */
export interface TabSnapshot {
  tabId: number;
  windowId: number;
  index: number;
  url: string;
  title: string;
  lastAccessed: number | null;
  active: boolean;
  pinned: boolean;
  audible: boolean;
  incognito: boolean;
  /** -1 when the tab is not in a group. */
  groupId: number;
  groupTitle: string | null;
  position: PagePosition | null;
}

/** What the extension skipped, by count only. */
export interface SkippedSummary {
  excluded: number;
  excludedByDomain: Record<string, number>;
  incognito: number;
  /** chrome://, file:// and other non-web pages. */
  internal: number;
}

export interface TabsReport {
  tabs: TabSnapshot[];
  skipped: SkippedSummary;
  capturedAt: number;
}

export type KeepReason =
  | 'active'
  | 'pinned'
  | 'audible'
  | 'incognito'
  | 'excluded'
  | 'user_group'
  | 'changed'
  | 'gone';

export interface WorkGroup {
  key: string;
  name: string;
  tabIds: number[];
  source: 'rule' | 'llm';
}

export interface SavedTab {
  tabId: number;
  url: string;
  title: string;
  lastAccessed: number | null;
  position: PagePosition | null;
  groupKey: string;
}

export interface KeptTab {
  tabId: number;
  title: string;
  reason: KeepReason;
}

export type SetAsideStatus = 'saved' | 'checking' | 'applied' | 'partial' | 'failed' | 'unconfirmed' | 'undone';

/** One Wrap up. Saved locally before anything is sent to Chrome. */
export interface SetAside {
  id: string;
  endedAt: number;
  tabs: SavedTab[];
  groups: WorkGroup[];
  kept: KeptTab[];
  /** The one line answer to "What are you most curious about tomorrow?". Null when skipped. */
  userLine: string | null;
  todayDone: string[];
  closeRequested: boolean;
  status: SetAsideStatus;
  result: WrapupResult | null;
}

export interface StepAction {
  type: 'open_url';
  url: string;
  title: string;
  position: PagePosition | null;
}

export interface StepChecks {
  noJudgment: boolean;
  cannotFail: boolean;
  inRealTool: boolean;
  resultVisible: boolean;
}

export interface Step {
  id: string;
  fromSetAside: string;
  createdAt: number;
  label: string;
  action: StepAction;
  checks: StepChecks;
  source: 'rule' | 'llm';
}

export type DismissKind = 'not_now' | 'rest_today';

export interface StepEvent {
  stepId: string;
  /** Set only after the bubble was actually drawn on screen. */
  shownAt: number | null;
  clickedAt: number | null;
  /** When the extension confirmed the page was open and positioned. */
  openedAt: number | null;
  stillWorkingAt10m: boolean | null;
  dismissed: DismissKind | null;
}

// ---- Settings and small records kept by the desktop app ----

export interface Settings {
  sidySize: 'small' | 'medium' | 'large';
  /** Electron accelerator that shows or hides sidy. */
  shortcut: string;
  /** Minutes from local midnight; sidy does not speak first inside this window. Null = off. */
  quietHours: { start: number; end: number } | null;
  /** Wake-up time in minutes from midnight, used only for the "if you sleep now" fact line. */
  wakeMinutes: number;
  /** Off by default (Director 1-B). When on, only tab titles, temporary ids and the user's line are sent. */
  llmEnabled: boolean;
  /** Off by default (Director 4-B reading). When on, only anonymous counts and an install id are sent. */
  uploadEnabled: boolean;
  excludedDomains: string[];
}

/** Why sidy stayed quiet at a moment it could have spoken. Shown in Main. */
export type QuietReason = 'quiet_hours' | 'focus' | 'spoke_recently' | 'hidden' | 'rested_today' | 'nothing_to_say';

export interface QuietEntry {
  at: number;
  reason: QuietReason;
}

/** "One more hour": the user picked when to stop; sidy asks exactly once at that time. */
export interface StopPromise {
  id: string;
  madeAt: number;
  dueAt: number;
  minutes: number;
  firedAt: number | null;
  answer: 'set_aside' | 'keep_going' | 'not_today' | null;
  /** Summary of what was done so far, saved before anything else. */
  summary: string[];
}

// ---- Commands between app and extension ----

export interface WrapupGroupCmd {
  key: string;
  name: string;
  tabIds: number[];
}

export interface WrapupApplyPayload {
  setAsideId: string;
  groups: WrapupGroupCmd[];
  /** Tabs the user confirmed closing. Empty means fold only. */
  closeTabIds: number[];
  /** URL each tab had in the preview, keyed by tab id. A tab whose URL changed is left alone. */
  expectUrls: Record<string, string>;
}

export interface WrapupResult {
  grouped: { key: string; chromeGroupId: number; tabIds: number[] }[];
  closed: number[];
  kept: { tabId: number; reason: KeepReason }[];
}

export interface UndoResult {
  ungrouped: number[];
  reopened: number;
}

export interface StepOpenPayload {
  stepId: string;
  url: string;
  position: PagePosition | null;
}

export interface StepOpenResult {
  tabId: number;
  restored: 'exact' | 'text' | 'top';
}

export type CmdErrorKind = 'chrome' | 'storage' | 'rejected';

export interface CmdResultPayload {
  ok: boolean;
  result?: unknown;
  error?: { kind: CmdErrorKind; message: string };
}
