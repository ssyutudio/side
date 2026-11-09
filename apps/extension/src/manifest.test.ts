import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const manifest = JSON.parse(readFileSync(join(__dirname, '..', 'static', 'manifest.json'), 'utf8'));

describe('manifest', () => {
  it('is an MV3 extension named Side that needs Chrome 116+', () => {
    expect(manifest.manifest_version).toBe(3);
    expect(manifest.name).toBe('Side');
    expect(manifest.minimum_chrome_version).toBe('116');
  });

  it('runs a module service worker from background.js', () => {
    expect(manifest.background).toEqual({ service_worker: 'background.js', type: 'module' });
  });

  it('asks only for the permissions the features use', () => {
    expect([...manifest.permissions].sort()).toEqual(['alarms', 'scripting', 'storage', 'tabGroups', 'tabs']);
  });

  it('reads positions only on the demo work sites; broader sites stay optional', () => {
    expect(manifest.host_permissions).toEqual([
      'https://docs.google.com/*',
      'https://github.com/*',
      'https://developer.mozilla.org/*',
      'https://en.wikipedia.org/*',
      'https://stackoverflow.com/*',
      'https://www.notion.so/*',
      'https://news.ycombinator.com/*',
    ]);
    expect(manifest.optional_host_permissions).toEqual(['https://*/*', 'http://*/*']);
  });
});
