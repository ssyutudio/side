// The folder people load unpacked must contain a working worker and no secrets.
import { execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dist = join(__dirname, '..', 'dist');

describe('extension build', () => {
  beforeAll(() => {
    execSync('node scripts/build.mjs', { cwd: join(__dirname, '..'), stdio: 'ignore' });
  }, 60_000);

  it('produces manifest.json and the background worker it names', () => {
    const manifest = JSON.parse(readFileSync(join(dist, 'manifest.json'), 'utf8'));
    expect(existsSync(join(dist, manifest.background.service_worker))).toBe(true);
  });

  it('bundles everything into the worker (no bare imports left)', () => {
    const js = readFileSync(join(dist, 'background.js'), 'utf8');
    expect(js).not.toMatch(/from\s*["']@side\/shared["']/);
    expect(js).not.toMatch(/from\s*["']zod["']/);
  });

  it('starts in a worker-like global and opens the link to the app', async () => {
    const { createFakeChrome, makeTab } = await import('./testing/fakeChrome');
    const { FakeSocket } = await import('./testing/fakeSocket');
    const fake = createFakeChrome([makeTab(1, 'https://github.com/o/r', { active: true })]);
    const sockets: InstanceType<typeof FakeSocket>[] = [];
    const ev = () => ({ addListener: () => undefined });
    const g = globalThis as Record<string, unknown>;
    g.chrome = {
      ...fake.chrome,
      tabGroups: { ...fake.chrome.tabGroups, onUpdated: ev(), onRemoved: ev() },
      alarms: { create: () => undefined, onAlarm: ev() },
      runtime: { getManifest: () => ({ version: '0.1.0' }), onStartup: ev(), onInstalled: ev() },
    };
    g.WebSocket = class extends FakeSocket {
      constructor(url: string) {
        super(url);
        sockets.push(this);
      }
    };
    try {
      await import(/* @vite-ignore */ join(dist, 'background.js') + '?t=' + Date.now());
      await new Promise((r) => setTimeout(r, 50));
      expect(sockets).toHaveLength(1);
      sockets[0].open();
      expect(sockets[0].sentTypes()[0]).toBe('hello');
    } finally {
      delete g.chrome;
      delete g.WebSocket;
    }
  });

  it('carries no API keys or database credentials', () => {
    const js = readFileSync(join(dist, 'background.js'), 'utf8');
    expect(js).not.toMatch(/ANTHROPIC|DATABASE_UR[LI]|sk-ant-|postgres(ql)?:\/\//);
  });
});
