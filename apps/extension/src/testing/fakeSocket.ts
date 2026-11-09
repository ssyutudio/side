// A WebSocket stand-in for tests. Mirrors the browser WebSocket surface the bridge uses.
import type { SocketLike } from '../bridge';

export class FakeSocket implements SocketLike {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSED = 3;
  readyState = FakeSocket.CONNECTING;
  sent: string[] = [];
  onopen: ((ev?: unknown) => void) | null = null;
  onclose: ((ev?: unknown) => void) | null = null;
  onerror: ((ev?: unknown) => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;

  constructor(public url: string) {}

  send(data: string): void {
    if (this.readyState !== FakeSocket.OPEN) throw new Error('not open');
    this.sent.push(data);
  }

  close(): void {
    if (this.readyState === FakeSocket.CLOSED) return;
    this.readyState = FakeSocket.CLOSED;
    this.onclose?.({});
  }

  // Test controls
  open(): void {
    this.readyState = FakeSocket.OPEN;
    this.onopen?.({});
  }

  receive(data: unknown): void {
    this.onmessage?.({ data });
  }

  drop(): void {
    this.onerror?.({});
    this.close();
  }

  sentTypes(): string[] {
    return this.sent.map((s) => JSON.parse(s).type as string);
  }
}
