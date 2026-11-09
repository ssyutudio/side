// AC12 · AC16: the Claude Code hook and the inbox it writes to.
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { drainInbox, watchInbox, MAX_NOTE_BYTES } from './claudeCode';
// @ts-expect-error plain ESM script without types
import { noteFrom } from '../../../../../scripts/claude-code-hook.mjs';

const HOOK = join(__dirname, '../../../../../scripts/claude-code-hook.mjs');
const now = () => 1_000;

function setup() {
  const base = mkdtempSync(join(tmpdir(), 'side-cc-'));
  const inbox = join(base, 'inbox');
  const project = join(base, 'side-service');
  mkdirSync(inbox);
  mkdirSync(project);
  return { base, inbox, project };
}

describe('Claude Code hook script', () => {
  it('turns a Stop hook input into a note with only the event and the folder', () => {
    const input = { session_id: 's1', transcript_path: '/Users/x/.claude/projects/p/s1.jsonl', cwd: '/Users/x/side-service', hook_event_name: 'Stop', stop_hook_active: false };
    expect(noteFrom(input, 5)).toEqual({ v: 1, source: 'claude_code', event: 'stop', folder: '/Users/x/side-service', at: 5 });
    expect(JSON.stringify(noteFrom(input, 5))).not.toContain('transcript');
    expect(noteFrom({ ...input, hook_event_name: 'SessionEnd' }, 5)).toMatchObject({ event: 'session_end' });
  });

  it('says nothing for other events, relative or missing folders, or junk', () => {
    for (const bad of [null, 42, 'x', {}, { hook_event_name: 'PreToolUse', cwd: '/a' }, { hook_event_name: 'Stop', cwd: 'relative/dir' }, { hook_event_name: 'Stop' }]) {
      expect(noteFrom(bad, 5)).toBeNull();
    }
  });

  it('as a real process: writes one note to the inbox, never fails, even on broken input', () => {
    const { base, inbox, project } = setup();
    const env = { ...process.env, SIDE_USER_DATA: base };
    execFileSync('node', [HOOK], { input: JSON.stringify({ hook_event_name: 'Stop', cwd: project }), env });
    execFileSync('node', [HOOK], { input: 'not json at all', env });
    execFileSync('node', [HOOK], { input: '', env });
    const notes = readdirSync(inbox);
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatch(/^cc-\d+-\d+\.json$/);
  });
});

describe('Side reading the inbox', () => {
  it('keeps "finished in this folder" and deletes the note', async () => {
    const { inbox, project } = setup();
    writeFileSync(join(inbox, 'cc-1.json'), JSON.stringify({ v: 1, source: 'claude_code', event: 'stop', folder: project, at: 1 }));
    expect(await drainInbox(inbox, { now })).toEqual([{ source: 'claude_code', event: 'stop', folder: project, name: 'side-service', at: 1_000 }]);
    expect(readdirSync(inbox)).toEqual([]);
  });

  it('drops (and deletes) anything else: broken JSON, extra keys, wrong source, missing folder, huge notes', async () => {
    const { inbox, project } = setup();
    const ok = { v: 1, source: 'claude_code', event: 'stop', folder: project, at: 1 };
    writeFileSync(join(inbox, 'a.json'), '{ broken');
    writeFileSync(join(inbox, 'b.json'), 'null');
    writeFileSync(join(inbox, 'c.json'), JSON.stringify({ ...ok, command: 'rm -rf ~' }));
    writeFileSync(join(inbox, 'd.json'), JSON.stringify({ ...ok, source: 'someone_else' }));
    writeFileSync(join(inbox, 'e.json'), JSON.stringify({ ...ok, folder: join(project, 'not-there') }));
    writeFileSync(join(inbox, 'f.json'), JSON.stringify({ ...ok, folder: 'relative' }));
    writeFileSync(join(inbox, 'g.json'), JSON.stringify({ ...ok, pad: 'x'.repeat(MAX_NOTE_BYTES) }));
    expect(await drainInbox(inbox, { now })).toEqual([]);
    expect(readdirSync(inbox)).toEqual([]);
  });

  it('leaves half-written notes (dot files) for the next read, and counts one finish per folder', async () => {
    const { inbox, project } = setup();
    const note = (event: string) => JSON.stringify({ v: 1, source: 'claude_code', event, folder: project, at: 1 });
    writeFileSync(join(inbox, '.cc-3.json'), note('stop'));
    writeFileSync(join(inbox, 'cc-1.json'), note('stop'));
    writeFileSync(join(inbox, 'cc-2.json'), note('session_end'));
    expect(await drainInbox(inbox, { now })).toHaveLength(1);
    expect(readdirSync(inbox)).toEqual(['.cc-3.json']);
  });

  it('a missing inbox is simply empty', async () => {
    expect(await drainInbox('/nonexistent/side/inbox', { now })).toEqual([]);
  });

  it('watches the inbox and hands over a run soon after the hook writes it', async () => {
    const { base, inbox, project } = setup();
    const got: string[] = [];
    const stop = watchInbox(inbox, { now }, (runs) => got.push(...runs.map((r) => r.name)));
    await new Promise((r) => setTimeout(r, 100));
    execFileSync('node', [HOOK], { input: JSON.stringify({ hook_event_name: 'Stop', cwd: project }), env: { ...process.env, SIDE_USER_DATA: base } });
    for (let i = 0; i < 30 && !got.length; i++) await new Promise((r) => setTimeout(r, 100));
    stop();
    expect(got).toEqual(['side-service']);
  });
});
