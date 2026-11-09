// Bundles the Electron main and preload processes into apps/desktop/dist.
import { build } from 'esbuild';
import { mkdirSync, existsSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

const nodeEntries = ['main', 'preload']
  .map((n) => join(root, 'src', 'main', `${n}.ts`))
  .filter((p) => existsSync(p));
if (nodeEntries.length > 0) {
  await build({
    entryPoints: nodeEntries,
    outdir: out,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    external: ['electron', 'bufferutil', 'utf-8-validate'],
    logLevel: 'warning',
  });
}
cpSync(join(root, 'static'), join(out, 'static'), { recursive: true });
console.log('desktop built ->', out);
