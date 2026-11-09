// Bundles the MV3 extension into apps/extension/dist (the folder to "Load unpacked").
import { build } from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
cpSync(join(root, 'static'), out, { recursive: true });

const entries = ['background'].map((n) => join(root, 'src', `${n}.ts`)).filter((p) => existsSync(p));
if (entries.length > 0) {
  await build({
    entryPoints: entries,
    outdir: out,
    bundle: true,
    format: 'esm',
    target: 'chrome116',
    sourcemap: false,
    logLevel: 'warning',
  });
}
console.log('extension built ->', out);
