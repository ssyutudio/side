// Who may use Claude through Side's server, and how much. A license is checked with Lemon Squeezy
// at most once an hour per Mac (a "no" is re-checked after five minutes, so a renewal shows up
// quickly); the answer is cached by a hash of the key, never the key itself. Each license gets a
// daily number of Claude requests across all its Macs, so one leaked key cannot run up the bill.
import { createHash } from 'node:crypto';
import type { SqlTag } from './db.js';
import type { Lemon } from './lemon.js';

export const OK_TTL_MS = 60 * 60_000;
export const NO_TTL_MS = 5 * 60_000;
/** Claude requests per license per UTC day. A heavy day of real use is a few dozen. */
export const DAILY_LLM_LIMIT = 200;

export function keyHash(licenseKey: string): string {
  return createHash('sha256').update(licenseKey).digest('hex');
}

export type Entitlement = { ok: true } | { ok: false; status: 402 | 503; reason: string; license?: string };

interface CheckRow {
  ok: boolean;
  status: string;
  checked_at: Date | string;
}

/** Pro means: the key is ours, active (or on trial, which Lemon Squeezy reports as active), and activated on this Mac. */
export async function entitled(sql: SqlTag, lemon: Lemon, licenseKey: string, instanceId: string, now = Date.now()): Promise<Entitlement> {
  const hash = keyHash(licenseKey);
  const rows = await sql<CheckRow>`select ok, status, checked_at from license_checks where key_hash = ${hash} and instance_id = ${instanceId}`;
  const cached = rows[0];
  if (cached) {
    const age = now - new Date(cached.checked_at).getTime();
    if (age >= 0 && age < (cached.ok ? OK_TTL_MS : NO_TTL_MS)) {
      return cached.ok ? { ok: true } : { ok: false, status: 402, reason: 'Side Pro is not active for this license.', license: cached.status };
    }
  }
  const v = await lemon.validate(licenseKey, instanceId);
  if (!v.ok && v.kind === 'unavailable') {
    // Lemon Squeezy is down: a Mac that was Pro within the last day stays Pro; nobody new gets in.
    if (cached?.ok && now - new Date(cached.checked_at).getTime() < 24 * 60 * 60_000) return { ok: true };
    return { ok: false, status: 503, reason: v.reason };
  }
  const ok = v.ok && v.license.status === 'active' && v.instanceId === instanceId;
  const status = v.ok ? v.license.status : 'invalid';
  await sql`insert into license_checks (key_hash, instance_id, ok, status, checked_at)
    values (${hash}, ${instanceId}, ${ok}, ${status}, ${new Date(now)})
    on conflict (key_hash, instance_id) do update set ok = excluded.ok, status = excluded.status, checked_at = excluded.checked_at`;
  return ok ? { ok: true } : { ok: false, status: 402, reason: v.ok ? 'Side Pro is not active for this license.' : v.reason, license: status };
}

/** Counts one request against today's limit. True while the license is within it. */
export async function spendOne(sql: SqlTag, licenseKey: string, now = Date.now()): Promise<boolean> {
  const day = new Date(now).toISOString().slice(0, 10);
  const rows = await sql<{ calls: number }>`insert into llm_usage (key_hash, day, calls) values (${keyHash(licenseKey)}, ${day}, 1)
    on conflict (key_hash, day) do update set calls = llm_usage.calls + 1
    returning calls`;
  return Number(rows[0]?.calls ?? Infinity) <= DAILY_LLM_LIMIT;
}

/** After a deactivation the cached "yes" for that Mac must not outlive it. */
export async function forget(sql: SqlTag, licenseKey: string, instanceId: string): Promise<void> {
  await sql`delete from license_checks where key_hash = ${keyHash(licenseKey)} and instance_id = ${instanceId}`;
}
