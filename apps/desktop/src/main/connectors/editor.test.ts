import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { cliFor, openInEditor, pickEditor, visibleApps, type Editor } from './editor';

const base = mkdtempSync(join(tmpdir(), 'side-editor-'));
const folder = join(base, 'retry-lib');
mkdirSync(folder);
const file = join(folder, 'retry.test.ts');
writeFileSync(file, 'x');
symlinkSync(file, join(folder, 'link.ts'));

const code: Editor = { name: 'VS Code', bin: '/usr/local/bin/code' };

function fakeExec(ok = true) {
  const calls: { file: string; args: string[] }[] = [];
  return { calls, exec: async (f: string, args: string[]) => (calls.push({ file: f, args }), { ok, stdout: '' }) };
}

describe('editor connector', () => {
  it('opens a folder as a folder, and a file at its line with -g, with fixed arguments', async () => {
    const f = fakeExec();
    expect(await openInEditor({ path: folder }, code, f.exec)).toEqual({ ok: true, tool: 'VS Code' });
    expect(await openInEditor({ path: file, line: 88 }, code, f.exec)).toEqual({ ok: true, tool: 'VS Code' });
    expect(f.calls).toEqual([
      { file: '/usr/local/bin/code', args: [folder] },
      { file: '/usr/local/bin/code', args: ['-g', `${file}:88`] },
    ]);
  });

  it('refuses relative paths, links and missing paths, and says when no editor is installed', async () => {
    const f = fakeExec();
    expect(await openInEditor({ path: 'retry-lib' }, code, f.exec)).toMatchObject({ ok: false, error: 'refused' });
    expect(await openInEditor({ path: join(folder, 'link.ts') }, code, f.exec)).toMatchObject({ ok: false, error: 'gone' });
    expect(await openInEditor({ path: join(folder, 'nope') }, code, f.exec)).toMatchObject({ ok: false, error: 'gone' });
    expect(await openInEditor({ path: folder }, null, f.exec)).toEqual({ ok: false, tool: '', error: 'no_editor' });
    expect(f.calls).toEqual([]);
  });

  it('a bad line becomes line 1; a failed open says so', async () => {
    const f = fakeExec(false);
    expect(await openInEditor({ path: file, line: -3 }, code, f.exec)).toMatchObject({ ok: false, error: 'open_failed' });
    expect(f.calls[0].args).toEqual(['-g', `${file}:1`]);
  });

  it('picks the editor nearest the front, else Cursor, else VS Code', () => {
    const both = (n: string) => (n === 'Cursor' ? '/c/cursor' : '/c/code');
    expect(pickEditor(['Google Chrome', 'Code', 'Cursor'], both)).toEqual({ name: 'VS Code', bin: '/c/code' });
    expect(pickEditor(['Finder'], both)).toEqual({ name: 'Cursor', bin: '/c/cursor' });
    expect(pickEditor(['Finder'], (n) => (n === 'VS Code' ? '/c/code' : null))).toEqual({ name: 'VS Code', bin: '/c/code' });
    expect(pickEditor([], () => null)).toBeNull();
  });

  it('finds the command on PATH or inside the app bundle', () => {
    expect(cliFor('VS Code', { PATH: '/x/bin' }, (p) => p === '/x/bin/code')).toBe('/x/bin/code');
    expect(cliFor('Cursor', { PATH: '' }, (p) => p === '/Applications/Cursor.app/Contents/Resources/app/bin/cursor')).toBe('/Applications/Cursor.app/Contents/Resources/app/bin/cursor');
  });

  it('reads visible app names from lsappinfo', async () => {
    const out = 'ASN:0x0-0x1a01a-"Code": ASN:0x0-0x2b02b-"Google_Chrome":';
    expect(await visibleApps(async () => ({ ok: true, stdout: out }))).toEqual(['Code', 'Google Chrome']);
  });
});
