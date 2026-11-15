// Request body validation for the waitlist and the anonymous usage counts.
// Both endpoints accept only the fields listed here; anything else is a 400.

export type Validated<T> = { ok: true; value: T } | { ok: false; status: 400; reason: string };

export interface JoinBody {
  email: string;
  consent: true;
}

export const USAGE_COUNT_FIELDS = [
  'tabsSetAside',
  'linesSetAside',
  'sidySpoke',
  'stepsShown',
  'stepsClicked',
  'stillWorking10m',
] as const;

export type UsageCountField = (typeof USAGE_COUNT_FIELDS)[number];
export type UsageBody = { installId: string } & Record<UsageCountField, number>;

/** Upper bound for any single count; real use stays far below this. */
export const MAX_COUNT = 10_000_000;

const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function bad(reason: string): { ok: false; status: 400; reason: string } {
  return { ok: false, status: 400, reason };
}

/** Accepts a parsed object or a raw JSON string; returns a plain object or an error reason. */
function asObject(body: unknown): { ok: true; obj: Record<string, unknown> } | { ok: false; reason: string } {
  let data = body;
  if (typeof body === 'string') {
    try {
      data = JSON.parse(body);
    } catch {
      return { ok: false, reason: 'The request body is not valid JSON.' };
    }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, reason: 'The request body must be a JSON object.' };
  }
  return { ok: true, obj: data as Record<string, unknown> };
}

export function validateJoin(body: unknown): Validated<JoinBody> {
  const parsed = asObject(body);
  if (!parsed.ok) return bad(parsed.reason);
  const { obj } = parsed;
  const unknown = Object.keys(obj).filter((k) => k !== 'email' && k !== 'consent');
  if (unknown.length > 0) return bad(`Unknown field: ${unknown[0]}.`);
  if (obj.consent !== true) return bad('Please tick the consent box to join.');
  if (typeof obj.email !== 'string') return bad('Please enter an email address.');
  const email = obj.email.trim().toLowerCase();
  if (email.length === 0) return bad('Please enter an email address.');
  if (email.length > 254 || !EMAIL.test(email)) return bad('That does not look like an email address.');
  return { ok: true, value: { email, consent: true } };
}

export function validateUsage(body: unknown): Validated<UsageBody> {
  const parsed = asObject(body);
  if (!parsed.ok) return bad(parsed.reason);
  const { obj } = parsed;
  const allowed = new Set<string>(['installId', ...USAGE_COUNT_FIELDS]);
  const unknown = Object.keys(obj).filter((k) => !allowed.has(k));
  if (unknown.length > 0) return bad(`Unknown field: ${unknown[0]}. Only counts are accepted.`);
  if (typeof obj.installId !== 'string' || !UUID.test(obj.installId)) return bad('installId must be a UUID.');
  const value = { installId: obj.installId.toLowerCase() } as UsageBody;
  for (const field of USAGE_COUNT_FIELDS) {
    const v = obj[field];
    if (v === undefined) {
      value[field] = 0;
      continue;
    }
    if (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > MAX_COUNT) {
      return bad(`${field} must be a whole number from 0 to ${MAX_COUNT}.`);
    }
    value[field] = v;
  }
  return { ok: true, value };
}

// ---- Side Pro: license actions and Claude requests ----

export const LICENSE_KEY = /^[A-Za-z0-9-]{8,64}$/;
export const INSTANCE_ID = /^[A-Za-z0-9-]{1,64}$/;
const URL_LIKE = /(https?:\/\/|www\.)/i;

export type LicenseBody =
  | { action: 'activate'; licenseKey: string; instanceName: string }
  | { action: 'validate' | 'deactivate'; licenseKey: string; instanceId: string };

export function validateLicense(body: unknown): Validated<LicenseBody> {
  const parsed = asObject(body);
  if (!parsed.ok) return bad(parsed.reason);
  const { obj } = parsed;
  const allowed = new Set(['action', 'licenseKey', 'instanceName', 'instanceId']);
  const unknown = Object.keys(obj).filter((k) => !allowed.has(k));
  if (unknown.length > 0) return bad(`Unknown field: ${unknown[0]}.`);
  const key = typeof obj.licenseKey === 'string' ? obj.licenseKey.trim() : '';
  if (!LICENSE_KEY.test(key)) return bad('That does not look like a license key.');
  if (obj.action === 'activate') {
    // The instance name is Side's random install id: no computer or person name is sent.
    if (typeof obj.instanceName !== 'string' || !UUID.test(obj.instanceName)) return bad('instanceName must be a UUID.');
    return { ok: true, value: { action: 'activate', licenseKey: key, instanceName: obj.instanceName.toLowerCase() } };
  }
  if (obj.action === 'validate' || obj.action === 'deactivate') {
    if (typeof obj.instanceId !== 'string' || !INSTANCE_ID.test(obj.instanceId)) return bad('instanceId is missing.');
    return { ok: true, value: { action: obj.action, licenseKey: key, instanceId: obj.instanceId } };
  }
  return bad('action must be activate, validate or deactivate.');
}

export interface LlmBody {
  system: string;
  prompt: string;
  maxTokens: number;
}

/** Limits for one Claude request through the server. */
export const LLM_LIMITS = { system: 16_000, prompt: 48_000, maxTokens: 2000 } as const;

export function validateLlm(body: unknown): Validated<LlmBody> {
  const parsed = asObject(body);
  if (!parsed.ok) return bad(parsed.reason);
  const { obj } = parsed;
  const unknown = Object.keys(obj).filter((k) => k !== 'system' && k !== 'prompt' && k !== 'maxTokens');
  if (unknown.length > 0) return bad(`Unknown field: ${unknown[0]}.`);
  if (typeof obj.system !== 'string' || obj.system.length === 0 || obj.system.length > LLM_LIMITS.system) return bad('system must be text up to 16000 characters.');
  if (typeof obj.prompt !== 'string' || obj.prompt.length === 0 || obj.prompt.length > LLM_LIMITS.prompt) return bad('prompt must be text up to 48000 characters.');
  // Side never sends web addresses; the app refuses first, and so does the server.
  if (URL_LIKE.test(obj.system) || URL_LIKE.test(obj.prompt)) return bad('Refused: the request contained a web address.');
  const maxTokens = obj.maxTokens === undefined ? LLM_LIMITS.maxTokens : obj.maxTokens;
  if (typeof maxTokens !== 'number' || !Number.isInteger(maxTokens) || maxTokens < 1 || maxTokens > LLM_LIMITS.maxTokens) return bad('maxTokens must be a whole number from 1 to 2000.');
  return { ok: true, value: { system: obj.system, prompt: obj.prompt, maxTokens } };
}
