// Wire format between the desktop app and the extension: {id, type, payload, replyTo?}.
// Every incoming message goes through parseMessage; anything that does not match is dropped.
import { z } from 'zod';

const str = (max: number) => z.string().max(max);
const id = z.string().min(1).max(100);
const tabId = z.number().int();

const position = z.object({
  scroller: z.enum(['window', 'element']),
  selector: str(500).nullable(),
  top: z.number().finite().min(0),
  ratio: z.number().finite().min(0).max(1),
  quote: str(300).nullable(),
  capturedAt: z.number(),
});

const tabSnapshot = z.object({
  tabId,
  windowId: z.number().int(),
  index: z.number().int(),
  url: str(8192),
  title: str(2000),
  lastAccessed: z.number().nullable(),
  active: z.boolean(),
  pinned: z.boolean(),
  audible: z.boolean(),
  incognito: z.boolean(),
  groupId: z.number().int(),
  groupTitle: str(500).nullable(),
  position: position.nullable(),
});

const skipped = z.object({
  excluded: z.number().int().min(0),
  excludedByDomain: z.record(z.string(), z.number().int().min(0)),
  incognito: z.number().int().min(0),
  internal: z.number().int().min(0),
});

const keepReason = z.enum(['active', 'pinned', 'audible', 'incognito', 'excluded', 'user_group', 'changed', 'gone']);

export const payloadSchemas = {
  // extension -> app
  hello: z.object({ extVersion: str(50) }),
  'tabs.report': z.object({ tabs: z.array(tabSnapshot).max(2000), skipped, capturedAt: z.number() }),
  'cmd.result': z.object({
    ok: z.boolean(),
    result: z.unknown().optional(),
    error: z.object({ kind: z.enum(['chrome', 'storage', 'rejected']), message: str(1000) }).optional(),
  }),
  ping: z.object({}),
  // app -> extension
  welcome: z.object({ appVersion: str(50) }),
  'exclusions.set': z.object({ domains: z.array(str(253)).max(500) }),
  'tabs.request': z.object({}),
  'cmd.wrapup.apply': z.object({
    setAsideId: id,
    groups: z.array(z.object({ key: id, name: str(80), tabIds: z.array(tabId) })).max(50),
    closeTabIds: z.array(tabId),
    expectUrls: z.record(z.string(), str(8192)),
  }),
  'cmd.wrapup.undo': z.object({ setAsideId: id }),
  'cmd.step.open': z.object({ stepId: id, url: str(8192), position: position.nullable() }),
  pong: z.object({}),
} as const;

export type MessageType = keyof typeof payloadSchemas;
export type PayloadOf<T extends MessageType> = z.infer<(typeof payloadSchemas)[T]>;

export interface Message<T extends MessageType = MessageType> {
  id: string;
  type: T;
  payload: PayloadOf<T>;
  replyTo?: string;
}

export type ParseResult = { ok: true; msg: Message } | { ok: false; reason: string };

const envelope = z.object({
  id,
  type: z.string().max(60),
  payload: z.unknown(),
  replyTo: id.optional(),
});

/** Parses a raw frame (string or object). Never throws. */
export function parseMessage(raw: unknown): ParseResult {
  let data: unknown = raw;
  if (typeof raw === 'string') {
    try {
      data = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'broken json' };
    }
  }
  const env = envelope.safeParse(data);
  if (!env.success) return { ok: false, reason: 'bad envelope' };
  const { type } = env.data;
  if (!Object.prototype.hasOwnProperty.call(payloadSchemas, type)) return { ok: false, reason: `unknown type ${type}` };
  const schema = payloadSchemas[type as MessageType];
  const payload = schema.safeParse(env.data.payload);
  if (!payload.success) return { ok: false, reason: `bad payload for ${type}` };
  const msg: Message = { id: env.data.id, type: type as MessageType, payload: payload.data as PayloadOf<MessageType> };
  if (env.data.replyTo) msg.replyTo = env.data.replyTo;
  return { ok: true, msg };
}

export function newId(): string {
  return globalThis.crypto.randomUUID();
}

export function makeMessage<T extends MessageType>(type: T, payload: PayloadOf<T>, replyTo?: string): Message<T> {
  const msg: Message<T> = { id: newId(), type, payload };
  if (replyTo) msg.replyTo = replyTo;
  return msg;
}

export function encodeMessage(msg: Message): string {
  return JSON.stringify(msg);
}
