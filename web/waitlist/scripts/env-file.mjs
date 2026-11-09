// Reads KEY=value lines from an env file. Callers must never print the values.

/** @param {string} text */
export function parseEnvFile(text) {
  /** @type {Record<string, string>} */
  const env = {};
  for (const raw of text.split('\n')) {
    const line = raw.replace(/\r$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const m = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (!m) continue;
    let value = m[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[m[1]] = value;
  }
  return env;
}

/** DATABASE_URL first, then DATABASE_URI (the Director's .env.local name). Returns the name used. */
export function pickDatabaseUrl(env) {
  for (const name of ['DATABASE_URL', 'DATABASE_URI']) {
    const v = env[name];
    if (typeof v === 'string' && v.trim()) return { name, url: v.trim() };
  }
  return null;
}

/**
 * Supabase's direct connection host (db.<ref>.supabase.co) is IPv6-only and Vercel cannot reach it.
 * Returns a plain hint when the URL is that host, or null when it looks like a pooler URI.
 * @param {string} url
 */
export function poolerHint(url) {
  let host = '';
  try {
    host = new URL(url).hostname;
  } catch {
    return 'The database URL could not be parsed.';
  }
  if (/^db\.[a-z0-9]+\.supabase\.co$/i.test(host)) {
    return 'This is the direct connection (IPv6 only). Use the Transaction pooler URI from Supabase > Connect (host ends with pooler.supabase.com, port 6543).';
  }
  return null;
}

/** Hides connection URLs and Supabase host names in error text. @param {string} text */
export function redact(text) {
  return String(text)
    .replace(/postgres(ql)?:\/\/\S+/gi, '[url hidden]')
    .replace(/[a-z0-9.-]*supabase\.(co|com)/gi, '[host hidden]');
}
