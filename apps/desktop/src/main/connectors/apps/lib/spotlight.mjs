// Spotlight access. Queries are built only from constants in this codebase,
// never from a file name. Results come back NUL-separated, so a name containing
// a newline stays one result.

import { run } from "./exec.mjs";

const MDFIND = "/usr/bin/mdfind";
const MDLS = "/usr/bin/mdls";

/** Matching paths. An empty list when Spotlight is off, slow or unavailable. */
export async function findPaths(query, { onlyIn = [], cap = 300, timeoutMs = 4000 } = {}) {
  const args = ["-0"];
  for (const dir of onlyIn) args.push("-onlyin", dir);
  args.push(query);
  const result = await run(MDFIND, args, { timeoutMs });
  if (!result.ok && !result.timedOut) return [];
  const paths = result.stdout.split("\0").filter(Boolean);
  // A killed mdfind may have cut the last path short.
  if (result.timedOut) paths.pop();
  return paths.slice(0, cap);
}

const DATE = /^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{4})$/;

export function parseSpotlightDate(text) {
  const match = DATE.exec(String(text).trim());
  if (!match) return 0;
  const offset = `${match[3].slice(0, 3)}:${match[3].slice(3)}`;
  const ms = Date.parse(`${match[1]}T${match[2]}${offset}`);
  return Number.isNaN(ms) ? 0 : ms;
}

/** Map of path to when it was last opened. Files Spotlight has no date for are left out. */
export async function lastUsedDates(paths) {
  const out = new Map();
  if (paths.length === 0) return out;
  const result = await run(MDLS, ["-name", "kMDItemLastUsedDate", "-raw", ...paths], { timeoutMs: 3000 });
  if (!result.ok) return out;
  const values = result.stdout.split("\0");
  if (values.length !== paths.length) return out;
  paths.forEach((path, index) => {
    const ms = parseSpotlightDate(values[index]);
    if (ms) out.set(path, ms);
  });
  return out;
}

/** Spotlight query for files with these extensions touched within `days`. */
export function documentQuery(extensions, days) {
  const clauses = [];
  for (const ext of extensions) {
    // "*.key" also matches private keys and certificates, so Keynote goes by file type.
    if (ext === "key") clauses.push('kMDItemContentType == "com.apple.iwork.keynote.*"', 'kMDItemContentType == "com.apple.keynote.*"');
    else clauses.push(`kMDItemFSName == "*.${ext}"c`);
  }
  return `(${clauses.join(" || ")}) && ${recentClause(days)}`;
}

/** Spotlight query for images last saved by Photoshop. */
export function photoshopImageQuery(days) {
  return `kMDItemContentTypeTree == "public.image" && kMDItemCreator == "*Photoshop*"c && ${recentClause(days)}`;
}

export function exportsQuery(days) {
  return `kMDItemContentTypeTree == "public.audiovisual-content" && kMDItemDurationSeconds >= 3 && kMDItemFSContentChangeDate >= $time.today(-${days})`;
}

export function exportedImagesQuery(days) {
  return `kMDItemContentTypeTree == "public.image" && kMDItemIsScreenCapture != 1 && kMDItemFSContentChangeDate >= $time.today(-${days})`;
}

function recentClause(days) {
  return `(kMDItemFSContentChangeDate >= $time.today(-${days}) || kMDItemLastUsedDate >= $time.today(-${days}))`;
}
