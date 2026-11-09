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
