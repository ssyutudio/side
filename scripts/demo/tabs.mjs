// Demo tab list (C4): real public English pages grouped into four works plus a few distractions.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEMO_HOSTS = [
  'docs.google.com',
  'github.com',
  'developer.mozilla.org',
  'en.wikipedia.org',
  'stackoverflow.com',
  'news.ycombinator.com',
  'youtube.com',
];

const here = dirname(fileURLToPath(import.meta.url));

/** @returns {{work: string, url: string}[]} */
export function loadDemoTabs(file = join(here, 'tabs.json')) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

/**
 * URLs to open, with an optional Google Docs document placed right after the retry research tabs,
 * so one inner-scrolling page is part of the demo.
 * @param {{work: string, url: string}[]} tabs
 * @param {string} [docsUrl]
 */
export function demoUrls(tabs, docsUrl) {
  const urls = tabs.map((t) => t.url);
  if (!docsUrl) return urls;
  let u;
  try {
    u = new URL(docsUrl);
  } catch {
    u = null;
  }
  if (!u || u.protocol !== 'https:' || u.hostname !== 'docs.google.com' || !u.pathname.startsWith('/document/')) {
    throw new Error('The extra URL must be a Google Docs document (https://docs.google.com/document/...).');
  }
  const lastRetry = tabs.map((t) => t.work).lastIndexOf('Retry research');
  urls.splice(lastRetry + 1, 0, docsUrl);
  return urls;
}

/** Arguments for macOS `open` that hand every URL to Google Chrome at once. @param {string[]} urls */
export function openArgs(urls) {
  return ['-a', 'Google Chrome', ...urls];
}
