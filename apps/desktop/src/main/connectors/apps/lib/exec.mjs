// The only place in helper/apps that starts a process. There is no shell here:
// every program gets its arguments as an array, and every call has a timeout,
// because a dialog in another app can otherwise block AppleScript forever.

import { execFile as nodeExecFile, spawn as nodeSpawn } from "node:child_process";

let execFileImpl = nodeExecFile;
let spawnImpl = nodeSpawn;

/** Test seam. Called with no argument, it restores the real functions. */
export function __setProcessForTests({ execFile, spawn } = {}) {
  execFileImpl = execFile ?? nodeExecFile;
  spawnImpl = spawn ?? nodeSpawn;
}

/** Runs a program and always resolves. `timedOut` means it was killed at the deadline. */
export function run(file, args, { timeoutMs = 4000, maxBuffer = 8 * 1024 * 1024 } = {}) {
  return new Promise((resolve) => {
    try {
      execFileImpl(file, args, { timeout: timeoutMs, killSignal: "SIGKILL", maxBuffer, shell: false, windowsHide: true, encoding: "utf8" }, (error, stdout = "", stderr = "") => {
        resolve({
          ok: !error,
          code: !error ? 0 : typeof error.code === "number" ? error.code : null,
          timedOut: Boolean(error?.killed),
          stdout: String(stdout),
          stderr: String(stderr),
        });
      });
    } catch {
      resolve({ ok: false, code: null, timedOut: false, stdout: "", stderr: "" });
    }
  });
}

/**
 * Starts a program that keeps running after this returns, such as a short audio
 * preview or an app's own command-line entry. Resolves once it has failed or has
 * survived `watchMs`.
 */
export function spawnDetached(file, args, { watchMs = 500 } = {}) {
  return new Promise((resolve) => {
    let settled = false;
    let timer = null;
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve({ ok });
    };
    let child;
    try {
      child = spawnImpl(file, args, { detached: true, stdio: "ignore", shell: false, windowsHide: true });
    } catch {
      finish(false);
      return;
    }
    timer = setTimeout(() => finish(true), watchMs);
    child.on("error", () => finish(false));
    child.on("exit", (code) => finish(code === 0));
    child.unref();
  });
}
