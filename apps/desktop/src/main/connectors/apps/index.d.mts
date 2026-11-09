// Types for the desktop app adapters (plain ESM, see README.md).

/** A piece of recent work. Its path is kept privately and never enumerable. */
export interface AppWork {
  id: string;
  app: string;
  tool: string;
  name: string;
  touched_at: string | null;
}

export interface AppCandidate {
  id: string;
  kind: 'app';
  label: string;
  tool: string;
  effect: 'runs' | 'opens';
  safety: 'read_only';
  size: 1 | 2 | 3;
}

export type AppActionError =
  | 'automation_denied'
  | 'automation_pending'
  | 'action_incomplete'
  | 'already_running'
  | 'file_moved'
  | 'app_not_installed'
  | 'open_failed'
  | 'stale_candidate';

export interface AppActionResult {
  ok: boolean;
  did: 'ran' | 'opened' | null;
  tool: string;
  error?: AppActionError;
  message?: string;
}

export function installedApps(): Promise<{ id: string; name: string }[]>;
/** `only`: adapter ids the person turned on; any other app is treated as not installed. */
export function recentWork(opts?: { limit?: number; only?: readonly string[] | null }): Promise<AppWork[]>;
export function appCandidates(work: AppWork | { id: string } | null, opts?: { locale?: string }): AppCandidate[];
export function performAppAction(work: AppWork | { id: string }, candidateId: string, opts?: { locale?: string }): Promise<AppActionResult>;
export function frontDocument(frontAppName: string): Promise<{ app: string; name: string } | null>;
