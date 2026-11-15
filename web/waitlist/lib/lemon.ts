// Lemon Squeezy License API (public, no API key): activate, validate and deactivate a license key
// on one Mac. Lemon Squeezy is the merchant of record and owns subscriptions; a subscription's
// license key turns "expired" or "disabled" when the subscription ends, so validate is the only
// source of truth Side needs. Every answer is checked against our store and product: without that,
// any Lemon Squeezy key from any other store would validate.

export type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

const API = 'https://api.lemonsqueezy.com/v1/licenses';

export interface LemonConfig {
  storeId: number;
  productId: number;
}

type Env = Record<string, string | undefined>;

/** LEMONSQUEEZY_STORE_ID and LEMONSQUEEZY_PRODUCT_ID (one product; monthly and yearly are its variants). */
export function lemonConfig(env: Env): LemonConfig | null {
  const storeId = Number(env.LEMONSQUEEZY_STORE_ID);
  const productId = Number(env.LEMONSQUEEZY_PRODUCT_ID);
  if (!Number.isInteger(storeId) || storeId <= 0 || !Number.isInteger(productId) || productId <= 0) return null;
  return { storeId, productId };
}

/** What Side keeps about a license. No customer name or email leaves this module. */
export interface LicenseInfo {
  /** active | inactive | expired | disabled (Lemon Squeezy's words). */
  status: string;
  expiresAt: string | null;
  /** The variant name, e.g. "Monthly" or "Yearly". */
  plan: string | null;
}

export type LemonOutcome =
  | { ok: true; license: LicenseInfo; instanceId: string | null }
  | { ok: false; kind: 'rejected' | 'unavailable'; reason: string };

interface LemonReply {
  valid?: boolean;
  activated?: boolean;
  deactivated?: boolean;
  error?: string | null;
  license_key?: { status?: string; expires_at?: string | null } | null;
  instance?: { id?: string } | null;
  meta?: { store_id?: number; product_id?: number; variant_name?: string } | null;
}

const NOT_OURS = 'This license key is not for Side.';

async function call(fetchFn: Fetch, path: string, form: Record<string, string>): Promise<{ status: number; body: LemonReply } | null> {
  try {
    const res = await fetchFn(`${API}/${path}`, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(6000),
    });
    return { status: res.status, body: (await res.json().catch(() => ({}))) as LemonReply };
  } catch {
    return null;
  }
}

function info(body: LemonReply): LicenseInfo {
  return {
    status: String(body.license_key?.status ?? 'inactive'),
    expiresAt: body.license_key?.expires_at ?? null,
    plan: body.meta?.variant_name ?? null,
  };
}

function ours(cfg: LemonConfig, body: LemonReply): boolean {
  return body.meta?.store_id === cfg.storeId && body.meta?.product_id === cfg.productId;
}

export function createLemon(cfg: LemonConfig, fetchFn: Fetch) {
  return {
    /** Checks a key (and, with an instance id, that this Mac is one of its activations). */
    async validate(licenseKey: string, instanceId?: string): Promise<LemonOutcome> {
      const r = await call(fetchFn, 'validate', instanceId ? { license_key: licenseKey, instance_id: instanceId } : { license_key: licenseKey });
      if (!r || r.status >= 500) return { ok: false, kind: 'unavailable', reason: 'The license service is not reachable right now.' };
      if (r.body.meta && !ours(cfg, r.body)) return { ok: false, kind: 'rejected', reason: NOT_OURS };
      if (!r.body.valid) return { ok: false, kind: 'rejected', reason: r.body.error || 'This license key is not valid.' };
      return { ok: true, license: info(r.body), instanceId: r.body.instance?.id ?? null };
    },

    /** Uses one activation of the key for this Mac. Checks the key is ours before spending one. */
    async activate(licenseKey: string, instanceName: string): Promise<LemonOutcome> {
      const check = await this.validate(licenseKey);
      if (!check.ok) return check;
      if (check.license.status === 'expired' || check.license.status === 'disabled') {
        return { ok: false, kind: 'rejected', reason: 'This subscription has ended. Renew it to use Side Pro again.' };
      }
      const r = await call(fetchFn, 'activate', { license_key: licenseKey, instance_name: instanceName });
      if (!r || r.status >= 500) return { ok: false, kind: 'unavailable', reason: 'The license service is not reachable right now.' };
      if (!r.body.activated || !r.body.instance?.id) return { ok: false, kind: 'rejected', reason: r.body.error || 'This license key could not be activated.' };
      return { ok: true, license: info(r.body), instanceId: r.body.instance.id };
    },

    /** Frees this Mac's activation so the key can be used on another one. */
    async deactivate(licenseKey: string, instanceId: string): Promise<{ ok: boolean; reason?: string }> {
      const check = await this.validate(licenseKey);
      if (!check.ok && check.reason === NOT_OURS) return { ok: false, reason: NOT_OURS };
      const r = await call(fetchFn, 'deactivate', { license_key: licenseKey, instance_id: instanceId });
      if (!r || r.status >= 500) return { ok: false, reason: 'The license service is not reachable right now.' };
      return r.body.deactivated ? { ok: true } : { ok: false, reason: r.body.error || 'This Mac could not be signed out of the license.' };
    },
  };
}

export type Lemon = ReturnType<typeof createLemon>;
