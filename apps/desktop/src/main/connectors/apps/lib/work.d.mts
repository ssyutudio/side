// Types for lib/work.mjs (see ../README.md).
import type { AppWork } from '../index.mjs';

export interface PrivateFacts {
  adapterId: string;
  path: string | null;
  key: string;
  lookback: { path: string; name: string; media: string } | null;
}

export function makeWork(input: { adapterId: string; path?: string | null; key?: string | null; name: string; touchedMs: number; lookback?: PrivateFacts['lookback'] }): AppWork;
export function privateFacts(work: AppWork | { id: string } | null): PrivateFacts | null;
