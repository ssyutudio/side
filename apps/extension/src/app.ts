// Wires the extension together: bridge to the app, tab events to debounced reports, position
// capture when the user leaves a tab, and command handling. background.ts passes the real Chrome.
import { makeMessage } from '@side/shared';
import type { Message } from '@side/shared';
import type { ChromeApi, TabLike } from './api';
import { Bridge } from './bridge';
import type { SocketFactory } from './bridge';
import { createCommandRunner } from './commands';
import { PositionTracker } from './position';
import { createDebouncer, loadExclusions, saveExclusions, snapshotTabs } from './tabs';

interface EventLike<T extends (...args: any[]) => void> {
  addListener(fn: T): void;
}

export interface ExtensionEnv {
  api: ChromeApi;
  tabEvents: {
    onCreated: EventLike<(tab: TabLike) => void>;
    onRemoved: EventLike<(tabId: number, info: unknown) => void>;
    onUpdated: EventLike<(tabId: number, change: Record<string, unknown>, tab?: TabLike) => void>;
    onActivated: EventLike<(info: { tabId: number; windowId: number }) => void>;
  };
  groupEvents?: {
    onUpdated: EventLike<(group: unknown) => void>;
    onRemoved?: EventLike<(group: unknown) => void>;
  };
  alarms?: {
    create(name: string, info: { periodInMinutes: number }): void;
    onAlarm: EventLike<(alarm: { name: string }) => void>;
  };
  createSocket: SocketFactory;
  version: string;
  now?: () => number;
}

export const KEEPALIVE_ALARM = 'side-keepalive';
const REPORT_DEBOUNCE_MS = 500;
const CAPTURE_TIMEOUT_MS = 1500;
const REPORT_ON: readonly string[] = ['status', 'title', 'url', 'groupId', 'pinned', 'audible'];

export function startExtension(env: ExtensionEnv) {
  const { api } = env;
  const now = env.now ?? (() => Date.now());
  const tracker = new PositionTracker(api, { timeoutMs: CAPTURE_TIMEOUT_MS });
  const lastActive = new Map<number, number>();
  const runCommand = createCommandRunner({
    api,
    getExclusions: () => loadExclusions(api),
    now,
    openOptions: { loadTimeoutMs: 15_000, restoreWaitMs: 6_000 },
  });

  const sendReport = async (): Promise<void> => {
    if (!bridge.isOpen()) return;
    const tabs = await api.tabs.query({});
    const report = await snapshotTabs(api, await loadExclusions(api), tracker.matching(tabs), now());
    bridge.send(makeMessage('tabs.report', report));
  };
  const scheduleReport = createDebouncer(() => void sendReport().catch(() => undefined), REPORT_DEBOUNCE_MS);

  const captureActiveTabs = async () => {
    const active = await api.tabs.query({ active: true });
    await Promise.all(active.map((t) => tracker.capture(t)));
  };

  const onMessage = (msg: Message) => {
    switch (msg.type) {
      case 'welcome':
        void sendReport().catch(() => undefined);
        return;
      case 'exclusions.set':
        void saveExclusions(api, (msg as Message<'exclusions.set'>).payload.domains)
          .then(() => sendReport())
          .catch(() => undefined);
        return;
      case 'tabs.request':
        void captureActiveTabs()
          .catch(() => undefined)
          .then(() => sendReport())
          .catch(() => undefined);
        return;
      default:
        if (msg.type.startsWith('cmd.') && msg.type !== 'cmd.result') {
          void runCommand(msg).then((reply) => {
            if (reply) bridge.send(reply);
            scheduleReport();
          });
        }
    }
  };

  const bridge = new Bridge({
    createSocket: env.createSocket,
    extVersion: env.version,
    onMessage,
    onStatus: (connected) => {
      if (connected) scheduleReport();
    },
  });

  env.tabEvents.onCreated.addListener(() => scheduleReport());
  env.tabEvents.onRemoved.addListener((tabId) => {
    void tracker.forget(tabId).catch(() => undefined);
    scheduleReport();
  });
  env.tabEvents.onUpdated.addListener((_id, change) => {
    if (REPORT_ON.some((k) => k in change)) scheduleReport();
  });
  env.tabEvents.onActivated.addListener(({ tabId, windowId }) => {
    const left = lastActive.get(windowId);
    lastActive.set(windowId, tabId);
    const capture = left !== undefined && left !== tabId
      ? api.tabs.get(left).then((t) => tracker.capture(t)).catch(() => null)
      : Promise.resolve(null);
    void capture.then(() => scheduleReport());
  });
  env.groupEvents?.onUpdated.addListener(() => scheduleReport());
  env.groupEvents?.onRemoved?.addListener(() => scheduleReport());

  env.alarms?.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });
  env.alarms?.onAlarm.addListener((alarm) => {
    if (alarm.name === KEEPALIVE_ALARM) bridge.connect();
  });

  const ready = (async () => {
    await tracker.load().catch(() => undefined);
    const active = await api.tabs.query({ active: true }).catch(() => [] as TabLike[]);
    for (const t of active) if (t.id !== undefined) lastActive.set(t.windowId, t.id);
    bridge.connect();
  })();

  return { bridge, tracker, sendReport, ready };
}
