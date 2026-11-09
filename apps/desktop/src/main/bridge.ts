// Local WebSocket bridge to the Chrome extension, bound to 127.0.0.1 only.
// Pairing needs no typing: the first chrome-extension:// origin that connects is pinned, and every
// other origin is refused. Commands carry an id and a timeout; the app only reports what the
// extension confirmed, and anything it did not hear back about is "unconfirmed".
import { createServer, type IncomingMessage, type Server } from 'node:http';
import type { Duplex } from 'node:stream';
import { WebSocketServer, WebSocket } from 'ws';
import {
  encodeMessage,
  makeMessage,
  parseMessage,
  type CmdErrorKind,
  type Message,
  type MessageType,
  type PayloadOf,
  type TabsReport,
} from '@side/shared';

export type BridgeStatus = 'waiting' | 'connected' | 'disconnected';

export type CommandOutcome =
  | { status: 'ok'; result: unknown }
  | { status: 'failed'; error: { kind: CmdErrorKind; message: string } }
  | { status: 'unconfirmed'; reason: 'timeout' | 'disconnected' | 'not_connected' };

export interface BridgeOptions {
  host: string;
  port: number;
  appVersion: string;
  timeoutMs: number;
  getPinnedOrigin: () => string | null;
  pinOrigin: (origin: string) => void | Promise<void>;
  getExclusions: () => string[];
  onReport: (report: TabsReport) => void;
  onStatus: (status: BridgeStatus) => void;
  /** A result that arrived after its command already timed out. Never applied automatically. */
  onLateResult?: (msg: Message) => void;
}

const EXTENSION_ORIGIN = /^chrome-extension:\/\/[a-p]{32}$/;

interface Pending {
  resolve: (o: CommandOutcome) => void;
  timer: ReturnType<typeof setTimeout>;
}

export class Bridge {
  private http: Server | null = null;
  private wss: WebSocketServer | null = null;
  private socket: WebSocket | null = null;
  private pending = new Map<string, Pending>();
  private expired = new Set<string>();
  status: BridgeStatus = 'waiting';
  lastSeenAt: number | null = null;

  constructor(private readonly opts: BridgeOptions) {}

  /** Starts listening; resolves with the bound port. */
  start(): Promise<number> {
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
    this.http = createServer((_req, res) => {
      res.writeHead(426).end();
    });
    this.http.on('upgrade', (req, socket, head) => this.handleUpgrade(req, socket, head));
    return new Promise((resolve, reject) => {
      this.http!.once('error', reject);
      this.http!.listen(this.opts.port, this.opts.host, () => {
        const addr = this.http!.address();
        this.setStatus('waiting');
        resolve(typeof addr === 'object' && addr ? addr.port : this.opts.port);
      });
    });
  }

  async stop(): Promise<void> {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.resolve({ status: 'unconfirmed', reason: 'disconnected' });
    }
    this.pending.clear();
    this.socket?.terminate();
    this.socket = null;
    this.wss?.close();
    await new Promise<void>((r) => (this.http ? this.http.close(() => r()) : r()));
    this.http = null;
  }

  private handleUpgrade(req: IncomingMessage, socket: Duplex, head: Buffer) {
    const origin = req.headers.origin ?? '';
    const pinned = this.opts.getPinnedOrigin();
    const allowed = EXTENSION_ORIGIN.test(origin) && (pinned === null || pinned === origin);
    if (!allowed) {
      socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    if (pinned === null) void this.opts.pinOrigin(origin);
    this.wss!.handleUpgrade(req, socket, head, (ws) => this.attach(ws));
  }

  private attach(ws: WebSocket) {
    // A service worker that woke up again replaces the old connection.
    if (this.socket && this.socket !== ws) this.socket.terminate();
    this.socket = ws;
    ws.on('message', (data) => this.receive(ws, String(data)));
    ws.on('close', () => this.detach(ws));
    ws.on('error', () => this.detach(ws));
  }

  private detach(ws: WebSocket) {
    if (this.socket !== ws) return;
    this.socket = null;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      this.expired.add(id);
      p.resolve({ status: 'unconfirmed', reason: 'disconnected' });
    }
    this.pending.clear();
    if (this.status === 'connected') this.setStatus('disconnected');
  }

  private receive(ws: WebSocket, raw: string) {
    const parsed = parseMessage(raw);
    if (!parsed.ok) return; // dropped on purpose: the app stays up and ignores it
    const msg = parsed.msg;
    this.lastSeenAt = Date.now();
    if (this.status !== 'connected' && this.socket === ws) this.setStatus('connected');
    switch (msg.type) {
      case 'hello':
        this.send('welcome', { appVersion: this.opts.appVersion });
        this.send('exclusions.set', { domains: this.opts.getExclusions() });
        this.send('tabs.request', {});
        break;
      case 'ping':
        this.send('pong', {});
        break;
      case 'tabs.report':
        this.opts.onReport(msg.payload as TabsReport);
        break;
      case 'cmd.result':
        this.settle(msg);
        break;
      default:
        break; // app -> extension types coming back are ignored
    }
  }

  private settle(msg: Message) {
    const id = msg.replyTo;
    if (!id) return;
    const p = this.pending.get(id);
    if (!p) {
      if (this.expired.has(id)) this.opts.onLateResult?.(msg);
      return;
    }
    clearTimeout(p.timer);
    this.pending.delete(id);
    const payload = msg.payload as PayloadOf<'cmd.result'>;
    if (payload.ok) p.resolve({ status: 'ok', result: payload.result });
    else p.resolve({ status: 'failed', error: payload.error ?? { kind: 'chrome', message: 'Chrome reported a failure.' } });
  }

  private setStatus(s: BridgeStatus) {
    this.status = s;
    this.opts.onStatus(s);
  }

  /** Fire-and-forget message. Returns false when no extension is connected. */
  send<T extends MessageType>(type: T, payload: PayloadOf<T>): boolean {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return false;
    this.socket.send(encodeMessage(makeMessage(type, payload)));
    return true;
  }

  /** Sends a command and waits for the extension to confirm it, up to timeoutMs. */
  command<T extends MessageType>(type: T, payload: PayloadOf<T>): Promise<CommandOutcome> {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN || this.status !== 'connected') {
      return Promise.resolve({ status: 'unconfirmed', reason: 'not_connected' });
    }
    const msg = makeMessage(type, payload);
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.pending.delete(msg.id);
        this.expired.add(msg.id);
        resolve({ status: 'unconfirmed', reason: 'timeout' });
      }, this.opts.timeoutMs);
      this.pending.set(msg.id, { resolve, timer });
      this.socket!.send(encodeMessage(msg));
    });
  }
}
