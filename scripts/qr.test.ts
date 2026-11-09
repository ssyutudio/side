import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { makeQr, checkQrUrl } from './qr.mjs';

describe('checkQrUrl', () => {
  it('accepts https URLs', () => {
    expect(checkQrUrl('https://side-waitlist.vercel.app')).toBe('https://side-waitlist.vercel.app/');
  });
  it('refuses http, other schemes and garbage', () => {
    expect(() => checkQrUrl('http://side-waitlist.vercel.app')).toThrow(/https/);
    expect(() => checkQrUrl('javascript:alert(1)')).toThrow();
    expect(() => checkQrUrl('not a url')).toThrow();
  });
});

describe('makeQr', () => {
  let dir = '';
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'side-qr-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('writes a PNG and an SVG for the URL', async () => {
    const out = await makeQr('https://example.vercel.app', dir);
    const png = readFileSync(out.png);
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const svg = readFileSync(out.svg, 'utf8');
    expect(svg).toMatch(/<svg[\s>]/);
    expect(out.png.endsWith('waitlist-qr.png')).toBe(true);
    expect(out.svg.endsWith('waitlist-qr.svg')).toBe(true);
  });

  it('refuses a non-https URL before writing anything', async () => {
    await expect(makeQr('http://example.com', dir)).rejects.toThrow(/https/);
  });
});
