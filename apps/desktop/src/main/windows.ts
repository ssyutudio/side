// Mini (the small panel beside sidy) and Main (the big window). Mini opens only when the user
// clicks sidy or asks for it, so taking keyboard focus there is expected.
import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import type { EdgeLayout } from './edgeLayout';
import { t } from '../i18n';

const MINI_WIDTH = 444; // panel 388 + 28px room on each side for its shadow
const MAIN_W = 1180;
const MAIN_H = 780;
/** Main leaves this much free on the right for sidy. */
const SIDY_LANE = 132;

export class Windows {
  private mini: BrowserWindow | null = null;
  private main: BrowserWindow | null = null;
  private miniHeight = 560;
  private pendingView: string | null = null;

  constructor(private readonly o: { preload: string; rendererDir: string; edgeLayout: () => EdgeLayout }) {}

  private webPrefs() {
    return { preload: this.o.preload, contextIsolation: true, nodeIntegration: false, sandbox: true };
  }

  private ensureMini(): BrowserWindow {
    if (this.mini && !this.mini.isDestroyed()) return this.mini;
    const w = new BrowserWindow({
      width: MINI_WIDTH,
      height: this.miniHeight,
      type: 'panel',
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      hasShadow: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      show: false,
      alwaysOnTop: true,
      webPreferences: this.webPrefs(),
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    void w.loadFile(join(this.o.rendererDir, 'mini.html'));
    w.webContents.on('did-finish-load', () => {
      if (this.pendingView) w.webContents.send('side:mini.view', this.pendingView);
      this.pendingView = null;
    });
    this.mini = w;
    return w;
  }

  private placeMini() {
    if (!this.mini) return;
    const l = this.o.edgeLayout();
    const area = screen.getPrimaryDisplay().workArea;
    const sidyCenterY = l.window.y + l.hit.y + l.hit.height / 2;
    // The panel's right edge sits just left of sidy; the window adds 28px of shadow room.
    const right = area.x + area.width - (l.sidyHeight + 22) + 28;
    const h = Math.min(this.miniHeight, area.height - 16);
    const y = Math.round(Math.min(Math.max(sidyCenterY - h / 2, area.y + 8), area.y + area.height - h - 8));
    this.mini.setBounds({ x: Math.round(right - MINI_WIDTH), y, width: MINI_WIDTH, height: Math.round(h) });
  }

  openMini(view: 'home' | 'wrap' | 'onemore') {
    const w = this.ensureMini();
    this.placeMini();
    if (w.webContents.isLoading()) this.pendingView = view;
    else w.webContents.send('side:mini.view', view);
    w.show();
    w.focus();
  }

  toggleMini() {
    if (this.mini && !this.mini.isDestroyed() && this.mini.isVisible()) this.closeMini();
    else this.openMini('home');
  }

  closeMini() {
    if (this.mini && !this.mini.isDestroyed()) this.mini.hide();
  }

  resizeMini(height: number) {
    this.miniHeight = height;
    this.placeMini();
  }

  /** sidy moved: Mini, if it is up, stays beside it. */
  followSidy() {
    if (this.miniOpen()) this.placeMini();
  }

  openMain() {
    if (!this.main || this.main.isDestroyed()) {
      const area = screen.getPrimaryDisplay().workArea;
      const width = Math.min(MAIN_W, area.width - SIDY_LANE - 32);
      const height = Math.min(MAIN_H, area.height - 32);
      this.main = new BrowserWindow({
        x: Math.round(area.x + Math.max(16, (area.width - SIDY_LANE - width) / 2)),
        y: Math.round(area.y + Math.max(16, (area.height - height) / 2)),
        width,
        height,
        minWidth: 760,
        minHeight: 520,
        title: 'Side',
        backgroundColor: '#FFFFFF',
        show: false,
        webPreferences: this.webPrefs(),
      });
      void this.main.loadFile(join(this.o.rendererDir, 'main.html'));
      this.main.once('ready-to-show', () => this.main?.show());
    } else {
      if (this.main.isMinimized()) this.main.restore();
      this.main.show();
    }
    this.main.focus();
  }

  private setup: BrowserWindow | null = null;

  openSetup() {
    if (this.setup && !this.setup.isDestroyed()) return void this.setup.focus();
    this.setup = new BrowserWindow({
      width: 700,
      height: 820,
      title: t('Set up Side'),
      backgroundColor: '#F2F3F5',
      resizable: true,
      show: false,
      webPreferences: this.webPrefs(),
    });
    void this.setup.loadFile(join(this.o.rendererDir, 'onboarding.html'));
    this.setup.once('ready-to-show', () => this.setup?.show());
  }

  setupOpen(): boolean {
    return !!this.setup && !this.setup.isDestroyed() && this.setup.isVisible();
  }

  closeSetup() {
    if (this.setup && !this.setup.isDestroyed()) this.setup.close();
    this.setup = null;
  }

  miniOpen(): boolean {
    return !!this.mini && !this.mini.isDestroyed() && this.mini.isVisible();
  }

  all(): BrowserWindow[] {
    return [this.mini, this.main, this.setup].filter((w): w is BrowserWindow => !!w && !w.isDestroyed());
  }
}
