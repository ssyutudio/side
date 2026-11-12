// Every request a screen can make, validated before it reaches the controller.
// Anything malformed is answered with an error and calls nothing.
import { z } from 'zod';
import { LANGUAGES, PROMISE_CHOICES_MIN, SIDY_SIZES } from '@side/shared';
import type { SideController } from './controller';
import { DEMO_COMMANDS } from './demoClock';

const id = z.string().min(1).max(100);
const empty = z.unknown();

const settingsPatch = z
  .object({
    sidySize: z.enum(SIDY_SIZES),
    language: z.enum(LANGUAGES),
    shortcut: z.string().min(1).max(60),
    quietHours: z.object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(0).max(1439) }).nullable(),
    wakeMinutes: z.number().int().min(0).max(1439),
    llmEnabled: z.boolean(),
    uploadEnabled: z.boolean(),
    excludedDomains: z.array(z.string().max(253)).max(500),
    reactions: z.boolean(),
    apps: z.array(z.string().regex(/^[a-z_]{1,40}$/)).max(40),
    calendar: z.boolean(),
  })
  .partial()
  .strict();

type Ctl = Pick<
  SideController,
  'state' | 'resetPairing' | 'previewWrapup' | 'confirmWrapup' | 'editWrapup' | 'openStep' | 'suggestTomorrow' | 'saveTomorrowLine' | 'oneMoreHour' | 'bubbleDrawn' | 'updateSettings' | 'setHidden' | 'demo' | 'openMain' | 'publish'
> & {
  wrapup: Pick<SideController['wrapup'], 'retry' | 'undo' | 'setTomorrowLine'>;
  step: Pick<SideController['step'], 'open' | 'dismiss'>;
  ask: Pick<SideController['ask'], 'ask'>;
  conn: Pick<SideController['conn'], 'setApp' | 'refresh' | 'setCalendar'>;
  speak: Pick<SideController['speak'], 'choose' | 'answer' | 'setFocus' | 'clear'>;
};

interface Route<S extends z.ZodTypeAny> {
  schema: S;
  run: (ctl: Ctl, input: z.infer<S>) => unknown;
}
const route = <S extends z.ZodTypeAny>(schema: S, run: (ctl: Ctl, input: z.infer<S>) => unknown): Route<S> => ({ schema, run });

/** A route that changes state but publishes nothing itself: the screens are refreshed once after it runs. */
const publishing =
  <I>(run: (ctl: Ctl, input: I) => unknown) =>
  async (ctl: Ctl, input: I) => {
    const out = await run(ctl, input);
    ctl.publish();
    return out;
  };

const ROUTES = {
  'side:state': route(empty, (c) => c.state()),
  'side:wrapup.preview': route(empty, (c) => c.previewWrapup()),
  'side:wrapup.confirm': route(z.object({ closeGroupKeys: z.array(id).max(50) }), (c, i) => c.confirmWrapup(i.closeGroupKeys)),
  'side:wrapup.edit': route(
    z.discriminatedUnion('op', [
      z.object({ op: z.literal('move'), tabId: z.number().int(), to: id }),
      z.object({ op: z.literal('merge'), from: id, into: id }),
      z.object({ op: z.literal('new'), tabId: z.number().int() }),
      z.object({ op: z.literal('rename'), key: id, name: z.string().max(200) }),
    ]),
    (c, i) => c.editWrapup(i),
  ),
  'side:wrapup.retry': route(z.object({ id }), publishing((c, i) => c.wrapup.retry(i.id))),
  'side:wrapup.undo': route(z.object({ id }), publishing((c, i) => c.wrapup.undo(i.id))),
  'side:wrapup.tomorrow': route(z.object({ id, line: z.string().max(500).nullable() }), (c, i) => c.saveTomorrowLine(i.id, i.line)),
  'side:wrapup.suggest': route(z.object({ id }), async (c, i) => ({ suggestions: await c.suggestTomorrow(i.id) })),
  'side:step.open': route(z.object({ stepId: id }), publishing((c, i) => c.openStep(i.stepId))),
  'side:step.dismiss': route(z.object({ stepId: id, kind: z.enum(['not_now', 'rest_today']) }), publishing((c, i) => c.step.dismiss(i.stepId, i.kind))),
  'side:bubble.drawn': route(empty, (c) => c.bubbleDrawn()),
  'side:bubble.close': route(empty, (c) => c.speak.clear()),
  'side:onemore': route(empty, (c) => c.oneMoreHour()),
  'side:onemore.choose': route(
    z.object({ minutes: z.union(PROMISE_CHOICES_MIN.map((m) => z.literal(m)) as [z.ZodLiteral<30>, z.ZodLiteral<60>]) }),
    publishing((c, i) => c.speak.choose(i.minutes)),
  ),
  'side:promise.answer': route(z.object({ answer: z.enum(['set_aside', 'keep_going', 'not_today']) }), (c, i) => c.speak.answer(i.answer)),
  'side:settings.set': route(settingsPatch, (c, i) => c.updateSettings(i)),
  'side:hide': route(z.object({ hidden: z.boolean() }), (c, i) => c.setHidden(i.hidden)),
  'side:focus': route(z.object({ minutes: z.number().int().min(1).max(600).nullable() }), publishing((c, i) => c.speak.setFocus(i.minutes))),
  'side:demo': route(z.object({ cmd: z.enum(DEMO_COMMANDS) }), (c, i) => c.demo(i.cmd)),
  'side:open.main': route(empty, (c) => c.openMain()),
  'side:apps.set': route(z.object({ id: z.string().regex(/^[a-z_]{1,40}$/), on: z.boolean() }), (c, i) => c.conn.setApp(i.id, i.on)),
  // The extension was re-loaded from another folder (a new id): the next one that connects is paired.
  'side:pairing.reset': route(empty, publishing((c) => c.resetPairing())),
  'side:connections.refresh': route(empty, (c) => c.conn.refresh()),
  'side:calendar.set': route(z.object({ on: z.boolean() }), (c, i) => c.conn.setCalendar(i.on)),
  // Ask sidy: one line in, one decision out. The screen runs the action with the same route its
  // button uses, so Ask sidy can do nothing a button can't.
  'side:ask': route(z.object({ line: z.string().max(2000) }), (c, i) => c.ask.ask(i.line)),
} as const;

export type IpcChannel = keyof typeof ROUTES;
export const IPC_CHANNELS = Object.keys(ROUTES) as IpcChannel[];

export async function routeIpc(ctl: Ctl, channel: string, payload: unknown): Promise<unknown> {
  if (!Object.prototype.hasOwnProperty.call(ROUTES, channel)) return { error: 'unknown channel' };
  const r = ROUTES[channel as IpcChannel] as Route<z.ZodTypeAny>;
  const parsed = r.schema.safeParse(payload);
  if (!parsed.success) return { error: 'invalid request' };
  const out = await r.run(ctl, parsed.data);
  return out === undefined ? { ok: true } : out;
}
