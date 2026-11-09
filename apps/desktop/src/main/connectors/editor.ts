// Opening a folder or a file at a line in a code editor (K2 · K4), the way side-service's helper does
// it (helper/tools.mjs detectEditor, helper/terminal.mjs openFile): the editor's own command-line
// entry with fixed arguments, through execFile and never a shell. Cursor or VS Code: whichever is in
// front most recently, else whichever is installed. Opening never runs anything in the folder.
import { execFile } from 'node:child_process';
import { accessSync, constants } from 'node:fs';
import { lstat } from 'node:fs/promises';
import { homedir } from 'node:os';
import { delimiter, isAbsolute, join } from 'node:path';

export interface Editor {
  name: 'Cursor' | 'VS Code';
  bin: string;
}

export interface OpenResult {
  ok: boolean;
  tool: string;
  error?: 'no_editor' | 'gone' | 'refused' | 'open_failed';
}

type Exec = (file: string, args: string[], timeoutMs: number) => Promise<{ ok: boolean; stdout: string }>;

const realExec: Exec = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    try {
      execFile(file, args, { timeout: timeoutMs, encoding: 'utf8', shell: false, maxBuffer: 1024 * 1024 }, (err, stdout) => resolve({ ok: !err, stdout: String(stdout ?? '') }));
    } catch {
      resolve({ ok: false, stdout: '' });
    }
  });

// An app opened from Finder gets a minimal PATH.
const USUAL_PLACES = '/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin';
const BUNDLE_CLI = { Cursor: 'Cursor.app/Contents/Resources/app/bin/cursor', 'VS Code': 'Visual Studio Code.app/Contents/Resources/app/bin/code' } as const;
const COMMAND = { Cursor: 'cursor', 'VS Code': 'code' } as const;

function executable(path: string): boolean {
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

export function cliFor(name: Editor['name'], env: NodeJS.ProcessEnv = process.env, isExec = executable): string | null {
  for (const dir of `${env.PATH ?? ''}${delimiter}${USUAL_PLACES}`.split(delimiter)) {
    if (dir && isExec(join(dir, COMMAND[name]))) return join(dir, COMMAND[name]);
  }
  for (const root of ['/Applications', join(homedir(), 'Applications')]) {
    if (isExec(join(root, BUNDLE_CLI[name]))) return join(root, BUNDLE_CLI[name]);
  }
  return null;
}

/** The editor to use: the one nearest the front among visible apps, else Cursor, else VS Code. */
export function pickEditor(visible: readonly string[], find: (n: Editor['name']) => string | null = (n) => cliFor(n)): Editor | null {
  for (const app of visible) {
    const name = app === 'Cursor' ? 'Cursor' : app === 'Code' || app === 'Visual Studio Code' ? 'VS Code' : null;
    const bin = name ? find(name) : null;
    if (name && bin) return { name, bin };
  }
  for (const name of ['Cursor', 'VS Code'] as const) {
    const bin = find(name);
    if (bin) return { name, bin };
  }
  return null;
}

/** Visible apps, front to back (needs no macOS permission). */
export async function visibleApps(exec: Exec = realExec): Promise<string[]> {
  const r = await exec('/usr/bin/lsappinfo', ['visibleProcessList'], 800);
  return [...r.stdout.matchAll(/ASN:0x[0-9a-f]+-0x[0-9a-f]+-"([^"]*)":/gi)].map((m) => m[1].replace(/_/g, ' '));
}

async function kindOf(path: string): Promise<'file' | 'folder' | null> {
  try {
    const s = await lstat(path);
    if (s.isSymbolicLink()) return null;
    return s.isDirectory() ? 'folder' : s.isFile() ? 'file' : null;
  } catch {
    return null;
  }
}

/** Opens a folder, or a file at a line, in the editor. Only real, absolute, non-link paths. */
export async function openInEditor(target: { path: string; line?: number }, editor: Editor | null, exec: Exec = realExec): Promise<OpenResult> {
  if (!editor) return { ok: false, tool: '', error: 'no_editor' };
  const { path } = target;
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) return { ok: false, tool: editor.name, error: 'refused' };
  const kind = await kindOf(path);
  if (!kind) return { ok: false, tool: editor.name, error: 'gone' };
  const line = Number.isInteger(target.line) && (target.line as number) > 0 ? (target.line as number) : 1;
  const args = kind === 'folder' ? [path] : ['-g', `${path}:${line}`];
  const r = await exec(editor.bin, args, 8000);
  return r.ok ? { ok: true, tool: editor.name } : { ok: false, tool: editor.name, error: 'open_failed' };
}
