// Real numbers for the pitch deck, read from Side's own data file on this computer (read-only).
// Usage: node scripts/deck-numbers.mjs [--url https://<project>.vercel.app]
// Writes docs/deck/numbers.json and docs/deck/numbers.js (the deck loads the .js from file://).
// Nothing is invented: counts come from confirmed records, rates carry their sample size, and a
// missing file means "no data yet". The waitlist count is fetched live only when a URL is known.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const CONFIRMED = new Set(['applied', 'partial']);

const rate = (hits, n) => ({ value: n > 0 ? hits / n : null, n });

/** Counts from the app's data file object (or null when there is no file). */
export function computeNumbers(data) {
  const setAsides = Array.isArray(data?.setAsides) ? data.setAsides : [];
  const events = Array.isArray(data?.stepEvents) ? data.stepEvents : [];
  const spokeAt = Array.isArray(data?.spokeAt) ? data.spokeAt : [];

  const confirmed = setAsides.filter((s) => CONFIRMED.has(s?.status));
  let tabsSetAside = 0;
  for (const s of confirmed) {
    const ids = new Set();
    if (s.result) {
      for (const g of s.result.grouped ?? []) for (const id of g.tabIds ?? []) ids.add(id);
      for (const id of s.result.closed ?? []) ids.add(id);
    } else {
      for (const t of s.tabs ?? []) ids.add(t.tabId);
    }
    tabsSetAside += ids.size;
  }
  const linesSetAside = confirmed.filter((s) => typeof s.userLine === 'string' && s.userLine.trim()).length;

  const shown = events.filter((e) => e?.shownAt != null).length;
  const clicked = events.filter((e) => e?.clickedAt != null).length;
  const judged = events.filter((e) => e?.stillWorkingAt10m === true || e?.stillWorkingAt10m === false).length;
  const still = events.filter((e) => e?.stillWorkingAt10m === true).length;

  const wrapUps = confirmed.length;
  return {
    users: 1,
    wrapUps,
    tabsSetAside,
    linesSetAside,
    broughtBackWithUndo: setAsides.filter((s) => s?.status === 'undone').length,
    sidySpoke: spokeAt.length,
    stepsShown: shown,
    stepsClicked: clicked,
    clickRate: rate(clicked, shown),
    stillWorking10m: still,
    stillWorkingRate: rate(still, judged),
    hasData: wrapUps > 0 || spokeAt.length > 0 || shown > 0,
  };
}

/** The waitlist origin from the app's usage endpoint constant, once it is deployed. */
export function waitlistUrlFrom(usageSource) {
  const m = /USAGE_ENDPOINT[^=]*=\s*['"](https:\/\/[^'"]+)['"]/.exec(usageSource ?? '');
  if (!m) return null;
  try {
    return new URL(m[1]).origin;
  } catch {
    return null;
  }
}

export function writeNumbers(dir, numbers) {
  mkdirSync(dir, { recursive: true });
  const json = JSON.stringify(numbers, null, 2);
  writeFileSync(join(dir, 'numbers.json'), json + '\n');
  writeFileSync(join(dir, 'numbers.js'), `window.SIDE_NUMBERS = ${json};\n`);
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    if (err && err.code === 'ENOENT') return null;
    throw err;
  }
}

function readText(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    if (err && err.code === 'ENOENT') return '';
    throw err;
  }
}

async function waitlistCount(url) {
  try {
    const res = await fetch(new URL('/api/join', url), { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return null;
    const body = await res.json();
    return Number.isInteger(body?.count) ? body.count : null;
  } catch {
    return null;
  }
}

async function main() {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const dataPath = join(homedir(), 'Library', 'Application Support', 'Side', 'side-data.json');
  const numbers = computeNumbers(readJson(dataPath));

  const argUrl = process.argv.includes('--url') ? process.argv[process.argv.indexOf('--url') + 1] : null;
  const fileUrl = readText(join(root, 'docs', 'assets', 'waitlist-url.txt')).trim() || null;
  const codeUrl = waitlistUrlFrom(readText(join(root, 'apps', 'desktop', 'src', 'main', 'usageUpload.ts')));
  const url = argUrl || fileUrl || codeUrl;

  const out = {
    ...numbers,
    generatedAt: new Date().toISOString(),
    waitlistUrl: url,
    waitlistCount: url ? await waitlistCount(url) : null,
  };
  writeNumbers(join(root, 'docs', 'deck'), out);
  console.log(JSON.stringify(out, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(String(e?.message ?? e));
    process.exit(1);
  });
}
