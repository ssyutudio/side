// How a screen talks to the app. Inside Electron it uses the preload bridge; opened as a plain
// page (headless captures) it serves named fixtures: ?state=<name>&view=<name>&bubble=<name>.
import type { ViewState } from '../../main/viewState';
import type { Bubble } from '../../main/speakService';
import { FIXTURES, FIXTURE_BUBBLES, FIXTURE_PREVIEW } from './fixtures';

export interface Toast {
  text: string;
  ms: number;
  kind?: 'hidden';
}

export interface EdgeLayoutMsg {
  hit: { x: number; y: number; width: number; height: number };
  sidyHeight: number;
}

interface Bridge {
  setInteractive(v: boolean): void;
  on(channel: string, cb: (d: unknown) => void): void;
  invoke(channel: string, payload?: unknown): Promise<unknown>;
}

export interface SideApi {
  fixture: boolean;
  params: URLSearchParams;
  invoke<T = unknown>(channel: string, payload?: unknown): Promise<T>;
  onState(cb: (s: ViewState) => void): void;
  onBubble(cb: (b: Bubble | null) => void): void;
  onToast(cb: (t: Toast) => void): void;
  onLayout(cb: (l: EdgeLayoutMsg) => void): void;
  onMiniView(cb: (v: string) => void): void;
  setInteractive(v: boolean): void;
}

export function getApi(): SideApi {
  const params = new URLSearchParams(location.search);
  const bridge = (window as unknown as { side?: Bridge }).side;
  if (bridge) {
    return {
      fixture: false,
      params,
      invoke: <T>(c: string, p?: unknown) => bridge.invoke(c, p) as Promise<T>,
      onState: (cb) => bridge.on('side:state', (d) => cb(d as ViewState)),
      onBubble: (cb) => bridge.on('side:bubble', (d) => cb((d as Bubble) ?? null)),
      onToast: (cb) => bridge.on('side:toast', (d) => cb(d as Toast)),
      onLayout: (cb) => bridge.on('edge:layout', (d) => cb(d as EdgeLayoutMsg)),
      onMiniView: (cb) => bridge.on('side:mini.view', (d) => cb(String(d))),
      setInteractive: (v) => bridge.setInteractive(v),
    };
  }
  const state = FIXTURES[params.get('state') ?? 'day'] ?? FIXTURES.day;
  return {
    fixture: true,
    params,
    invoke: async <T>(channel: string) => {
      if (channel === 'side:state') return state as T;
      if (channel === 'side:wrapup.preview') return FIXTURE_PREVIEW as T;
      return { ok: true } as T;
    },
    onState: (cb) => setTimeout(() => cb(state), 0),
    onBubble: (cb) => {
      const b = params.get('bubble');
      if (b && FIXTURE_BUBBLES[b]) setTimeout(() => cb(FIXTURE_BUBBLES[b]), 0);
    },
    onToast: (cb) => {
      const t = params.get('toast');
      if (t) setTimeout(() => cb({ text: t, ms: 600000, kind: t.startsWith('sidy is hidden') ? 'hidden' : undefined }), 0);
    },
    onLayout: (cb) => {
      const size = Number(params.get('sz') ?? 40);
      const side = Math.max(48, size + 8);
      const y = Math.round((window.innerHeight - side) / 2);
      setTimeout(() => cb({ hit: { x: window.innerWidth - side, y, width: side, height: side }, sidyHeight: size }), 0);
    },
    onMiniView: () => undefined,
    setInteractive: () => undefined,
  };
}
