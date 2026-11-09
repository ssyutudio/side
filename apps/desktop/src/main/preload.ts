// The only bridge between renderer pages and the main process. No keys or file access here.
import { contextBridge, ipcRenderer } from 'electron';

type Listener = (data: unknown) => void;
const EVENTS = new Set(['side:state', 'side:bubble', 'side:toast', 'side:mini.view', 'edge:layout']);

contextBridge.exposeInMainWorld('side', {
  setInteractive(interactive: boolean) {
    ipcRenderer.send('edge:interactive', interactive === true);
  },
  on(channel: string, cb: Listener) {
    if (!EVENTS.has(channel)) return;
    ipcRenderer.on(channel, (_e, data) => cb(data));
  },
  invoke(channel: string, payload?: unknown) {
    if (!channel.startsWith('side:')) return Promise.reject(new Error('unknown channel'));
    return ipcRenderer.invoke(channel, payload);
  },
});
