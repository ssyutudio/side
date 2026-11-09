// Finds and deletes Side's local data file (Electron userData for the app name "Side"). Nothing else.
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';

export const DATA_FILE = 'side-data.json';

/** @param {string} home */
export function resetTargets(home) {
  const dir = join(home, 'Library', 'Application Support', 'Side');
  return [join(dir, DATA_FILE), join(dir, `${DATA_FILE}.tmp`)];
}

/**
 * @param {{home: string, yes: boolean, log: (line: string) => void}} opts
 * @returns {{found: string[], deleted: string[]}}
 */
export function resetData({ home, yes, log }) {
  const found = resetTargets(home).filter((p) => existsSync(p));
  if (found.length === 0) {
    log('Nothing to reset: no Side data file found.');
    return { found, deleted: [] };
  }
  log('This deletes Side\'s local data (set-asides, steps, settings):');
  for (const p of found) log(`  ${p}`);
  if (!yes) {
    log('Nothing deleted. Quit Side first, then run again with --yes.');
    return { found, deleted: [] };
  }
  const deleted = [];
  for (const p of found) {
    rmSync(p, { force: true });
    deleted.push(p);
  }
  log(`Deleted ${deleted.length} file(s).`);
  return { found, deleted };
}
