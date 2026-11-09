// Electron main process: owns the data file, the bridge to the extension and the sidy window.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, powerMonitor } from 'electron';
import { join } from 'node:path';
import { BRIDGE_HOST, BRIDGE_PORT, COMMAND_TIMEOUT_MS, type TabsReport } from '@side/shared';
import { loadConfig } from './config';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { Bridge } from './bridge';
import { createEdgeWindow, type EdgeWindow } from './edgeWindow';
import { llmFromKey } from './llmTransport';
import { SideController } from './controller';
import { IPC_CHANNELS, routeIpc } from './ipcRoutes';
import { watchReturns } from './returnWatcher';
import { parseDemoCommand } from './demoClock';
import { DemoClock } from '../core/clock';

app.setName('Side');
app.setPath('userData', join(app.getPath('appData'), 'Side'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const config = loadConfig(join(app.getAppPath(), '.env.local'));
const store = new JsonStore<AppData>(join(app.getPath('userData'), 'side-data.json'), defaultAppData);
const clock = new DemoClock();

let edge: EdgeWindow | null = null;
let bridge: Bridge | null = null;
let ctl: SideController | null = null;

function installMenu() {
  // Without an Edit menu, Cmd+C / Cmd+V do not work in text fields on macOS.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  );
}

function logReport(report: TabsReport) {
  // First card 2 check: the number of tabs the app received, on the Dock icon and in this terminal.
  app.dock?.setBadge(String(report.tabs.length));
  const withPos = report.tabs.filter((t) => t.position && t.position.top > 0);
  console.log(
    `[side] report: ${report.tabs.length} tabs, ${withPos.length} with a position, skipped ${report.skipped.excluded} excluded / ${report.skipped.incognito} incognito / ${report.skipped.internal} internal`,
  );
  for (const t of withPos) {
    const p = t.position!;
    console.log(`[side]   ${new URL(t.url).host} ${p.scroller}${p.selector ? ` ${p.selector}` : ''} top=${Math.round(p.top)} ratio=${p.ratio.toFixed(2)}`);
  }
}

function registerShortcut(accel: string): boolean {
  globalShortcut.unregisterAll();
  try {
    return globalShortcut.register(accel, () => void ctl?.setHidden(edge?.isVisible() ?? false));
  } catch {
    return false;
  }
}

function pushToWindows(channel: string, data: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
}

async function start() {
  installMenu();
  await store.load();
  if (store.loadState === 'recovered') console.warn('[side] data file was unreadable JSON and was moved aside:', store.movedAside);
  if (store.loadState === 'unreadable') console.warn('[side] data file could not be read; Side will not overwrite it this session.');
  clock.setOffset(store.get().demoOffsetMs);

  const llmEnabled = store.get().settings.llmEnabled;
  console.log(`[side] llm key ${config.anthropicKey ? 'present' : 'absent'}, llm ${llmEnabled ? 'on' : 'off'}`);
  const transport = llmFromKey(config.anthropicKey);

  bridge = new Bridge({
    host: BRIDGE_HOST,
    port: BRIDGE_PORT,
    appVersion: app.getVersion(),
    timeoutMs: COMMAND_TIMEOUT_MS,
    getPinnedOrigin: () => store.get().pairedOrigin,
    pinOrigin: (origin) => store.update((d) => ({ ...d, pairedOrigin: origin })).then(() => undefined),
    getExclusions: () => store.get().settings.excludedDomains,
    onReport: (report) => {
      logReport(report);
      void ctl?.onReport(report);
    },
    onStatus: (s) => {
      console.log(`[side] extension ${s}`);
      ctl?.onBridgeStatus(s);
    },
  });

  edge = createEdgeWindow({
    preload: join(__dirname, 'preload.js'),
    page: join(__dirname, 'static', 'edge-placeholder.html'),
    size: store.get().settings.sidySize,
  });

  ctl = new SideController({
    store,
    bridge,
    clock,
    llm: transport ? (req) => transport.complete({ system: req.system, prompt: req.user }) : null,
    edge,
    registerShortcut,
    push: (state) => pushToWindows('side:state', state),
    renderBubble: (bubble) => edge?.win.webContents.send('side:bubble', bubble),
    openMain: () => console.log('[side] Main opens here once its screen is approved.'),
  });

  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, (_e, payload) => routeIpc(ctl!, channel, payload));
  }

  try {
    await bridge.start();
  } catch (err) {
    console.error('[side] could not open the local connection for the extension:', (err as Error).message);
  }

  const demo = parseDemoCommand(process.env.SIDE_DEMO);
  if (demo) {
    await ctl.demo(demo);
    console.log(`[side] demo clock: ${demo} -> ${new Date(clock.now()).toString()}`);
  }

  if (!store.get().hidden) edge.win.once('ready-to-show', () => edge?.show());
  if (!registerShortcut(store.get().settings.shortcut)) console.warn(`[side] shortcut ${store.get().settings.shortcut} is taken by another app`);

  watchReturns({
    power: powerMonitor,
    onTrigger: (t) => void ctl?.speak.trigger(t),
    onAsleep: (asleep) => {
      if (ctl) ctl.speak.asleep = asleep;
    },
  });
  setInterval(() => void ctl?.speak.tick(), 30_000);
  void ctl.speak.trigger('app_start');

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
            bridge: bridge?.status,
            channels: IPC_CHANNELS.length,
            step: ctl?.state().step?.id ?? null,
            demoOffsetMs: store.get().demoOffsetMs,
          }),
      );
      app.quit();
    }, 2500);
  }
}

app.whenReady().then(start);

// Dock click brings sidy back after Hide.
app.on('activate', () => void ctl?.setHidden(false));
app.on('second-instance', () => void ctl?.setHidden(false));
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  void bridge?.stop();
});
app.on('window-all-closed', () => {
  // Side keeps running at the edge; quitting is explicit.
});
