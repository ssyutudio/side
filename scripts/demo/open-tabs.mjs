// Opens the demo tabs in Google Chrome (macOS).
// Usage: node scripts/demo/open-tabs.mjs [--dry-run] [https://docs.google.com/document/d/<id>/edit]
import { execFileSync } from 'node:child_process';
import { loadDemoTabs, demoUrls, openArgs } from './tabs.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const docsUrl = args.find((a) => !a.startsWith('--'));

let urls;
try {
  urls = demoUrls(loadDemoTabs(), docsUrl);
} catch (e) {
  console.error(String(e && e.message ? e.message : e));
  process.exit(2);
}

if (dryRun) {
  for (const u of urls) console.log(u);
  console.log(`${urls.length} tabs (dry run, nothing opened)`);
} else {
  execFileSync('open', openArgs(urls), { stdio: 'inherit' });
  console.log(`Opened ${urls.length} tabs in Google Chrome.`);
}
