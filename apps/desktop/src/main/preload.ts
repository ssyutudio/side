// The only bridge between renderer pages and the main process. No keys or file access here.
import { contextBridge, ipcRenderer } from 'electron';

type Listener = (data: unknown) => void;

contextBridge.exposeInMainWorld('side', {
  setInteractive(interactive: boolean) {
    ipcRenderer.send('edge:interactive', interactive === true);
  },
  onLayout(cb: Listener) {
    ipcRenderer.on('edge:layout', (_e, data) => cb(data));
  },
  onState(cb: Listener) {
    ipcRenderer.on('side:state', (_e, data) => cb(data));
  },
  invoke(channel: string, payload?: unknown) {
    if (!channel.startsWith('side:')) return Promise.reject(new Error('unknown channel'));
    return ipcRenderer.invoke(channel, payload);
  },
});
