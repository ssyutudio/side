// Runs app commands one at a time and turns each outcome into a cmd.result reply.
// Error kinds tell the app what really happened: storage (nothing changed), chrome (partly
// applied, safe to retry) or rejected (the request itself was not acceptable).
import { makeMessage } from '@side/shared';
import type { CmdResultPayload, Message } from '@side/shared';
import type { ChromeApi } from './api';
import { COPY } from './copy';
import { ChromeError, RejectedError, StorageError } from './journal';
import { openStep } from './restore';
import type { OpenOptions } from './restore';
import { undoWrapup } from './undo';
import { applyWrapup } from './wrapup';

export interface CommandDeps {
  api: ChromeApi;
  getExclusions: () => Promise<string[]>;
  now: () => number;
  openOptions: OpenOptions;
}

function failure(e: unknown): CmdResultPayload {
  const detail = e instanceof Error ? e.message : String(e);
  if (e instanceof StorageError) return { ok: false, error: { kind: 'storage', message: COPY.storageFailed(detail) } };
  if (e instanceof RejectedError) return { ok: false, error: { kind: 'rejected', message: detail } };
  if (e instanceof ChromeError) return { ok: false, error: { kind: 'chrome', message: COPY.chromeFailed(detail) } };
  return { ok: false, error: { kind: 'chrome', message: COPY.unexpected(detail) } };
}

async function execute(msg: Message, deps: CommandDeps): Promise<CmdResultPayload | null> {
  switch (msg.type) {
    case 'cmd.wrapup.apply': {
      const p = msg.payload as Message<'cmd.wrapup.apply'>['payload'];
      return { ok: true, result: await applyWrapup(deps.api, p, await deps.getExclusions(), deps.now()) };
    }
    case 'cmd.wrapup.undo': {
      const p = msg.payload as Message<'cmd.wrapup.undo'>['payload'];
      return { ok: true, result: await undoWrapup(deps.api, p.setAsideId) };
    }
    case 'cmd.step.open': {
      const p = msg.payload as Message<'cmd.step.open'>['payload'];
      return { ok: true, result: await openStep(deps.api, p, deps.openOptions) };
    }
    default:
      return null;
  }
}

/** Returns a function that runs a command after the previous one finished and resolves to its reply. */
export function createCommandRunner(deps: CommandDeps): (msg: Message) => Promise<Message | null> {
  let tail: Promise<unknown> = Promise.resolve();
  return (msg) => {
    const next = tail.then(async () => {
      let payload: CmdResultPayload | null;
      try {
        payload = await execute(msg, deps);
      } catch (e) {
        payload = failure(e);
      }
      return payload ? makeMessage('cmd.result', payload, msg.id) : null;
    });
    tail = next.catch(() => undefined);
    return next;
  };
}
