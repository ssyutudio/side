// Reads secrets and settings for the main process only. Keys never reach the renderer or the extension.
import { readFileSync } from 'node:fs';

/** The model Side ships with. SIDE_LLM_MODEL may name another one, for example behind our own proxy. */
export const DEFAULT_LLM_MODEL = 'claude-opus-5-5';
/** How long one request may take before the local rules take over. SIDE_LLM_TIMEOUT_MS overrides it. */
export const DEFAULT_LLM_TIMEOUT_MS = 8000;

/** Everything the LLM transport needs, so no part of it is baked into the call. */
export interface LlmConfig {
  /** The model name sent with every request. */
  model: string;
  /** An Anthropic-compatible endpoint; null means the SDK's own address. */
  baseUrl: string | null;
  timeoutMs: number;
}

export interface AppConfig {
  anthropicKey: string | null;
  /** Supabase pooler URI. Main process only; the app normally talks to the Vercel function instead. */
  databaseUrl: string | null;
  llm: LlmConfig;
}

export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const present = (v: string | undefined): string | null => (v && v.length > 0 ? v : null);

/** A whole, positive number of milliseconds. Anything else (0, -1, "soon", "") is not a timeout. */
export function parseTimeoutMs(raw: string | null | undefined): number | null {
  const text = raw?.trim();
  if (!text) return null;
  const n = Number(text);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/** The GOAL names the variable DATABASE_URL; the Director's file uses DATABASE_URI. Accept both. */
export function resolveConfig(file: Record<string, string>, proc: Record<string, string | undefined> = {}): AppConfig {
  const pick = (k: string) => present(proc[k]) ?? present(file[k]);
  return {
    anthropicKey: pick('ANTHROPIC_API_KEY'),
    databaseUrl: pick('DATABASE_URL') ?? pick('DATABASE_URI'),
    llm: {
      model: pick('SIDE_LLM_MODEL') ?? DEFAULT_LLM_MODEL,
      baseUrl: pick('SIDE_LLM_BASE_URL'),
      timeoutMs: parseTimeoutMs(pick('SIDE_LLM_TIMEOUT_MS')) ?? DEFAULT_LLM_TIMEOUT_MS,
    },
  };
}

/** Loads .env.local if it exists. Only a missing file (ENOENT) counts as "no file". */
export function loadConfig(envPath: string, proc: Record<string, string | undefined> = process.env): AppConfig {
  let text = '';
  try {
    text = readFileSync(envPath, 'utf8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
      console.warn('[side] could not read .env.local:', (err as Error).message);
    }
  }
  return resolveConfig(parseEnvFile(text), proc);
}
