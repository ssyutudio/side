// Applies sql/schema.sql to the Supabase database named in the repo's .env.local.
// Usage: node web/waitlist/scripts/migrate.mjs   (prints key names only, never values)
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import { parseEnvFile, pickDatabaseUrl, poolerHint, redact } from './env-file.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const envPath = join(here, '..', '..', '..', '.env.local');

let fileEnv = {};
try {
  fileEnv = parseEnvFile(readFileSync(envPath, 'utf8'));
} catch (e) {
  if (e && e.code !== 'ENOENT') throw e;
}
const picked = pickDatabaseUrl({ ...fileEnv, ...process.env });
if (!picked) {
  console.error('No DATABASE_URL or DATABASE_URI found in .env.local or the environment.');
  process.exit(2);
}
console.log(`Using ${picked.name} (value hidden).`);
const hint = poolerHint(picked.url);
if (hint) console.warn(`Warning: ${hint}`);

const sql = postgres(picked.url, { prepare: false, ssl: 'require', max: 1, connect_timeout: 10 });
try {
  await sql.unsafe(readFileSync(join(here, '..', 'sql', 'schema.sql'), 'utf8'));
  const [w] = await sql`select count(*)::int as n from waitlist`;
  const [u] = await sql`select count(*)::int as n from usage_counts`;
  console.log(`Schema applied. waitlist rows: ${w.n}, usage_counts rows: ${u.n}.`);
} catch (e) {
  console.error(`Migration failed: ${redact(e && e.message ? e.message : e)}`);
  if (hint) console.error(hint);
  process.exitCode = 1;
} finally {
  await sql.end({ timeout: 5 });
}
