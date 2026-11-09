// Postgres client for the Vercel functions. Supabase's transaction pooler does not
// support prepared statements, so they are turned off. The URL is never logged.
import postgres from 'postgres';

/** The small slice of postgres.js the handlers use, so tests can pass a fake. */
export type SqlTag = <T = Record<string, unknown>>(strings: TemplateStringsArray, ...values: unknown[]) => Promise<T[]>;

type Env = Record<string, string | undefined>;

/** DATABASE_URL first (the documented name), then DATABASE_URI (the name in the Director's .env.local). */
export function databaseUrl(env: Env): string | null {
  for (const name of ['DATABASE_URL', 'DATABASE_URI']) {
    const v = env[name];
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

export function connectionOptions() {
  return { prepare: false, ssl: 'require' as const, max: 1, idle_timeout: 20, connect_timeout: 10 };
}

let cached: SqlTag | null = null;

/** Lazily creates one client per function instance. postgres.js connects on first query. */
export function getSql(env: Env = process.env): SqlTag {
  if (cached) return cached;
  const url = databaseUrl(env);
  if (!url) throw new Error('Database is not configured.');
  cached = postgres(url, connectionOptions()) as unknown as SqlTag;
  return cached;
}

export function resetSqlForTests(): void {
  cached = null;
}
