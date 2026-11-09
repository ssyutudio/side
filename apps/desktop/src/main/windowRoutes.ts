// Screen requests that move windows rather than data: open/close/resize Mini, show a toast at the
// edge, check the connection, show the data file. Validated the same way as the data routes.
import { z } from 'zod';

export interface WindowPort {
  openMini(view: 'home' | 'wrap' | 'onemore'): void;
  toggleMini(): void;
  closeMini(): void;
  resizeMini(height: number): void;
  toast(text: string, ms: number): void;
  checkConnection(): Promise<string>;
  revealData(): void;
}

const empty = z.unknown();
const ROUTES = {
  'side:mini.open': { schema: z.object({ view: z.enum(['home', 'wrap', 'onemore']) }), run: (p: WindowPort, i: { view: 'home' | 'wrap' | 'onemore' }) => p.openMini(i.view) },
  'side:mini.toggle': { schema: empty, run: (p: WindowPort) => p.toggleMini() },
  'side:mini.close': { schema: empty, run: (p: WindowPort) => p.closeMini() },
  'side:mini.resize': { schema: z.object({ height: z.number().int().min(120).max(2000) }), run: (p: WindowPort, i: { height: number }) => p.resizeMini(i.height) },
  'side:toast': { schema: z.object({ text: z.string().min(1).max(200), ms: z.number().int().min(500).max(20_000) }), run: (p: WindowPort, i: { text: string; ms: number }) => p.toast(i.text, i.ms) },
  'side:check.connection': { schema: empty, run: async (p: WindowPort) => ({ status: await p.checkConnection() }) },
  'side:data.reveal': { schema: empty, run: (p: WindowPort) => p.revealData() },
} as const;

export type WindowChannel = keyof typeof ROUTES;
export const WINDOW_CHANNELS = Object.keys(ROUTES) as WindowChannel[];

export async function routeWindow(port: WindowPort, channel: string, payload: unknown): Promise<unknown> {
  if (!Object.prototype.hasOwnProperty.call(ROUTES, channel)) return { error: 'unknown channel' };
  const r = ROUTES[channel as WindowChannel] as { schema: z.ZodTypeAny; run: (p: WindowPort, i: never) => unknown };
  const parsed = r.schema.safeParse(payload);
  if (!parsed.success) return { error: 'invalid request' };
  const out = await r.run(port, parsed.data as never);
  return out === undefined ? { ok: true } : out;
}
