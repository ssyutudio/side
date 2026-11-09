// The Claude Code connector (K4): Side's hook (scripts/claude-code-hook.mjs) drops a note into the
// inbox folder when a session finishes. This reads each note once, checks it strictly, deletes it,
// and keeps only "a Claude Code session finished in this folder" — never a transcript, a command or
// anything the agent did. Nothing here runs a command. A note that is too big, malformed, from an
// unknown source or about a folder that doesn't exist is dropped.
import { lstat, mkdir, readdir, readFile, rm } from 'node:fs/promises';
import { watch } from 'node:fs';
import { basename, isAbsolute, join } from 'node:path';
import { z } from 'zod';

export const MAX_NOTE_BYTES = 4096;
const MAX_NOTES_PER_DRAIN = 50;

const Note = z
  .object({
    v: z.literal(1),
    source: z.literal('claude_code'),
    event: z.enum(['stop', 'session_end']),
    folder: z.string().min(2).max(1024).refine((p) => isAbsolute(p) && !p.includes('\0')),
    at: z.number().int().nonnegative(),
  })
  .strict();

export interface AgentRun {
  source: 'claude_code';
  event: 'stop' | 'session_end';
  /** Kept on this computer only; never sent anywhere. */
  folder: string;
  /** The folder's own name, which is all sidy says. */
  name: string;
  /** When Side read the note (its own clock), not the time the note claims. */
  at: number;
}

export interface InboxDeps {
  now: () => number;
  /** True when the path is a real folder (not a link). */
  isFolder?: (path: string) => Promise<boolean>;
}

async function realFolder(path: string): Promise<boolean> {
  try {
    const s = await lstat(path);
    return s.isDirectory() && !s.isSymbolicLink();
  } catch {
    return false;
  }
}

/** Reads, checks and deletes every finished note in the inbox. Never throws. */
export async function drainInbox(dir: string, deps: InboxDeps): Promise<AgentRun[]> {
  let names: string[];
  try {
    names = (await readdir(dir)).filter((n) => n.endsWith('.json') && !n.startsWith('.')).sort().slice(0, MAX_NOTES_PER_DRAIN);
  } catch {
    return [];
  }
  const isFolder = deps.isFolder ?? realFolder;
  const runs: AgentRun[] = [];
  for (const n of names) {
    const path = join(dir, n);
    try {
      const st = await lstat(path);
      if (!st.isFile() || st.size > MAX_NOTE_BYTES) continue;
      const parsed = Note.safeParse(JSON.parse(await readFile(path, 'utf8')));
      if (!parsed.success || !(await isFolder(parsed.data.folder))) continue;
      const { event, folder } = parsed.data;
      runs.push({ source: 'claude_code', event, folder, name: basename(folder), at: deps.now() });
    } catch {
      // Unreadable or broken: dropped below like any other note.
    } finally {
      await rm(path, { force: true }).catch(() => undefined);
    }
  }
  // Stop and SessionEnd for the same session arrive together: one finish per folder per drain.
  const seen = new Set<string>();
  return runs.filter((r) => (seen.has(r.folder) ? false : (seen.add(r.folder), true)));
}

/** Watches the inbox and hands over finished runs. Returns a function that stops watching. */
export function watchInbox(dir: string, deps: InboxDeps, onRuns: (runs: AgentRun[]) => void): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  const drain = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (stopped) return;
      void drainInbox(dir, deps).then((runs) => runs.length && !stopped && onRuns(runs));
    }, 300);
  };
  let w: ReturnType<typeof watch> | null = null;
  void mkdir(dir, { recursive: true })
    .then(() => {
      if (stopped) return;
      w = watch(dir, drain);
      w.on('error', () => undefined);
      drain();
    })
    .catch(() => undefined);
  return () => {
    stopped = true;
    clearTimeout(timer);
    w?.close();
  };
}
