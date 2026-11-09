import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { ADAPTERS } from "./adapters.mjs";
import { appCandidates, frontDocument, performAppAction } from "./index.mjs";
import { SCRIPTS, appleScriptErrorNumber, runScript } from "./lib/applescript.mjs";
import { __setProcessForTests, run } from "./lib/exec.mjs";
import { __setInstalledForTests } from "./lib/installed.mjs";
import { obsidianUri } from "./lib/perform.mjs";
import { __clearWorkForTests, makeWork } from "./lib/work.mjs";

const HOSTILE_NAMES = [
  'quo"te.xlsx',
  "apos'trophe.xlsx",
  "back`whoami`tick.xlsx",
  "$(touch pwned).xlsx",
  "new\nline.xlsx",
  'end run" & (do shell script "id") & ".xlsx',
  "\uD55C\uAE00 \uD30C\uC77C 🎬.xlsx",
  "-e.xlsx",
];

const APPS = {
  excel: "/Applications/Microsoft Excel.app",
  powerpoint: "/Applications/Microsoft PowerPoint.app",
  obsidian: "/Applications/Obsidian.app",
  dbeaver: "/Applications/DBeaver.app",
  capcut: "/Applications/CapCut.app",
  lightroom_classic: "/Applications/Adobe Lightroom Classic/Adobe Lightroom Classic.app",
  after_effects: "/Applications/Adobe After Effects 2026/Adobe After Effects 2026.app",
  quicktime: "/System/Applications/QuickTime Player.app",
  preview: "/System/Applications/Preview.app",
};

let dir;
let calls;

function fakeProcesses(handler) {
  calls = [];
  __setProcessForTests({
    execFile(file, args, options, callback) {
      calls.push({ file, args, options });
      const result = handler(file, args) ?? {};
      setImmediate(() => callback(result.error ?? null, result.stdout ?? "", result.stderr ?? ""));
    },
  });
}

const replyOk = (file) => (file.endsWith("osascript") ? { stdout: "ok\n" } : {});
const scriptCalls = () => calls.filter((call) => call.file.endsWith("osascript"));
const openCalls = () => calls.filter((call) => call.file.endsWith("/open"));

function realFile(name) {
  const path = join(dir, name);
  writeFileSync(path, "x");
  return path;
}

function candidateFor(work, size) {
  return appCandidates(work).find((candidate) => candidate.size === size);
}

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "side-apps-test-"));
});

afterAll(() => {
  rmSync(dir, { recursive: true, force: true });
});

beforeEach(() => {
  __clearWorkForTests();
  __setInstalledForTests(APPS);
});

afterEach(() => {
  __setProcessForTests();
  __setInstalledForTests(null);
});

describe("the fixed scripts", () => {
  const names = Object.keys(SCRIPTS);

  it.each(names)("%s starts with on run argv", (name) => {
    expect(SCRIPTS[name].startsWith("on run argv")).toBe(true);
    expect(SCRIPTS[name].trimEnd().endsWith("end run")).toBe(true);
  });

  it.each(names)("%s has a time limit on what it asks of the app", (name) => {
    expect(SCRIPTS[name]).toMatch(/with timeout of \d+ seconds/);
  });

  it.each(names)("%s can't save, close, quit, export, change text, or reach a shell", (name) => {
    const forbidden = /\b(save|saving|close|quit|delete|revert|export|duplicate|make new|do shell script|do script|do javascript|do visual basic|run VB macro|System Events|keystroke|key code|clipboard|set value|set formula|set content)\b/i;
    expect(SCRIPTS[name]).not.toMatch(forbidden);
  });

  it.each(names)("%s is plain text with nothing to substitute", (name) => {
    expect(SCRIPTS[name]).not.toContain("${");
    expect(/^[\x09\x0a\x20-\x7e]*$/.test(SCRIPTS[name])).toBe(true);
  });

  it("front-document scripts never start an app", () => {
    for (const name of names.filter((item) => item.endsWith("_front"))) expect(SCRIPTS[name]).toMatch(/is running then/);
  });

  it("the slide show doesn't change the presentation's settings", () => {
    expect(SCRIPTS.powerpoint_play_last_slide).not.toMatch(/set (starting slide|ending slide|range type)/);
  });

  it("refuses a script that isn't on the list", () => {
    expect(() => runScript("tell application \"Finder\" to quit")).toThrow();
  });

  it("every script an adapter names exists", () => {
    for (const adapter of ADAPTERS) {
      for (const action of adapter.actions) if (action.script) expect(Object.hasOwn(SCRIPTS, action.script), action.script).toBe(true);
      if (adapter.front) expect(Object.hasOwn(SCRIPTS, adapter.front), adapter.front).toBe(true);
    }
  });

  it("nothing is marked verified that shouldn't be guessed at: every adapter says", () => {
    for (const adapter of ADAPTERS) expect(typeof adapter.verified, adapter.id).toBe("boolean");
  });

  it("every adapter declares its platform", () => {
    for (const adapter of ADAPTERS) expect(adapter.platform, adapter.id).toBe("darwin");
  });
});

describe("hostile file names", () => {
  it.each(HOSTILE_NAMES)("%j reaches osascript and open only as a separate argument", async (name) => {
    fakeProcesses(replyOk);
    const path = realFile(name);
    const work = makeWork({ adapterId: "excel", path, name, touchedMs: 1 });
    const result = await performAppAction(work, candidateFor(work, 1).id);
    expect(result).toEqual({ ok: true, did: "ran", tool: "Excel" });

    for (const call of calls) expect(call.options.shell).toBe(false);
    const [open] = openCalls();
    expect(open.args).toEqual(["-a", APPS.excel, path]);

    const [script] = scriptCalls();
    expect(script.args[0]).toBe("-e");
    expect(script.args[1]).toBe(SCRIPTS.excel_jump_last_cell);
    expect(script.args[2]).toBe("--");
    expect(script.args[3]).toBe(name);
    expect(script.args[1]).not.toContain(name);
  });

  it.runIf(process.platform === "darwin").each(HOSTILE_NAMES)("%j survives a real osascript intact", async (name) => {
    const echo = "on run argv\nreturn item 1 of argv\nend run";
    const result = await run("/usr/bin/osascript", ["-e", echo, "--", name], { timeoutMs: 4000 });
    expect(result.ok).toBe(true);
    expect(result.stdout.replace(/\n$/, "")).toBe(name);
  });

  it("encodes a hostile name in Obsidian's address", () => {
    const uri = obsidianUri("/vault/a b&c=d#\"`$(x)\n.md");
    expect(uri.startsWith("obsidian://open?path=")).toBe(true);
    expect(uri).not.toMatch(/[ "`$\n&#](?!.*path=)/);
    expect(decodeURIComponent(uri.split("path=")[1])).toBe("/vault/a b&c=d#\"`$(x)\n.md");
  });
});

describe("only what the helper produced can run", () => {
  it("refuses a forged work item without starting anything", async () => {
    fakeProcesses(replyOk);
    __setInstalledForTests({});
    const result = await performAppAction({ id: "doc-forged", path: "/etc/passwd", tool: "Excel" }, "app-anything");
    expect(result.ok).toBe(false);
    expect(result.did).toBeNull();
    expect(openCalls()).toHaveLength(0);
    expect(scriptCalls()).toHaveLength(0);
  });

  it("uses its own record of the path, whatever the caller's object says", async () => {
    fakeProcesses(replyOk);
    const path = realFile("real.xlsx");
    const work = makeWork({ adapterId: "excel", path, name: "real.xlsx", touchedMs: 1 });
    await performAppAction({ id: work.id, path: "/etc/passwd" }, candidateFor(work, 3).id);
    expect(openCalls()[0].args).toEqual(["-a", APPS.excel, path]);
  });

  it("refuses a candidate id that belongs to something else", async () => {
    fakeProcesses(replyOk);
    const work = makeWork({ adapterId: "excel", path: realFile("a.xlsx"), name: "a.xlsx", touchedMs: 1 });
    const result = await performAppAction(work, "app-0000000000000000");
    expect(result).toMatchObject({ ok: false, did: null, error: "stale_candidate" });
    expect(calls).toHaveLength(0);
  });
});

describe("what comes back is what happened", () => {
  const excelWork = () => makeWork({ adapterId: "excel", path: realFile("book.xlsx"), name: "book.xlsx", touchedMs: 1 });

  it("reports opened for a plain open", async () => {
    fakeProcesses(replyOk);
    const work = excelWork();
    expect(await performAppAction(work, candidateFor(work, 3).id)).toEqual({ ok: true, did: "opened", tool: "Excel" });
    expect(scriptCalls()).toHaveLength(0);
  });

  it("waits for a document that's still loading", async () => {
    let tries = 0;
    fakeProcesses((file) => (file.endsWith("osascript") ? { stdout: tries++ === 0 ? "not_ready\n" : "ok\n" } : {}));
    const work = excelWork();
    expect(await performAppAction(work, candidateFor(work, 1).id)).toEqual({ ok: true, did: "ran", tool: "Excel" });
    expect(tries).toBe(2);
  });

  it("says where to allow it when Automation is denied, and doesn't claim the jump", async () => {
    fakeProcesses((file) => (file.endsWith("osascript") ? { error: { code: 1 }, stderr: "execution error: Not authorized to send Apple events to Microsoft Excel. (-1743)\n" } : {}));
    const work = excelWork();
    appCandidates(work, { locale: "en" });
    const result = await performAppAction(work, candidateFor(work, 1).id);
    expect(result).toMatchObject({ ok: true, did: "opened", tool: "Excel", error: "automation_denied" });
    expect(result.message).toContain("Privacy & Security > Automation");
    expect(scriptCalls()).toHaveLength(1);
  });

  it("gives up on a blocked dialog and reports only the open", async () => {
    fakeProcesses((file) => (file.endsWith("osascript") ? { error: { killed: true, code: null, signal: "SIGKILL" } } : {}));
    const work = excelWork();
    expect(await performAppAction(work, candidateFor(work, 1).id)).toMatchObject({ ok: true, did: "opened", error: "automation_pending" });
    expect(scriptCalls()).toHaveLength(1);
  });

  it("reports only the open when the script can't compile against this version", async () => {
    fakeProcesses((file) => (file.endsWith("osascript") ? { error: { code: 1 }, stderr: "syntax error: Expected end of line. (-2741)" } : {}));
    const work = excelWork();
    expect(await performAppAction(work, candidateFor(work, 1).id)).toMatchObject({ ok: true, did: "opened", error: "action_incomplete" });
  });

  it("doesn't touch the app if the file has moved", async () => {
    fakeProcesses(replyOk);
    const work = makeWork({ adapterId: "excel", path: join(dir, "gone.xlsx"), name: "gone.xlsx", touchedMs: 1 });
    const result = await performAppAction(work, candidateFor(work, 1).id);
    expect(result).toMatchObject({ ok: false, did: null, error: "file_moved" });
    expect(calls).toHaveLength(0);
  });

  it("says so when the app isn't installed", async () => {
    fakeProcesses(replyOk);
    __setInstalledForTests({});
    const work = excelWork();
    const result = await performAppAction(work, candidateFor(work, 1).id);
    expect(result).toMatchObject({ ok: false, did: null, error: "app_not_installed" });
    expect(calls).toHaveLength(0);
  });

  it("reports a failure to open", async () => {
    fakeProcesses((file) => (file.endsWith("/open") ? { error: { code: 1 } } : {}));
    const work = excelWork();
    expect(await performAppAction(work, candidateFor(work, 3).id)).toMatchObject({ ok: false, did: null, error: "open_failed" });
  });

  it("carries no path in any result", async () => {
    fakeProcesses((file) => (file.endsWith("osascript") ? { error: { code: 1 }, stderr: "(-1743)" } : {}));
    const work = excelWork();
    const result = await performAppAction(work, candidateFor(work, 1).id);
    expect(JSON.stringify(result)).not.toContain(dir);
  });
});

describe("unsaved work is safe", () => {
  it("never passes a file to a one-project app that's already running", async () => {
    const running = `${APPS.after_effects}/Contents/MacOS/After Effects`;
    fakeProcesses((file) => (file === "/bin/ps" ? { stdout: `/usr/sbin/cron\n${running}\n` } : {}));
    const path = realFile("film.aep");
    const work = makeWork({ adapterId: "after_effects", path, name: "film.aep", touchedMs: 1 });
    const result = await performAppAction(work, candidateFor(work, 3).id);
    expect(openCalls()[0].args).toEqual(["-a", APPS.after_effects]);
    expect(result).toMatchObject({ ok: true, did: "opened", error: "already_running" });
    expect(result.message).toContain("After Effects");
  });

  it("opens the file when that app isn't running", async () => {
    fakeProcesses((file) => (file === "/bin/ps" ? { stdout: "/usr/sbin/cron\n" } : {}));
    const path = realFile("other.aep");
    const work = makeWork({ adapterId: "after_effects", path, name: "other.aep", touchedMs: 1 });
    await performAppAction(work, candidateFor(work, 3).id);
    expect(openCalls()[0].args).toEqual(["-a", APPS.after_effects, path]);
  });

  it("never gives Lightroom Classic a catalog", async () => {
    fakeProcesses(replyOk);
    const path = realFile("cat.lrcat");
    const work = makeWork({ adapterId: "lightroom_classic", path, name: "cat.lrcat", touchedMs: 1 });
    await performAppAction(work, candidateFor(work, 3).id);
    expect(openCalls()[0].args).toEqual(["-a", APPS.lightroom_classic]);
  });

  it("never gives CapCut a path", async () => {
    fakeProcesses(replyOk);
    const work = makeWork({ adapterId: "capcut", path: null, key: "capcut:x", name: "x", touchedMs: 1 });
    await performAppAction(work, candidateFor(work, 3).id);
    expect(openCalls()[0].args).toEqual(["-a", APPS.capcut]);
  });

  it("uses open for documents rather than the app's own open command", () => {
    for (const [name, text] of Object.entries(SCRIPTS)) expect(text, name).not.toMatch(/\bopen\b/);
  });
});

describe("frontDocument", () => {
  it("returns the app and the name only", async () => {
    fakeProcesses(() => ({ stdout: "budget.xlsx\n" }));
    expect(await frontDocument("Microsoft Excel")).toEqual({ app: "Microsoft Excel", name: "budget.xlsx" });
  });

  it("is null for an app that can't say, without asking it anything", async () => {
    fakeProcesses(() => ({}));
    expect(await frontDocument("CapCut")).toBeNull();
    expect(calls).toHaveLength(0);
  });

  it("is null when the app has nothing open or refuses", async () => {
    fakeProcesses(() => ({ stdout: "\n" }));
    expect(await frontDocument("Microsoft Excel")).toBeNull();
    fakeProcesses(() => ({ error: { code: 1 }, stderr: "(-1743)" }));
    expect(await frontDocument("Microsoft Excel")).toBeNull();
  });
});

describe("error numbers", () => {
  it("reads the number osascript reports", () => {
    expect(appleScriptErrorNumber("execution error: Not authorized. (-1743)\n")).toBe(-1743);
    expect(appleScriptErrorNumber("nothing here")).toBeNull();
  });
});
