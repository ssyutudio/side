// Every request a screen can make, validated before it reaches the controller.
// Anything malformed is answered with an error and calls nothing.
import { z } from 'zod';
import { PROMISE_CHOICES_MIN, SIDY_SIZES } from '@side/shared';
import type { SideController } from './controller';
import { DEMO_COMMANDS } from './demoClock';

const id = z.string().min(1).max(100);
const empty = z.unknown();

const settingsPatch = z
  .object({
    sidySize: z.enum(SIDY_SIZES),
    shortcut: z.string().min(1).max(60),
    quietHours: z.object({ start: z.number().int().min(0).max(1439), end: z.number().int().min(0).max(1439) }).nullable(),
    wakeMinutes: z.number().int().min(0).max(1439),
    llmEnabled: z.boolean(),
    uploadEnabled: z.boolean(),
    excludedDomains: z.array(z.string().max(253)).max(500),
  })
  .partial()
  .strict();

type Ctl = Pick<
  SideController,
  'state' | 'previewWrapup' | 'confirmWrapup' | 'oneMoreHour' | 'bubbleDrawn' | 'updateSettings' | 'setHidden' | 'demo' | 'openMain' | 'publish'
> & {
  wrapup: Pick<SideController['wrapup'], 'retry' | 'undo' | 'setTomorrowLine'>;
  step: Pick<SideController['step'], 'open' | 'dismiss'>;
  speak: Pick<SideController['speak'], 'choose' | 'answer' | 'setFocus' | 'clear'>;
};

interface Route<S extends z.ZodTypeAny> {
  schema: S;
  run: (ctl: Ctl, input: z.infer<S>) => unknown;
}
const route = <S extends z.ZodTypeAny>(schema: S, run: (ctl: Ctl, input: z.infer<S>) => unknown): Route<S> => ({ schema, run });

const ROUTES = {
  'side:state': route(empty, (c) => c.state()),
  'side:wrapup.preview': route(empty, (c) => c.previewWrapup()),
  'side:wrapup.confirm': route(z.object({ closeGroupKeys: z.array(id).max(50) }), (c, i) => c.confirmWrapup(i.closeGroupKeys)),
  'side:wrapup.retry': route(z.object({ id }), (c, i) => c.wrapup.retry(i.id)),
  'side:wrapup.undo': route(z.object({ id }), (c, i) => c.wrapup.undo(i.id)),
  'side:wrapup.tomorrow': route(z.object({ id, line: z.string().max(500).nullable() }), (c, i) => c.wrapup.setTomorrowLine(i.id, i.line)),
  'side:step.open': route(z.object({ stepId: id }), (c, i) => c.step.open(i.stepId)),
  'side:step.dismiss': route(z.object({ stepId: id, kind: z.enum(['not_now', 'rest_today']) }), (c, i) => c.step.dismiss(i.stepId, i.kind)),
  'side:bubble.drawn': route(empty, (c) => c.bubbleDrawn()),
  'side:bubble.close': route(empty, (c) => c.speak.clear()),
  'side:onemore': route(empty, (c) => c.oneMoreHour()),
  'side:onemore.choose': route(
    z.object({ minutes: z.union(PROMISE_CHOICES_MIN.map((m) => z.literal(m)) as [z.ZodLiteral<30>, z.ZodLiteral<60>]) }),
    (c, i) => c.speak.choose(i.minutes),
  ),
  'side:promise.answer': route(z.object({ answer: z.enum(['set_aside', 'keep_going', 'not_today']) }), (c, i) => c.speak.answer(i.answer)),
  'side:settings.set': route(settingsPatch, (c, i) => c.updateSettings(i)),
  'side:hide': route(z.object({ hidden: z.boolean() }), (c, i) => c.setHidden(i.hidden)),
  'side:focus': route(z.object({ minutes: z.number().int().min(1).max(600).nullable() }), (c, i) => c.speak.setFocus(i.minutes)),
  'side:demo': route(z.object({ cmd: z.enum(DEMO_COMMANDS) }), (c, i) => c.demo(i.cmd)),
  'side:open.main': route(empty, (c) => c.openMain()),
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
