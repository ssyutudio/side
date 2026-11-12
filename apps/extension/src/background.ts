// MV3 service worker entry. Hands the real Chrome APIs and WebSocket to startExtension.
import type { ChromeApi } from './api';
import { startExtension } from './app';
import { httpProbe } from './bridge';
import type { ExtensionEnv } from './app';
import type { SocketLike } from './bridge';

const ext = startExtension({
  api: chrome as unknown as ChromeApi,
  tabEvents: chrome.tabs as unknown as ExtensionEnv['tabEvents'],
  groupEvents: chrome.tabGroups as unknown as ExtensionEnv['groupEvents'],
  alarms: chrome.alarms as unknown as ExtensionEnv['alarms'],
  createSocket: (url) => new WebSocket(url) as unknown as SocketLike,
  probe: httpProbe(fetch.bind(globalThis)),
  version: chrome.runtime.getManifest().version,
});

// Wake-ups after a browser start or an update also re-open the link to the app.
chrome.runtime.onStartup.addListener(() => ext.bridge.connect());
chrome.runtime.onInstalled.addListener(() => ext.bridge.connect());
