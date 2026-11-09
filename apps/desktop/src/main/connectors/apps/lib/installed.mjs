// Which apps are on this Mac, by looking at the application folders. Spotlight
// isn't needed for this and can be off. Adobe, Blackmagic and Setapp keep apps
// one folder down, so one level of subfolders is read as well.

import { readdir } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { adaptersForPlatform } from "../adapters.mjs";
import { run } from "./exec.mjs";

const CACHE_MS = 30_000;

let cache = null;
let override = null;

/** Test seam: { adapterId: "/path/to/App.app" }. */
export function __setInstalledForTests(map) {
  override = map ? new Map(Object.entries(map)) : null;
  cache = null;
}

async function listDir(dir) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
}

async function appBundles() {
  const roots = ["/Applications", join(homedir(), "Applications"), "/System/Applications", "/System/Applications/Utilities"];
  const found = [];
  await Promise.all(
    roots.map(async (root) => {
      for (const entry of await listDir(root)) {
        if (entry.name.endsWith(".app")) {
          found.push({ file: entry.name, path: join(root, entry.name) });
        } else if (entry.isDirectory() && !entry.name.startsWith(".")) {
          for (const inner of await listDir(join(root, entry.name))) {
            if (inner.name.endsWith(".app")) found.push({ file: inner.name, path: join(root, entry.name, inner.name) });
          }
        }
      }
    }),
  );
  return found;
}

/** Map of adapter id to the app's path. When several versions exist, the newest name wins. */
export async function installedMap() {
  if (override) return override;
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.map;
  const bundles = await appBundles();
  const map = new Map();
  for (const adapter of adaptersForPlatform()) {
    const matches = bundles.filter((bundle) => adapter.appFile.test(bundle.file)).sort((a, b) => b.file.localeCompare(a.file, "en", { numeric: true }));
    if (matches.length) map.set(adapter.id, matches[0].path);
  }
  cache = { at: Date.now(), map };
  return map;
}

/** Whether the app at this path has a running process. Asks nothing of the app. */
export async function isAppRunning(appPath) {
  const result = await run("/bin/ps", ["-axo", "comm="], { timeoutMs: 2000 });
  return result.stdout.split("\n").some((line) => line.startsWith(`${appPath}/Contents/MacOS/`));
}
