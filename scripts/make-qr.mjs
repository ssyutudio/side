// Usage: node scripts/make-qr.mjs https://<project>.vercel.app
// Writes docs/assets/waitlist-qr.png and docs/assets/waitlist-qr.svg (same QR for page, deck, video, README).
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { makeQr } from './qr.mjs';

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/make-qr.mjs https://<project>.vercel.app');
  process.exit(2);
}
const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'docs', 'assets');
try {
  const out = await makeQr(url, outDir);
  console.log(`QR for ${out.url}\n  ${out.png}\n  ${out.svg}`);
} catch (e) {
  console.error(String(e && e.message ? e.message : e));
  process.exit(1);
}
