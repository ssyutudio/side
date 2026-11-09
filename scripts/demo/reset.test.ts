import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetTargets, resetData } from './reset-lib.mjs';

describe('resetData', () => {
  let home = '';
  let dir = '';
  beforeEach(() => {
    home = mkdtempSync(join(tmpdir(), 'side-home-'));
    dir = join(home, 'Library', 'Application Support', 'Side');
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => rmSync(home, { recursive: true, force: true }));

  it('targets only the Side data file and its temp file', () => {
    expect(resetTargets(home)).toEqual([join(dir, 'side-data.json'), join(dir, 'side-data.json.tmp')]);
  });

  it('lists but deletes nothing without --yes', () => {
    writeFileSync(join(dir, 'side-data.json'), '{}');
    const lines: string[] = [];
    const r = resetData({ home, yes: false, log: (l: string) => lines.push(l) });
    expect(r.deleted).toEqual([]);
    expect(existsSync(join(dir, 'side-data.json'))).toBe(true);
    expect(lines.join('\n')).toMatch(/--yes/);
  });

  it('deletes the data files with --yes and leaves everything else', () => {
    writeFileSync(join(dir, 'side-data.json'), '{}');
    writeFileSync(join(dir, 'side-data.json.tmp'), '{}');
    writeFileSync(join(dir, 'Preferences'), 'keep');
    const r = resetData({ home, yes: true, log: () => {} });
    expect(r.deleted).toHaveLength(2);
    expect(readdirSync(dir)).toEqual(['Preferences']);
  });

  it('is a no-op when there is nothing to delete', () => {
    const r = resetData({ home, yes: true, log: () => {} });
    expect(r.deleted).toEqual([]);
  });
});
