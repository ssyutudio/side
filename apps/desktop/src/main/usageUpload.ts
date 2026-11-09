// Anonymous counts for the deck (Director 4-B), sent only when the user turns upload on.
// The payload is an install id plus whole-number counts; no URL, title, line or domain exists in it.
// It goes to the Vercel function, never straight to the database, so the app holds no DB password.
import type { SideNumbers } from '../core/stats';

export interface UsagePayload {
  installId: string;
  tabsSetAside: number;
  linesSetAside: number;
  sidySpoke: number;
  stepsShown: number;
  stepsClicked: number;
  stillWorking10m: number;
}

/** The deployed waitlist function. Upload still does nothing unless the user turns it on. */
export const USAGE_ENDPOINT: string | null = 'https://side-waitlist.vercel.app/api/usage';

const whole = (n: number | null | undefined) => Math.max(0, Math.round(n ?? 0));

export function buildUsagePayload(n: SideNumbers, installId: string): UsagePayload {
  return {
    installId,
    tabsSetAside: whole(n.setAsideTotals.tabs),
    linesSetAside: whole(n.setAsideTotals.lines),
    sidySpoke: whole(n.spokeTotal),
    stepsShown: whole(n.shown),
    stepsClicked: whole(n.clicked),
    stillWorking10m: whole((n.stillWorkingRate.value ?? 0) * n.stillWorkingRate.n),
  };
}

export type UploadResult = 'off' | 'no_endpoint' | 'sent' | 'failed';

export async function uploadUsage(opts: {
  enabled: boolean;
  endpoint: string | null;
  payload: UsagePayload;
  fetch: (url: string, init?: RequestInit) => Promise<Response>;
}): Promise<UploadResult> {
  if (!opts.enabled) return 'off';
  if (!opts.endpoint) return 'no_endpoint';
  try {
    const res = await opts.fetch(opts.endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(opts.payload),
    });
    return res.ok ? 'sent' : 'failed';
  } catch {
    return 'failed';
  }
}
