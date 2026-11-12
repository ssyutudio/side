// WebSocket client from the extension service worker to the Side app on this Mac.
// Reconnects on its own with backoff, pings so the MV3 worker stays awake while connected,
// and drops any frame that fails parseMessage. Before each socket it can ask quietly whether the
// app is there at all: Chrome lists every refused WebSocket under the extension's Errors, so
// without the probe a closed app fills that page while the extension keeps retrying.
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
  /** Is the app listening? Asked before each socket; false means wait and ask again later. */
  probe?: () => Promise<boolean>;
}

/**
 * A probe that never shows up as an error: the app answers any plain HTTP request (426), and a
 * refused fetch rejects quietly. Opaque (no-cors) is enough, nothing is read.
 */
export function httpProbe(fetchFn: typeof fetch, url = `http://${BRIDGE_HOST}:${BRIDGE_PORT}/`, timeoutMs = 2000): () => Promise<boolean> {
  return () =>
    fetchFn(url, { mode: 'no-cors', cache: 'no-store', signal: AbortSignal.timeout(timeoutMs) }).then(
      () => true,
      () => false,
    );
}

/** After this many "not there" answers in a row the socket is tried anyway, so a probe that can't get through never keeps the extension from connecting. */
export const PROBE_TRUST_LIMIT = 8;

const OPEN = 1;

export class Bridge {
  private socket: SocketLike | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private nextDelay = RECONNECT_MIN_MS;
  private open = false;
  private stopped = false;
  private probing = false;
  private notThere = 0;
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
    if (this.socket || this.probing) return;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    const probe = this.opts.probe;
    if (!probe || this.notThere + 1 >= PROBE_TRUST_LIMIT) return this.openSocket();
    this.probing = true;
    void probe()
      .catch(() => false)
      .then((there) => {
        this.probing = false;
        if (this.stopped || this.socket) return;
        if (there) return this.openSocket();
        this.notThere++;
        this.scheduleReconnect();
      });
  }

  private openSocket(): void {
    this.notThere = 0;
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
