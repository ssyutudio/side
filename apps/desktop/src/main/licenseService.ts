// Side Pro on this Mac. Free Side works with simple rules and sends nothing; Side Pro sends the
// same things to Claude through Side's server, which checks the license on every request. This
// service only decides whether to ask at all, so a Mac that isn't Pro never sends a title anywhere.
//
// The key is kept sealed (macOS Keychain-backed encryption) in the data file, with the activation
// id Lemon Squeezy gave this Mac. The license is checked at launch and twice a day; if the server
// can't be reached, a Pro Mac stays Pro for OFFLINE_GRACE_MS since the last good check.
import type { JsonStore } from './store';
import type { AppData } from './appData';

export const SIDE_SERVER = 'https://side-waitlist.vercel.app';
export const LICENSE_ENDPOINT = `${SIDE_SERVER}/api/license`;
export const LLM_ENDPOINT = `${SIDE_SERVER}/api/llm`;
export const PRICING_URL = `${SIDE_SERVER}/pricing`;
/** Lemon Squeezy's customer portal: cancel, change plan, update the card, get invoices. */
export const BILLING_URL = 'https://app.lemonsqueezy.com/my-orders';

export const OFFLINE_GRACE_MS = 14 * 24 * 60 * 60_000;
export const REFRESH_EVERY_MS = 12 * 60 * 60_000;

export interface LicenseRecord {
  /** The license key, sealed by the main process. */
  sealedKey: string;
  instanceId: string;
  /** Lemon Squeezy's word: active, expired, disabled, inactive; or invalid. */
  status: string;
  plan: string | null;
  /** When the subscription renews or ends (epoch ms), if known. */
  expiresAt: number | null;
  /** Last time the server confirmed the status (epoch ms). */
  checkedAt: number;
}

export interface ProView {
  /** developer: a Claude key in .env.local (development), so the license is not used. */
  state: 'free' | 'pro' | 'ended' | 'developer';
  plan: string | null;
  renewsAt: number | null;
}

export type LicenseOutcome = { ok: true } | { ok: false; reason: 'unreachable' | 'rejected'; detail?: string };

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export interface LicenseDeps {
  store: JsonStore<AppData>;
  now: () => number;
  fetch: Fetch;
  seal: (plain: string) => string;
  unseal: (sealed: string) => string | null;
  /** True when a developer Claude key is set: Side uses it directly and the license is not needed. */
  developer?: boolean;
  endpoint?: string;
}

interface ServerReply {
  ok?: boolean;
  reason?: string;
  instanceId?: string | null;
  status?: string;
  plan?: string | null;
  expiresAt?: string | null;
}

const toMs = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};

export class LicenseService {
  constructor(private readonly deps: LicenseDeps) {}

  private get record(): LicenseRecord | null {
    return this.deps.store.get().license ?? null;
  }

  /** Side Pro is on for this Mac right now. */
  pro(): boolean {
    const r = this.record;
    return !!r && r.status === 'active' && this.deps.now() - r.checkedAt < OFFLINE_GRACE_MS;
  }

  /** What the server needs on each Claude request, only while Pro. */
  credentials(): { key: string; instanceId: string } | null {
    const r = this.record;
    if (!r || !this.pro()) return null;
    const key = this.deps.unseal(r.sealedKey);
    return key ? { key, instanceId: r.instanceId } : null;
  }

  view(): ProView {
    if (this.deps.developer) return { state: 'developer', plan: null, renewsAt: null };
    const r = this.record;
    if (!r) return { state: 'free', plan: null, renewsAt: null };
    return { state: this.pro() ? 'pro' : 'ended', plan: r.plan, renewsAt: r.expiresAt };
  }

  private async post(body: Record<string, string>): Promise<{ status: number; reply: ServerReply } | null> {
    try {
      const res = await this.deps.fetch(this.deps.endpoint ?? LICENSE_ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10_000),
      });
      return { status: res.status, reply: (await res.json().catch(() => ({}))) as ServerReply };
    } catch {
      return null;
    }
  }

  /** Uses one activation of the key for this Mac. The install id is the only thing that names this Mac. */
  async activate(rawKey: string): Promise<LicenseOutcome> {
    const key = rawKey.trim();
    const r = await this.post({ action: 'activate', licenseKey: key, instanceName: this.deps.store.get().installId });
    if (!r || r.status >= 500) return { ok: false, reason: 'unreachable' };
    if (!r.reply.ok || !r.reply.instanceId) return { ok: false, reason: 'rejected', detail: r.reply.reason };
    const record: LicenseRecord = {
      sealedKey: this.deps.seal(key),
      instanceId: r.reply.instanceId,
      status: r.reply.status ?? 'active',
      plan: r.reply.plan ?? null,
      expiresAt: toMs(r.reply.expiresAt),
      checkedAt: this.deps.now(),
    };
    await this.deps.store.update((d) => ({ ...d, license: record }));
    return { ok: true };
  }

  /** Asks the server for the current status. Unreachable: nothing changes (the grace period runs). */
  async refresh(): Promise<void> {
    const rec = this.record;
    const key = rec ? this.deps.unseal(rec.sealedKey) : null;
    if (!rec || !key) return;
    const r = await this.post({ action: 'validate', licenseKey: key, instanceId: rec.instanceId });
    if (!r || r.status >= 500) return;
    const next: Partial<LicenseRecord> = r.reply.ok
      ? { status: r.reply.status ?? 'active', plan: r.reply.plan ?? rec.plan, expiresAt: toMs(r.reply.expiresAt) }
      : { status: 'invalid' };
    await this.patch({ ...next, checkedAt: this.deps.now() });
  }

  /** The server refused a Claude request for this license (402): stop asking until it is renewed. */
  async refused(status: string | undefined): Promise<void> {
    if (!this.record) return;
    await this.patch({ status: status && status !== 'active' ? status : 'invalid', checkedAt: this.deps.now() });
  }

  /** Frees this Mac's activation and forgets the key. Forgotten here even if the server can't be reached. */
  async deactivate(): Promise<LicenseOutcome> {
    const rec = this.record;
    if (!rec) return { ok: true };
    const key = this.deps.unseal(rec.sealedKey);
    const r = key ? await this.post({ action: 'deactivate', licenseKey: key, instanceId: rec.instanceId }) : null;
    await this.deps.store.update((d) => ({ ...d, license: null }));
    if (key && (!r || r.status >= 500)) return { ok: false, reason: 'unreachable' };
    return { ok: true };
  }

  private async patch(p: Partial<LicenseRecord>): Promise<void> {
    await this.deps.store.update((d) => (d.license ? { ...d, license: { ...d.license, ...p } } : d));
  }
}
