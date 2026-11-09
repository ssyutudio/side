// Electron main process: owns the data file, the bridge to the extension and the sidy window.
import { app, globalShortcut, Menu } from 'electron';
import { join } from 'node:path';
import { BRIDGE_HOST, BRIDGE_PORT, COMMAND_TIMEOUT_MS, type TabsReport } from '@side/shared';
import { loadConfig } from './config';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { Bridge, type BridgeStatus } from './bridge';
import { createEdgeWindow, type EdgeWindow } from './edgeWindow';

app.setName('Side');
app.setPath('userData', join(app.getPath('appData'), 'Side'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const config = loadConfig(join(app.getAppPath(), '.env.local'));
const store = new JsonStore<AppData>(join(app.getPath('userData'), 'side-data.json'), defaultAppData);

let edge: EdgeWindow | null = null;
let bridge: Bridge | null = null;
let bridgeStatus: BridgeStatus = 'waiting';
let lastReport: TabsReport | null = null;

function installMenu() {
  // Without an Edit menu, Cmd+C / Cmd+V do not work in text fields on macOS.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  );
}

function showTabCount(report: TabsReport) {
  // First card 2 check: the number of tabs the app received, on the Dock icon.
  app.dock?.setBadge(String(report.tabs.length));
}

async function setHidden(hidden: boolean) {
  if (!edge) return;
  if (hidden) edge.hide();
  else edge.show();
  await store.update((d) => ({ ...d, hidden })).catch((err) => console.warn('[side] could not save hidden state', err));
}

function registerShortcut() {
  const accel = store.get().settings.shortcut;
  globalShortcut.unregisterAll();
  const ok = globalShortcut.register(accel, () => void setHidden(edge?.isVisible() ?? false));
  if (!ok) console.warn(`[side] shortcut ${accel} is taken by another app`);
}

async function startBridge() {
  bridge = new Bridge({
    host: BRIDGE_HOST,
    port: BRIDGE_PORT,
    appVersion: app.getVersion(),
    timeoutMs: COMMAND_TIMEOUT_MS,
    getPinnedOrigin: () => store.get().pairedOrigin,
    pinOrigin: (origin) => store.update((d) => ({ ...d, pairedOrigin: origin })).then(() => undefined),
    getExclusions: () => store.get().settings.excludedDomains,
    onReport: (report) => {
      lastReport = report;
      showTabCount(report);
    },
    onStatus: (s) => {
      bridgeStatus = s;
      console.log(`[side] extension ${s}`);
    },
  });
  try {
    await bridge.start();
  } catch (err) {
    console.error('[side] could not open the local connection for the extension:', (err as Error).message);
  }
}

app.whenReady().then(async () => {
  installMenu();
  await store.load();
  if (store.loadState === 'recovered') console.warn('[side] data file was unreadable JSON and was moved aside:', store.movedAside);
  console.log(`[side] llm key ${config.anthropicKey ? 'present' : 'absent'}, llm ${store.get().settings.llmEnabled ? 'on' : 'off'}`);

  await startBridge();

  edge = createEdgeWindow({
    preload: join(__dirname, 'preload.js'),
    page: join(__dirname, 'static', 'edge-placeholder.html'),
    size: store.get().settings.sidySize,
  });
  if (!store.get().hidden) edge.win.once('ready-to-show', () => edge?.show());
  registerShortcut();

  if (process.env.SIDE_SMOKE === '1') {
    setTimeout(() => {
      const w = edge!.win;
      console.log(
        'SIDE_SMOKE ' +
          JSON.stringify({
            visible: w.isVisible(),
            focused: w.isFocused(),
            alwaysOnTop: w.isAlwaysOnTop(),
            bounds: w.getBounds(),
            bridge: bridgeStatus,
            tabs: lastReport?.tabs.length ?? null,
          }),
      );
      app.quit();
    }, 2500);
  }
});

// Dock click brings sidy back after Hide.
app.on('activate', () => void setHidden(false));
app.on('second-instance', () => void setHidden(false));
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  void bridge?.stop();
});
app.on('window-all-closed', () => {
  // Side keeps running at the edge; quitting is explicit.
});
