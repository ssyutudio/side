#!/usr/bin/env node
// Claude Code hook for Side (Stop / SessionEnd). Tells the Side desktop app on this computer that a
// Claude Code session finished, and in which folder — nothing else. It never reads the transcript,
// the conversation or any command, never opens a network connection, and always exits 0 so it can
// never block Claude Code.
//
// It drops one small JSON file into Side's inbox folder; the app checks it and deletes it.
// Install (one line in ~/.claude/settings.json), see README "Claude Code":
//   { "hooks": { "Stop": [ { "hooks": [ { "type": "command", "command": "node /path/to/side/scripts/claude-code-hook.mjs" } ] } ] } }

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';

export function inboxDir(env = process.env) {
  const base = env.SIDE_USER_DATA || join(homedir(), 'Library', 'Application Support', 'Side');
  return join(base, 'inbox');
}

/** The note Side reads: the event and the folder, from the hook's input. Null when there is nothing to say. */
export function noteFrom(input, now = Date.now()) {
  if (!input || typeof input !== 'object') return null;
  const event = input.hook_event_name === 'Stop' ? 'stop' : input.hook_event_name === 'SessionEnd' ? 'session_end' : null;
  const folder = typeof input.cwd === 'string' ? input.cwd : '';
  if (!event || !folder || !isAbsolute(folder) || folder.length > 1024) return null;
  return { v: 1, source: 'claude_code', event, folder, at: now };
}

function main() {
  try {
    const raw = readFileSync(0, 'utf8').slice(0, 64 * 1024);
    const note = noteFrom(JSON.parse(raw));
    if (!note) return;
    const dir = inboxDir();
    mkdirSync(dir, { recursive: true });
    const name = `cc-${note.at}-${process.pid}.json`;
    // Written aside, then renamed, so the app never reads half a file.
    writeFileSync(join(dir, `.${name}`), JSON.stringify(note));
    renameSync(join(dir, `.${name}`), join(dir, name));
  } catch {
    // Never get in Claude Code's way.
  }
}

if (process.argv[1] && import.meta.url.endsWith(process.argv[1].split('/').pop())) main();
