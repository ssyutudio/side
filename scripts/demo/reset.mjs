// Resets Side's local data for a fresh demo run. Quit the app first.
// Usage: node scripts/demo/reset.mjs --yes
import { homedir } from 'node:os';
import { resetData } from './reset-lib.mjs';

const yes = process.argv.includes('--yes');
const r = resetData({ home: homedir(), yes, log: (l) => console.log(l) });
if (r.found.length > 0 && !yes) process.exit(1);
