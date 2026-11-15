// Updates for the packaged app: checks GitHub Releases at launch and every six hours, downloads in
// the background, and installs when Side quits (macOS only accepts a signed, notarized update).
// Does nothing when run from the repo with npm start.
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';

const EVERY_MS = 6 * 60 * 60_000;

export function startAutoUpdate(): void {
  if (!app.isPackaged || process.env.SIDE_NO_UPDATE === '1') return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', (info) => console.log(`[side] update ${info.version} downloaded; installs when Side quits`));
  const check = () => void autoUpdater.checkForUpdates().catch((err: Error) => console.warn('[side] update check failed:', err.message));
  check();
  setInterval(check, EVERY_MS);
}
