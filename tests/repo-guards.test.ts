// Repository guards: product sources stay English-only and secrets never get tracked.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { execSync } from 'node:child_process';

const ROOT = join(__dirname, '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git', '.war-room-state', '.claude', '.vercel']);
const EXTENSIONS = ['.ts', '.tsx', '.html', '.css', '.json', '.md', '.mjs', '.sql'];

function walk(dir: string, found: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, found);
    else if (EXTENSIONS.some((ext) => name.endsWith(ext))) found.push(full);
  }
  return found;
}

// Counts Hangul syllables (U+AC00 to U+D7A3) by code point, so a missing grep flag cannot fake a zero.
export function countHangul(text: string): number {
  let n = 0;
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if (cp >= 0xac00 && cp <= 0xd7a3) n++;
  }
  return n;
}

describe('repo guards', () => {
  it('counts Hangul syllables by code point', () => {
    expect(countHangul('abc')).toBe(0);
    expect(countHangul(String.fromCodePoint(0xac00, 0xd7a3) + 'x')).toBe(2);
  });

  it('has zero Hangul characters in product sources', () => {
    const offenders = walk(ROOT)
      .map((f) => ({ f: relative(ROOT, f), n: countHangul(readFileSync(f, 'utf8')) }))
      .filter((x) => x.n > 0);
    expect(offenders).toEqual([]);
  });

  it('never tracks .env.local', () => {
    const tracked = execSync('git ls-files', { cwd: ROOT, encoding: 'utf8' });
    expect(tracked.split('\n').filter((l) => l.includes('env.local'))).toEqual([]);
  });
});
