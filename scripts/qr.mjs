// Builds the waitlist QR code locally with the qrcode library. The URL is never sent anywhere.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import QRCode from 'qrcode';

/** Returns the normalized URL, or throws if it is not https. @param {string} input */
export function checkQrUrl(input) {
  let u;
  try {
    u = new URL(input);
  } catch {
    throw new Error(`Not a URL: ${input}`);
  }
  if (u.protocol !== 'https:') throw new Error('The waitlist QR must point to an https URL.');
  return u.toString();
}

/**
 * Writes waitlist-qr.png (1024px) and waitlist-qr.svg into outDir.
 * @param {string} url
 * @param {string} outDir
 */
export async function makeQr(url, outDir) {
  const target = checkQrUrl(url);
  mkdirSync(outDir, { recursive: true });
  const opts = { errorCorrectionLevel: 'M', margin: 2, color: { dark: '#000000', light: '#ffffff' } };
  const png = join(outDir, 'waitlist-qr.png');
  const svg = join(outDir, 'waitlist-qr.svg');
  await QRCode.toFile(png, target, { ...opts, type: 'png', width: 1024 });
  writeFileSync(svg, await QRCode.toString(target, { ...opts, type: 'svg' }));
  return { url: target, png, svg };
}
