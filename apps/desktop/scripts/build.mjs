// Bundles the Electron main/preload processes and the renderer pages into apps/desktop/dist.
import { build } from 'esbuild';
import { mkdirSync, existsSync, cpSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist');
mkdirSync(out, { recursive: true });

const nodeEntries = ['main', 'preload']
  .map((n) => join(root, 'src', 'main', `${n}.ts`))
  .filter((p) => existsSync(p));
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

// Renderer pages: src/renderer/<page>/<page>.ts + index.html -> dist/renderer/<page>.js + <page>.html
const rsrc = join(root, 'src', 'renderer');
const rout = join(out, 'renderer');
mkdirSync(rout, { recursive: true });
const pages = readdirSync(rsrc).filter((d) => existsSync(join(rsrc, d, `${d}.ts`)));
if (pages.length) {
  await build({
    entryPoints: pages.map((p) => join(rsrc, p, `${p}.ts`)),
    outdir: rout,
    bundle: true,
    platform: 'browser',
    format: 'iife',
    target: 'chrome120',
    logLevel: 'warning',
  });
  for (const p of pages) cpSync(join(rsrc, p, 'index.html'), join(rout, `${p}.html`));
}
cpSync(join(rsrc, 'shared', 'side.css'), join(rout, 'side.css'));
cpSync(join(root, 'static'), join(out, 'static'), { recursive: true });
console.log('desktop built ->', out, 'pages:', pages.join(', ') || 'none');
