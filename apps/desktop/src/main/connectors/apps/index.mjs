// The desktop-app adapters, as the helper sees them. See README.md.
// Nothing here runs on its own: every function does its work only when called.

import { lstat, readFile, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { adapterById, adaptersForPlatform, classifyFile, lookbackActions } from "./adapters.mjs";
import { runScript } from "./lib/applescript.mjs";
import { installedMap } from "./lib/installed.mjs";
import { actionTool, performAction } from "./lib/perform.mjs";
import { cleanName, extensionOf, fillLabel, isExcludedPath, labelName, mediaKind } from "./lib/paths.mjs";
import { documentQuery, exportedImagesQuery, exportsQuery, findPaths, lastUsedDates, photoshopImageQuery } from "./lib/spotlight.mjs";
import { say } from "./lib/words.mjs";
import { candidateId, capPerApp, makeWork, recordFor } from "./lib/work.mjs";

const CACHE_MS = 30_000;
const STALE_MS = 5 * 60_000;
const LOOKBACK_DAYS = 30;
const DOCUMENT_DAYS = 60;
const KEEP = 40;
const MAX_PER_APP = 3;
const MAX_LISTED = 200;
const MIN_IMAGE_BYTES = 50 * 1024;

let cache = null;
let refreshing = null;

export function __clearRecentCacheForTests() {
  cache = null;
  refreshing = null;
}

/** Apps Side has an adapter for and that are on this computer. */
export async function installedApps() {
  const installed = await installedMap();
  return adaptersForPlatform()
    .filter((adapter) => installed.has(adapter.id))
    .map((adapter) => ({ id: adapter.id, name: adapter.app, tool: adapter.tool }));
}

/**
 * The document in front of an app that's already running, only when asked.
 * Never launches anything: every script checks that the app is running first.
 */
export async function frontDocument(frontAppName) {
  if (typeof frontAppName !== "string" || !frontAppName) return null;
  const adapter = adaptersForPlatform().find((item) => item.front && (item.app === frontAppName || item.appFile.test(`${frontAppName}.app`)));
  if (!adapter) return null;
  const result = await runScript(adapter.front, [], { timeoutMs: 2500 });
  const name = result.ok ? cleanName(result.stdout.trim()) : "";
  return name ? { app: adapter.app, name } : null;
}

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function modifiedMs(path) {
  try {
    return (await stat(path)).mtimeMs;
  } catch {
    return 0;
  }
}

/** Newest change among a folder and the things directly inside it. */
async function newestWithin(dir) {
  const own = await modifiedMs(dir);
  const entries = (await listDir(dir)).slice(0, MAX_LISTED);
  const times = await Promise.all(entries.map((entry) => modifiedMs(join(dir, entry.name))));
  return Math.max(own, ...times, 0);
}

/** Candidates for a found path: the file must be real and not a link. */
async function fileFacts(path) {
  try {
    const info = await lstat(path);
    if (info.isSymbolicLink()) return null;
    return { mtimeMs: info.mtimeMs, size: info.size };
  } catch {
    return null;
  }
}

async function collectDocuments(adapters, installed, home) {
  const owned = adapters.filter((adapter) => installed.has(adapter.id));
  const extensions = [...new Set(owned.flatMap((adapter) => [...adapter.exts, ...(adapter.alsoOpens ?? [])]))];
  const psInstalled = owned.some((adapter) => adapter.id === "photoshop");
  const [paths, psImages] = await Promise.all([
    extensions.length ? findPaths(documentQuery(extensions, DOCUMENT_DAYS)) : [],
    psInstalled ? findPaths(photoshopImageQuery(DOCUMENT_DAYS), { cap: 60 }) : [],
  ]);

  const kept = [];
  for (const path of paths) {
    if (isExcludedPath(path, home)) continue;
    const adapterId = classifyFile(extensionOf(path), new Set(installed.keys()), owned);
    if (adapterId) kept.push({ path, adapterId });
  }
  for (const path of psImages) {
    if (!isExcludedPath(path, home) && !kept.some((item) => item.path === path)) kept.push({ path, adapterId: "photoshop" });
  }

  const facts = await Promise.all(kept.map((item) => fileFacts(item.path)));
  const real = kept.flatMap((item, index) => (facts[index] ? [{ ...item, mtimeMs: facts[index].mtimeMs }] : []));
  const used = await lastUsedDates(real.map((item) => item.path));
  return real.map((item) => ({ adapterId: item.adapterId, path: item.path, name: basename(item.path), touchedMs: Math.max(item.mtimeMs, used.get(item.path) ?? 0) }));
}

/** Apps that keep projects in their own folders, where each project is a subfolder. */
async function collectProjectFolders(adapters, installed, home) {
  const out = [];
  await Promise.all(
    adapters
      .filter((adapter) => adapter.projectsDir && installed.has(adapter.id))
      .map(async (adapter) => {
        const root = join(home, adapter.projectsDir);
        const entries = (await listDir(root)).filter((entry) => entry.isDirectory() && !entry.name.startsWith(".")).slice(0, MAX_LISTED);
        const items = await Promise.all(
          entries.map(async (entry) => {
            const dir = join(root, entry.name);
            const fileMs = await modifiedMs(join(dir, adapter.projectFile));
            // A folder without the project file isn't a project.
            if (!fileMs) return null;
            // Keyed by name; the app is what opens it, so no path is ever passed anywhere.
            return { adapterId: adapter.id, path: null, key: `${adapter.id}:${entry.name}`, name: entry.name, touchedMs: Math.max(await modifiedMs(dir), fileMs) };
          }),
        );
        const projects = items.filter(Boolean).sort((a, b) => b.touchedMs - a.touchedMs);
        out.push(...projects.slice(0, adapter.newestProjectOnly ? 1 : 3));
      }),
  );
  return out;
}

async function collectDbeaverScript(adapters, installed, home) {
  const adapter = adapters.find((item) => item.id === "dbeaver");
  if (!adapter || !installed.has("dbeaver")) return [];
  const dir = join(home, adapter.scriptsDir);
  const entries = (await listDir(dir)).filter((entry) => entry.isFile() && /\.sql$/i.test(entry.name)).slice(0, MAX_LISTED);
  const items = await Promise.all(entries.map(async (entry) => ({ adapterId: "dbeaver", path: join(dir, entry.name), name: entry.name, touchedMs: await modifiedMs(join(dir, entry.name)) })));
  items.sort((a, b) => b.touchedMs - a.touchedMs);
  return items.slice(0, 1);
}

/** Obsidian's own list of vaults says where to look; the newest note in them is the work. */
async function collectObsidian(adapters, installed, home) {
  if (!adapters.some((item) => item.id === "obsidian") || !installed.has("obsidian")) return [];
  let vaults;
  try {
    const parsed = JSON.parse(await readFile(join(home, "Library/Application Support/obsidian/obsidian.json"), "utf8"));
    vaults = Object.values(parsed?.vaults ?? {})
      .filter((vault) => typeof vault?.path === "string")
      .sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0))
      .slice(0, 3)
      .map((vault) => vault.path);
  } catch {
    return [];
  }
  if (vaults.length === 0) return [];
  const paths = await findPaths(`kMDItemFSName == "*.md"c && kMDItemFSContentChangeDate >= $time.today(-${DOCUMENT_DAYS})`, { onlyIn: vaults, cap: 100 });
  const usable = paths.filter((path) => !isExcludedPath(path, home));
  const facts = await Promise.all(usable.map((path) => fileFacts(path)));
  const items = usable.flatMap((path, index) => (facts[index] ? [{ adapterId: "obsidian", path, name: basename(path), touchedMs: facts[index].mtimeMs }] : []));
  items.sort((a, b) => b.touchedMs - a.touchedMs);
  return items.slice(0, 1);
}

/** Apps with nothing local to point at. Used only when no document of theirs was found. */
async function collectAppLevel(adapters, installed, home, existing) {
  const seen = new Set(existing.map((item) => item.adapterId));
  const out = [];
  await Promise.all(
    adapters
      .filter((adapter) => adapter.appLevel && installed.has(adapter.id) && !seen.has(adapter.id))
      .map(async (adapter) => {
        const times = await Promise.all(adapter.appLevel.map((dir) => newestWithin(join(home, dir))));
        const touchedMs = Math.max(...times);
        if (touchedMs > 0) out.push({ adapterId: adapter.id, path: null, key: `${adapter.id}:app`, name: adapter.tool, touchedMs, appLevel: true });
      }),
  );
  return out;
}

/** The newest video, audio and image someone may want to look back at. */
async function collectLookback(home, installed) {
  const out = {};
  const hasQuickTime = installed.has("quicktime");
  const hasPreview = installed.has("preview");
  const dirs = (names) => names.map((name) => join(home, name));
  const [media, images] = await Promise.all([
    hasQuickTime ? findPaths(exportsQuery(LOOKBACK_DAYS), { onlyIn: dirs(["Movies", "Music", "Desktop", "Downloads"]), cap: 120 }) : [],
    hasPreview ? findPaths(exportedImagesQuery(LOOKBACK_DAYS), { onlyIn: dirs(["Desktop", "Downloads", "Pictures"]), cap: 120 }) : [],
  ]);
  for (const path of [...media, ...images]) {
    if (isExcludedPath(path, home)) continue;
    const kind = mediaKind(path);
    if (!kind) continue;
    const facts = await fileFacts(path);
    if (!facts || (kind === "image" && facts.size < MIN_IMAGE_BYTES)) continue;
    if (!out[kind] || facts.mtimeMs > out[kind].touchedMs) out[kind] = { path, name: basename(path), media: kind, touchedMs: facts.mtimeMs };
  }
  return out;
}

async function collectAll(only) {
  const home = homedir();
  const adapters = adaptersForPlatform();
  // Side's desktop app only looks at the apps the person turned on: the others are treated as not installed.
  const all = await installedMap();
  const installed = only ? new Map([...all].filter(([id]) => only.includes(id))) : all;
  const [documents, projects, dbeaver, obsidian, looks] = await Promise.all([
    collectDocuments(adapters, installed, home),
    collectProjectFolders(adapters, installed, home),
    collectDbeaverScript(adapters, installed, home),
    collectObsidian(adapters, installed, home),
    collectLookback(home, installed),
  ]);
  const found = [...documents, ...projects, ...dbeaver, ...obsidian];
  const appLevel = await collectAppLevel(adapters, installed, home, found);

  const work = [...found, ...appLevel].map((item) => {
    const adapter = adapterById(item.adapterId);
    const look = adapter.creative ? looks[adapter.creative] : null;
    return makeWork({ ...item, lookback: look ?? null });
  });
  for (const look of Object.values(looks)) {
    const adapterId = look.media === "image" ? "preview" : "quicktime";
    work.push(makeWork({ adapterId, path: look.path, name: look.name, touchedMs: look.touchedMs, lookback: look }));
  }
  work.sort((a, b) => (Date.parse(b.touched_at) || 0) - (Date.parse(a.touched_at) || 0));
  return capPerApp(work, MAX_PER_APP).slice(0, KEEP);
}

function refresh(only = null) {
  const scope = only ? [...only].sort().join(",") : "*";
  if (cache && cache.scope !== scope) cache = null;
  if (refreshing && refreshing.scope !== scope) refreshing = null;
  refreshing ??= Object.assign(collectAll(only)
    .then((work) => {
      cache = { at: Date.now(), work, scope };
      return work;
    })
    .finally(() => {
      refreshing = null;
    }), { scope });
  return refreshing;
}

/**
 * Recent work, newest first. A scan is reused for 30 seconds. After that, a result
 * up to five minutes old is returned at once while a new scan runs. Nothing runs
 * unless this is called.
 */
export async function recentWork({ limit = 8, only = null } = {}) {
  const count = Math.max(1, Math.min(KEEP, Number(limit) || 8));
  const scope = only ? [...only].sort().join(",") : "*";
  const age = cache && cache.scope === scope ? Date.now() - cache.at : Infinity;
  if (age < CACHE_MS) return cache.work.slice(0, count);
  if (age < STALE_MS) {
    refresh(only).catch(() => {});
    return cache.work.slice(0, count);
  }
  return (await refresh(only)).slice(0, count);
}

function actionsFor(record) {
  const { adapter, path, lookback } = record;
  const own = path === null && adapter.appActions ? adapter.appActions : adapter.actions;
  // An action that needs a file is dropped when there's no file.
  const usable = own.filter((action) => path !== null || action.kind === "open_app" || action.kind === "cli_scratch");
  return [...(lookback ? lookbackActions(lookback.media) : []), ...usable];
}

/** What Side can offer for this work, smallest first. Contains no path and no internal names. */
export function appCandidates(work, { locale } = {}) {
  const record = recordFor(work);
  if (!record) return [];
  // Side is English only, so every label is the English one.
  const lang = "en";
  const values = { name: labelName(record.work.name), look: record.lookback ? labelName(record.lookback.name) : "" };
  return actionsFor(record)
    .map((action) => ({
      id: candidateId(record.work.id, action.key),
      kind: "app",
      label: fillLabel(action.label[lang], values),
      tool: actionTool(record.adapter, action),
      effect: action.effect,
      safety: "read_only",
      size: action.size,
    }))
    .sort((a, b) => a.size - b.size);
}

/** Runs one candidate. Only a work item from recentWork() and a candidate id from appCandidates() can reach anything. */
export async function performAppAction(work, id, { locale } = {}) {
  let record = recordFor(work);
  if (!record && typeof work?.id === "string") {
    // The helper may have restarted since this id was given out.
    // Same apps as the last scan, so an app the person didn't turn on is never looked at.
    await refresh(cache && cache.scope !== "*" ? cache.scope.split(",") : null).catch(() => {});
    record = recordFor(work);
  }
  if (!record) return { ok: false, did: null, tool: "", error: "stale_candidate", message: say("stale_candidate", locale) };
  const lang = locale ?? record.locale ?? "en";
  const action = actionsFor(record).find((item) => candidateId(record.work.id, item.key) === id);
  if (!action) return { ok: false, did: null, tool: record.adapter.tool, error: "stale_candidate", message: say("stale_candidate", lang) };
  return performAction({ adapter: record.adapter, action, path: record.path, look: record.lookback, appPaths: await installedMap(), locale: lang });
}
