// Electron main process: owns the data file, the bridge to the extension and the sidy window.
import { app, BrowserWindow, globalShortcut, ipcMain, Menu, powerMonitor, shell, systemPreferences } from 'electron';
import { join } from 'node:path';
import { BRIDGE_HOST, BRIDGE_PORT, COMMAND_TIMEOUT_MS, type TabsReport } from '@side/shared';
import { loadConfig } from './config';
import { JsonStore } from './store';
import { defaultAppData, type AppData } from './appData';
import { Bridge } from './bridge';
import { createEdgeWindow, type EdgeWindow } from './edgeWindow';
import { llmFromKey } from './llmTransport';
import { SideController } from './controller';
import { desktopApps } from './connectors/desktopApps';
import { installedApps } from './connectors/apps/index.mjs';
import { watchInbox } from './connectors/claudeCode';
import { IPC_CHANNELS, routeIpc } from './ipcRoutes';
import { watchReturns } from './returnWatcher';
import { parseDemoCommand } from './demoClock';
import { DemoClock } from '../core/clock';
import { buildUsagePayload, uploadUsage, USAGE_ENDPOINT } from './usageUpload';
import { mayReact, newlyAudible, type ReactionKind } from '../core/reactions';
import { Windows } from './windows';
import { routeWindow, WINDOW_CHANNELS } from './windowRoutes';

// Native controls and menus stay in English whatever the system language is.
app.commandLine.appendSwitch('lang', 'en-US');
app.setName('Side');
// SIDE_USER_DATA points checks and rehearsals at a throwaway folder, so a test never pairs or
// writes into the real data file.
app.setPath('userData', process.env.SIDE_USER_DATA || join(app.getPath('appData'), 'Side'));

if (!app.requestSingleInstanceLock()) {
  app.quit();
}

const config = loadConfig(join(app.getAppPath(), '.env.local'));
const store = new JsonStore<AppData>(join(app.getPath('userData'), 'side-data.json'), defaultAppData);
const clock = new DemoClock();

let edge: EdgeWindow | null = null;
let bridge: Bridge | null = null;
let ctl: SideController | null = null;
let windows: Windows | null = null;
let hideTimer: ReturnType<typeof setTimeout> | undefined;

/** Hide: a toast where sidy was, then nothing on screen. Show: sidy is back at once. */
const edgePort = {
  resize: (size: Parameters<EdgeWindow['resize']>[0]) => edge?.resize(size),
  show: () => {
    clearTimeout(hideTimer);
    edge?.show();
  },
  hide: () => {
    windows?.closeMini();
    edge?.win.webContents.send('side:toast', { text: '', ms: 6000, kind: 'hidden' });
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => edge?.hide(), 6000);
  },
};

function installMenu() {
  // Without an Edit menu, Cmd+C / Cmd+V do not work in text fields on macOS.
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([{ role: 'appMenu' }, { role: 'editMenu' }, { role: 'windowMenu' }]),
  );
}

function logReport(report: TabsReport) {
  // Terminal only: how many tabs arrived (Mini shows the count; no Dock badge, it reads like a backlog).
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

const reactLast: Partial<Record<ReactionKind, number>> = {};
let prevReport: TabsReport | null = null;
/** sidy's little reactions: decided here with the real state, played once by the edge page. */
function react(kind: ReactionKind): boolean {
  const d = store.get();
  const ok = mayReact(kind, {
    now: clock.now(),
    enabled: d.settings.reactions !== false,
    hidden: d.hidden,
    focusUntil: d.focusUntil,
    quietHours: d.settings.quietHours,
    bubbleShowing: !!ctl?.speak.bubble,
    reducedMotion: systemPreferences.getAnimationSettings().prefersReducedMotion,
    last: reactLast,
  });
  if (!ok) return false;
  reactLast[kind] = clock.now();
  edge?.win.webContents.send('side:react', { kind });
  return true;
}

let lastUpload = 0;
/** Anonymous counts (numbers + install id), only when the user turned it on; at most every 10 minutes. */
function maybeUpload(force = false) {
  const d = store.get();
  if (!d.settings.uploadEnabled || !ctl) return;
  if (!force && Date.now() - lastUpload < 10 * 60_000) return;
  lastUpload = Date.now();
  void uploadUsage({ enabled: true, endpoint: USAGE_ENDPOINT, payload: buildUsagePayload(ctl.state().numbers, d.installId), fetch }).then((r) =>
    console.log(`[side] anonymous counts: ${r}`),
  );
}

function pushToWindows(channel: string, data: unknown) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) w.webContents.send(channel, data);
  }
}

async function start() {
  installMenu();
  // sidy is the app icon too: the same drawing from the Dock to the edge.
  app.dock?.setIcon(join(app.getAppPath(), 'apps', 'desktop', 'assets', 'icon.png'));
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
      const started = newlyAudible(prevReport, report);
      prevReport = report;
      if (started) react(started);
      void ctl?.onReport(report);
    },
    onStatus: (s) => {
      console.log(`[side] extension ${s}`);
      ctl?.onBridgeStatus(s);
    },
  });

  edge = createEdgeWindow({
    preload: join(__dirname, 'preload.js'),
    page: join(__dirname, 'renderer', 'edge.html'),
    size: store.get().settings.sidySize,
  });
  windows = new Windows({
    preload: join(__dirname, 'preload.js'),
    rendererDir: join(__dirname, 'renderer'),
    edgeLayout: () => edge!.layout,
  });

  ctl = new SideController({
    store,
    bridge,
    clock,
    llm: transport ? (req) => transport.complete({ system: req.system, prompt: req.user }) : null,
    apps: desktopApps,
    installedApps: () => installedApps(),
    edge: edgePort,
    registerShortcut,
    push: (state) => {
      pushToWindows('side:state', state);
      maybeUpload();
    },
    renderBubble: (bubble) => {
      // While Mini is open the user is already talking to Side: no bubble on top of it.
      if (bubble && windows?.miniOpen()) return void setTimeout(() => ctl?.speak.clear(), 0);
      edge?.win.webContents.send('side:bubble', bubble);
    },
    openMain: () => windows?.openMain(),
    greetOnConnect: () => !windows?.setupOpen(),
  });

  for (const channel of IPC_CHANNELS) {
    ipcMain.handle(channel, (_e, payload) => routeIpc(ctl!, channel, payload));
  }
  const windowPort = {
    // One thing at a time beside sidy: opening Mini puts the bubble away.
    openMini: (v: 'home' | 'wrap' | 'onemore') => {
      ctl?.speak.clear();
      windows?.openMini(v);
    },
    toggleMini: () => {
      ctl?.speak.clear();
      windows?.toggleMini();
    },
    closeMini: () => windows?.closeMini(),
    resizeMini: (h: number) => windows?.resizeMini(h),
    toast: (text: string, ms: number) => edge?.win.webContents.send('side:toast', { text, ms }),
    checkConnection: async () => {
      for (let i = 0; i < 15 && bridge?.status !== 'connected'; i++) await new Promise((r) => setTimeout(r, 200));
      ctl?.publish();
      return bridge?.status ?? 'waiting';
    },
    revealData: () => shell.showItemInFolder(store.path),
    setupInfo: () => ({ extPath: join(app.getAppPath(), 'apps', 'extension', 'dist') }),
    finishSetup: () => {
      windows?.closeSetup();
      void ctl?.greetFirstRun();
    },
  };
  for (const channel of WINDOW_CHANNELS) {
    ipcMain.handle(channel, (_e, payload) => routeWindow(windowPort, channel, payload));
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
  // First launch: walk through connecting Chrome before sidy says anything.
  if (!store.get().firstRunDone && !store.get().pairedOrigin) windows.openSetup();
  if (!registerShortcut(store.get().settings.shortcut)) console.warn(`[side] shortcut ${store.get().settings.shortcut} is taken by another app`);

  watchReturns({
    power: powerMonitor,
    // Unlock: one stretch first; the return bubble, if any, follows it.
    onTrigger: (t) => {
      console.log(`[side] return moment: ${t}`);
      if (t !== 'unlock') return void ctl?.speak.trigger(t);
      // Wait until the lock screen has faded, so the stretch is seen; the bubble (if any) follows it.
      setTimeout(() => {
        const played = react('stretch');
        console.log(`[side] stretch ${played ? 'played' : 'skipped (off, hidden, focus, quiet hours, a bubble, Reduce Motion, or played in the last 10 min)'}`);
        if (played) setTimeout(() => void ctl?.speak.trigger(t), 2300);
        else void ctl?.speak.trigger(t);
      }, 800);
    },
    onAsleep: (asleep) => {
      if (ctl) ctl.speak.asleep = asleep;
    },
  });
  setInterval(() => void ctl?.speak.tick(), 30_000);
  void ctl.speak.trigger('app_start');

  // SIDE_OPEN=mini|wrap|onemore|main opens that window at launch (checks and recording).
  const open = process.env.SIDE_OPEN;
  if (open === 'main') setTimeout(() => windows?.openMain(), 800);
  else if (open === 'mini' || open === 'wrap' || open === 'onemore') setTimeout(() => windows?.openMini(open === 'mini' ? 'home' : open), 1500);

  void ctl.conn.refresh();

  // Claude Code hook notes (scripts/claude-code-hook.mjs): recorded only, nothing is run.
  watchInbox(join(app.getPath('userData'), 'inbox'), { now: () => clock.now() }, (runs) => {
    console.log(`[side] claude code finished: ${runs.map((r) => r.name).join(', ')}`);
    void ctl?.onAgentRuns(runs);
  });

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

// Dock click brings sidy back after Hide; otherwise it opens Main.
app.on('activate', () => {
  if (store.get().hidden) void ctl?.setHidden(false);
  else windows?.openMain();
});
app.on('second-instance', () => void ctl?.setHidden(false));
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  void bridge?.stop();
});
app.on('window-all-closed', () => {
  // Side keeps running at the edge; quitting is explicit.
});
