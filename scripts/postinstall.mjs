// After `npm install`: build the Chrome extension so apps/extension/dist is ready to Load unpacked.
// Skipped on Vercel, which installs this monorepo only to deploy web/waitlist and has no use for it.
import { execSync } from 'node:child_process';

if (process.env.VERCEL) {
  console.log('postinstall: on Vercel, the extension is not built');
} else {
  execSync('npm run build -w @side/extension', { stdio: 'inherit' });
}
