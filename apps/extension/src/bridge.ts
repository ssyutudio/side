// WebSocket client from the extension service worker to the Side app on this Mac.
// Reconnects on its own with backoff, pings so the MV3 worker stays awake while connected,
// and drops any frame that fails parseMessage.
import {
  BRIDGE_HOST,
  BRIDGE_PORT,
  KEEPALIVE_MS,
  RECONNECT_MIN_MS,
  RECONNECT_MAX_MS,
  parseMessage,
  makeMessage,
  encodeMessage,
} from '@side/shared';
import type { Message } from '@side/shared';

export interface SocketLike {
  readyState: number;
  send(data: string): void;
  close(): void;
  onopen: ((ev?: unknown) => void) | null;
  onclose: ((ev?: unknown) => void) | null;
  onerror: ((ev?: unknown) => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
}

export type SocketFactory = (url: string) => SocketLike;

export interface BridgeOptions {
  createSocket: SocketFactory;
  extVersion: string;
  onMessage: (msg: Message) => void;
  onStatus?: (connected: boolean) => void;
  url?: string;
}

const OPEN = 1;

export class Bridge {
  private socket: SocketLike | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private nextDelay = RECONNECT_MIN_MS;
  private open = false;
  private stopped = false;
  private readonly url: string;

  constructor(private readonly opts: BridgeOptions) {
    this.url = opts.url ?? `ws://${BRIDGE_HOST}:${BRIDGE_PORT}`;
  }

  isOpen(): boolean {
    return this.open;
  }

  /** Opens a socket unless one is already open or connecting. Safe to call often (alarms, wake-ups). */
  connect(): void {
    this.stopped = false;
    if (this.socket) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    let socket: SocketLike;
    try {
      socket = this.opts.createSocket(this.url);
    } catch {
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    socket.onopen = () => this.handleOpen(socket);
    socket.onmessage = (ev) => this.handleFrame(ev.data);
    socket.onerror = () => {
      // A close event always follows; reconnect is handled there.
    };
    socket.onclose = () => this.handleClose(socket);
  }

  send(msg: Message): boolean {
    if (!this.open || !this.socket || this.socket.readyState !== OPEN) return false;
    try {
      this.socket.send(encodeMessage(msg));
      return true;
    } catch {
      return false;
    }
  }

  /** Stops for good (used by tests and on shutdown). */
  close(): void {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.socket?.close();
  }

  private handleOpen(socket: SocketLike): void {
    if (socket !== this.socket) return;
    this.open = true;
    this.nextDelay = RECONNECT_MIN_MS;
    this.send(makeMessage('hello', { extVersion: this.opts.extVersion }));
    this.pingTimer = setInterval(() => this.send(makeMessage('ping', {})), KEEPALIVE_MS);
    this.opts.onStatus?.(true);
  }

  private handleFrame(data: unknown): void {
    const parsed = parseMessage(data);
    if (!parsed.ok) return;
    if (parsed.msg.type === 'pong') return;
    try {
      this.opts.onMessage(parsed.msg);
    } catch {
      // A failing handler must not take the connection down.
    }
  }

  private handleClose(socket: SocketLike): void {
    if (socket !== this.socket) return;
    this.socket = null;
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    const wasOpen = this.open;
    this.open = false;
    if (wasOpen) this.opts.onStatus?.(false);
    if (!this.stopped) this.scheduleReconnect();
  }

  private scheduleReconnect(): void {
    if (this.retryTimer || this.stopped) return;
    const delay = this.nextDelay;
    this.nextDelay = Math.min(this.nextDelay * 2, RECONNECT_MAX_MS);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.connect();
    }, delay);
  }
}
