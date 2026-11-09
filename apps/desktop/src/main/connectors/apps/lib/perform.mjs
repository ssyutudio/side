// Carries out one action. Documents are always opened through LaunchServices
// (`open -a App file`), the same as a double-click: a file that's already open just
// comes to the front, with its unsaved changes intact. Apps' own "open" scripting
// commands are never used, because Excel's, for one, offers to reload the file and
// discard changes. Scripts run only after the document is open, so when a script
// can't finish, the person has the document and is told exactly that.

import { lstat, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { run, spawnDetached } from "./exec.mjs";
import { appleScriptErrorNumber, runScript } from "./applescript.mjs";
import { isAppRunning } from "./installed.mjs";
import { withoutExtension } from "./paths.mjs";
import { say } from "./words.mjs";

const OPEN = "/usr/bin/open";
const AFPLAY = "/usr/bin/afplay";
const OPEN_TIMEOUT_MS = 6000;
// The helper gives an app action 15 s. A cold start of Excel or PowerPoint needs most of that.
const SCRIPT_DEADLINE_MS = 13_000;
const SCRIPT_TIMEOUT_MS = 5000;
const RETRY_MS = 700;
// App is still starting (-600, -609) or still loading the object (-1728, -1719).
const RETRYABLE = new Set([-600, -609, -1728, -1719]);

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function exists(path) {
  try {
    const info = await lstat(path);
    return !info.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Opens the file in that app, as a double-click would. */
async function openDocument(appPath, path) {
  return run(OPEN, ["-a", appPath, path], { timeoutMs: OPEN_TIMEOUT_MS });
}

/**
 * Runs a script until it reports done, or until there's a reason to stop.
 * Returns "ok", or the code for what went wrong.
 */
async function runUntilDone(script, argv) {
  const deadline = Date.now() + SCRIPT_DEADLINE_MS;
  while (Date.now() < deadline) {
    const result = await runScript(script, argv, { timeoutMs: Math.max(1000, Math.min(SCRIPT_TIMEOUT_MS, deadline - Date.now())) });
    if (result.ok) {
      const answer = result.stdout.trim();
      if (answer === "ok") return "ok";
      if (answer !== "not_ready" && answer !== "not_front") return "action_incomplete";
    } else {
      // A killed osascript means something is waiting on the person, usually a dialog.
      if (result.timedOut) return "automation_pending";
      const number = appleScriptErrorNumber(result.stderr);
      if (number === -1743) return "automation_denied";
      if (number === -1712) return "automation_pending";
      if (!RETRYABLE.has(number)) return "action_incomplete";
    }
    await delay(RETRY_MS);
  }
  return "action_incomplete";
}

function scriptNames(fileName) {
  return [fileName, withoutExtension(fileName)];
}

/** Opens the file, then has the app do the visible thing. Never claims more than happened. */
async function openThenScript({ appPath, path, script, tool, locale, fileName }) {
  const opened = await openDocument(appPath, path);
  if (!opened.ok) return { ok: false, did: null, tool, error: "open_failed", message: say("open_failed", locale, tool) };
  const outcome = await runUntilDone(script, scriptNames(fileName));
  if (outcome === "ok") return { ok: true, did: "ran", tool };
  return { ok: true, did: "opened", tool, error: outcome, message: say(outcome, locale, tool) };
}

async function scratchSqlFile() {
  const dir = join(tmpdir(), "side-helper");
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = join(dir, "scratch-select-1.sql");
  await writeFile(file, "SELECT 1;\n", { mode: 0o600 });
  return file;
}

function dbeaverBinary(appPath) {
  return join(appPath, "Contents", "MacOS", "dbeaver");
}

/** Opens a file through DBeaver's command line, which reaches an already running DBeaver too. */
async function dbeaverOpen(appPath, path, tool, locale) {
  const started = await spawnDetached(dbeaverBinary(appPath), ["-f", path], { watchMs: 900 });
  if (started.ok) return { ok: true, did: "opened", tool };
  const fallback = await openDocument(appPath, path);
  if (fallback.ok) return { ok: true, did: "opened", tool };
  return { ok: false, did: null, tool, error: "open_failed", message: say("open_failed", locale, tool) };
}

export function obsidianUri(path) {
  return `obsidian://open?path=${encodeURIComponent(path)}`;
}

/**
 * Performs one action. `resolved` holds what index.mjs looked up privately:
 * { adapter, action, path, look, appPaths, locale }
 */
export async function performAction({ adapter, action, path, look, appPaths, locale }) {
  const tool = actionTool(adapter, action);
  const notInstalled = { ok: false, did: null, tool, error: "app_not_installed", message: say("app_not_installed", locale, tool) };
  const moved = { ok: false, did: null, tool, error: "file_moved", message: say("file_moved", locale, tool) };
  const couldNotOpen = { ok: false, did: null, tool, error: "open_failed", message: say("open_failed", locale, tool) };

  switch (action.kind) {
    case "open": {
      const appPath = appPaths.get(adapter.id);
      if (!appPath) return notInstalled;
      if (!path || !(await exists(path))) return moved;
      if (adapter.singleDocument && (await isAppRunning(appPath))) {
        // The file isn't passed at all: opening one here could close what's open.
        const front = await run(OPEN, ["-a", appPath], { timeoutMs: OPEN_TIMEOUT_MS });
        return front.ok ? { ok: true, did: "opened", tool, error: "already_running", message: say("already_running", locale, tool) } : couldNotOpen;
      }
      const opened = await openDocument(appPath, path);
      return opened.ok ? { ok: true, did: "opened", tool } : couldNotOpen;
    }

    case "open_app": {
      const appPath = appPaths.get(adapter.id);
      if (!appPath) return notInstalled;
      const opened = await run(OPEN, ["-a", appPath], { timeoutMs: OPEN_TIMEOUT_MS });
      return opened.ok ? { ok: true, did: "opened", tool } : couldNotOpen;
    }

    case "open_uri": {
      const appPath = appPaths.get(adapter.id);
      if (!appPath) return notInstalled;
      if (!path || !(await exists(path))) return moved;
      const opened = await run(OPEN, ["-a", appPath, obsidianUri(path)], { timeoutMs: OPEN_TIMEOUT_MS });
      return opened.ok ? { ok: true, did: "opened", tool } : couldNotOpen;
    }

    case "jump": {
      const appPath = appPaths.get(adapter.id);
      if (!appPath) return notInstalled;
      if (!path || !(await exists(path))) return moved;
      return openThenScript({ appPath, path, script: action.script, tool, locale, fileName: basenameOf(path) });
    }

    case "cli_open": {
      const appPath = appPaths.get(adapter.id);
      if (!appPath) return notInstalled;
      if (!path || !(await exists(path))) return moved;
      return dbeaverOpen(appPath, path, tool, locale);
    }

    case "cli_scratch": {
      const appPath = appPaths.get(adapter.id);
      if (!appPath) return notInstalled;
      return dbeaverOpen(appPath, await scratchSqlFile(), tool, locale);
    }

    case "look_play": {
      const appPath = appPaths.get("quicktime");
      if (!appPath) return notInstalled;
      if (!look?.path || !(await exists(look.path))) return moved;
      return openThenScript({ appPath, path: look.path, script: "quicktime_play_last_ten", tool, locale, fileName: basenameOf(look.path) });
    }

    case "look_afplay": {
      if (!look?.path || !(await exists(look.path))) return moved;
      const started = await spawnDetached(AFPLAY, ["-t", "10", look.path]);
      return started.ok ? { ok: true, did: "ran", tool } : couldNotOpen;
    }

    case "look_image": {
      const appPath = appPaths.get("preview");
      if (!appPath) return notInstalled;
      if (!look?.path || !(await exists(look.path))) return moved;
      const opened = await openDocument(appPath, look.path);
      return opened.ok ? { ok: true, did: "opened", tool } : couldNotOpen;
    }

    default:
      return { ok: false, did: null, tool, error: "stale_candidate", message: say("stale_candidate", locale, tool) };
  }
}

function basenameOf(path) {
  return path.slice(path.lastIndexOf("/") + 1);
}

export function actionTool(adapter, action) {
  if (action.tool) return action.tool;
  if (action.adapter === "quicktime") return "QuickTime Player";
  if (action.adapter === "preview") return "Preview";
  return adapter.tool;
}
