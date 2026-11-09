import { mkdtempSync, readFileSync, writeFileSync, existsSync, readdirSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, type FsLike } from './store';
import * as realFs from 'node:fs/promises';

type Data = { version: 1; n: number; list: string[] };
const defaults = (): Data => ({ version: 1, n: 0, list: [] });

function dir() {
  return mkdtempSync(join(tmpdir(), 'side-store-'));
}

describe('JsonStore', () => {
  it('starts from defaults when the file does not exist (ENOENT)', async () => {
    const s = new JsonStore<Data>(join(dir(), 'side-data.json'), defaults);
    const d = await s.load();
    expect(d).toEqual(defaults());
    expect(s.loadState).toBe('fresh');
  });

  it('saves atomically and loads the saved value', async () => {
    const path = join(dir(), 'side-data.json');
    const s = new JsonStore<Data>(path, defaults);
    await s.load();
    await s.update((d) => ({ ...d, n: 3 }));
    expect(JSON.parse(readFileSync(path, 'utf8')).n).toBe(3);
    const again = new JsonStore<Data>(path, defaults);
    expect((await again.load()).n).toBe(3);
    expect(readdirSync(join(path, '..')).filter((f) => f.endsWith('.tmp'))).toEqual([]);
  });

  it('fills fields added after the file was written', async () => {
    const path = join(dir(), 'side-data.json');
    writeFileSync(path, JSON.stringify({ version: 1, n: 5 }));
    const d = await new JsonStore<Data>(path, defaults).load();
    expect(d).toEqual({ version: 1, n: 5, list: [] });
  });

  it('moves a corrupt file aside instead of deleting it', async () => {
    const d0 = dir();
    const path = join(d0, 'side-data.json');
    writeFileSync(path, '{"version":1,"n":');
    const s = new JsonStore<Data>(path, defaults);
    expect(await s.load()).toEqual(defaults());
    expect(s.loadState).toBe('recovered');
    const aside = readdirSync(d0).filter((f) => f.includes('corrupt'));
    expect(aside.length).toBe(1);
    expect(readFileSync(join(d0, aside[0]), 'utf8')).toBe('{"version":1,"n":');
  });

  it('refuses to write when the file exists but cannot be read (not ENOENT)', async () => {
    const d0 = dir();
    const path = join(d0, 'side-data.json');
    writeFileSync(path, JSON.stringify({ version: 1, n: 9, list: [] }));
    chmodSync(path, 0o000);
    const s = new JsonStore<Data>(path, defaults);
    await s.load();
    expect(s.loadState).toBe('unreadable');
    await expect(s.update((d) => ({ ...d, n: 1 }))).rejects.toThrow(/read/);
    chmodSync(path, 0o600);
    expect(JSON.parse(readFileSync(path, 'utf8')).n).toBe(9);
  });

  it('leaves the original untouched when writing the temp file fails', async () => {
    const path = join(dir(), 'side-data.json');
    const ok = new JsonStore<Data>(path, defaults);
    await ok.load();
    await ok.update((d) => ({ ...d, n: 1 }));
    const failing: FsLike = { ...realFs, writeFile: async () => { throw new Error('disk full'); } };
    const s = new JsonStore<Data>(path, defaults, failing);
    await s.load();
    await expect(s.update((d) => ({ ...d, n: 2 }))).rejects.toThrow(/disk full/);
    expect(JSON.parse(readFileSync(path, 'utf8')).n).toBe(1);
    expect(s.get().n).toBe(1);
  });

  it('leaves the original untouched and removes the temp file when rename fails', async () => {
    const d0 = dir();
    const path = join(d0, 'side-data.json');
    const ok = new JsonStore<Data>(path, defaults);
    await ok.load();
    await ok.update((d) => ({ ...d, n: 1 }));
    const failing: FsLike = { ...realFs, rename: async () => { throw new Error('rename failed'); } };
    const s = new JsonStore<Data>(path, defaults, failing);
    await s.load();
    await expect(s.update((d) => ({ ...d, n: 2 }))).rejects.toThrow(/rename/);
    expect(JSON.parse(readFileSync(path, 'utf8')).n).toBe(1);
    expect(existsSync(path + '.tmp')).toBe(false);
  });

  it('applies concurrent updates in order without losing one', async () => {
    const path = join(dir(), 'side-data.json');
    const s = new JsonStore<Data>(path, defaults);
    await s.load();
    await Promise.all([1, 2, 3, 4, 5].map((i) => s.update((d) => ({ ...d, list: [...d.list, String(i)] }))));
    expect(JSON.parse(readFileSync(path, 'utf8')).list).toEqual(['1', '2', '3', '4', '5']);
  });
});
