// The sidy window: transparent, always on top (including over full-screen Spaces), never takes
// keyboard focus, and lets clicks through everywhere except sidy and its bubble.
import { BrowserWindow, ipcMain, screen } from 'electron';
import type { SidySize } from '@side/shared';
import { anchorAt, edgeLayout, type EdgeLayout } from './edgeLayout';

export interface EdgeWindow {
  win: BrowserWindow;
  layout: EdgeLayout;
  resize(size: SidySize): EdgeLayout;
  /** Moves sidy so its center is at screen point y, and returns the anchor to remember. */
  moveTo(y: number): number;
  show(): void;
  hide(): void;
  isVisible(): boolean;
}

export function createEdgeWindow(opts: { preload: string; page: string; size: SidySize; anchor?: number }): EdgeWindow {
  const workArea = () => screen.getPrimaryDisplay().workArea;
  let currentSize = opts.size;
  let anchor = opts.anchor;
  let layout = edgeLayout(workArea(), currentSize, anchor);

  const win = new BrowserWindow({
    ...layout.window,
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
    focusable: false,
    skipTaskbar: true,
    acceptFirstMouse: true,
    alwaysOnTop: true,
    show: false,
    webPreferences: {
      preload: opts.preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.setAlwaysOnTop(true, 'screen-saver');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });

  // The renderer reports whether the pointer is over sidy or the bubble.
  const onInteractive = (e: Electron.IpcMainEvent, interactive: unknown) => {
    if (e.sender !== win.webContents) return;
    win.setIgnoreMouseEvents(interactive !== true, { forward: true });
  };
  ipcMain.on('edge:interactive', onInteractive);
  win.on('closed', () => ipcMain.removeListener('edge:interactive', onInteractive));

  const sendLayout = () => win.webContents.send('edge:layout', { hit: layout.hit, sidyHeight: layout.sidyHeight });
  win.webContents.on('did-finish-load', sendLayout);

  const relayout = () => {
    win.setBounds(layout.window);
    sendLayout();
  };
  screen.on('display-metrics-changed', () => {
    layout = edgeLayout(workArea(), currentSize, anchor);
    relayout();
  });

  void win.loadFile(opts.page);

  return {
    win,
    get layout() {
      return layout;
    },
    resize(size: SidySize) {
      currentSize = size;
      layout = edgeLayout(workArea(), size, anchor);
      relayout();
      return layout;
    },
    moveTo(y: number) {
      anchor = anchorAt(workArea(), y);
      const next = edgeLayout(workArea(), currentSize, anchor);
      const moved = next.window.y !== layout.window.y || next.hit.y !== layout.hit.y;
      layout = next;
      if (moved) relayout();
      return anchor;
    },
    show() {
      // showInactive keeps the keyboard where the user is typing.
      win.showInactive();
    },
    hide() {
      win.hide();
    },
    isVisible() {
      return win.isVisible();
    },
  };
}
