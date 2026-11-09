// A piece of recent work, and the private facts kept about it. The object handed
// out has only what may be shown; `path` is non-enumerable, so serializing or
// spreading it can't carry a path anywhere. To act on something, the helper's own
// private record is looked up by id. Nothing a caller passes in can name a file.

import { createHash } from "node:crypto";
import { adapterById } from "../adapters.mjs";
import { cleanName } from "./paths.mjs";

const MAX_RECORDS = 500;
const records = new Map();

function shortHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

/** Same file, same id, on every run, so a step saved tonight still resolves tomorrow. */
export function workId(adapterId, path) {
  return `doc-${shortHash(`${adapterId}\0${path}`)}`;
}

export function candidateId(workIdValue, actionKey) {
  return `app-${shortHash(`${workIdValue}\0${actionKey}`)}`;
}

/**
 * Builds a work item and remembers its private record.
 * `path` is null for apps with no local document.
 * `lookback` is { path, name, media } when there's a recent result to look at.
 */
export function makeWork({ adapterId, path = null, key = path, name, touchedMs, lookback = null }) {
  const adapter = adapterById(adapterId);
  if (!adapter) throw new Error("unknown adapter");
  const id = workId(adapterId, key ?? adapterId);
  const work = { id, app: adapter.app, tool: adapter.tool, name: cleanName(name), touched_at: touchedMs > 0 ? new Date(touchedMs).toISOString() : null };
  // The helper's bridge checks for a string here. A path-less app gets an empty one.
  Object.defineProperty(work, "path", { value: path ?? "", enumerable: false, writable: false, configurable: false });

  const locale = records.get(id)?.locale ?? null;
  records.delete(id);
  records.set(id, { adapter, path, key: key ?? adapterId, lookback, locale, work });
  if (records.size > MAX_RECORDS) records.delete(records.keys().next().value);
  return work;
}

/** The private record for whatever was passed. Only an id produced here matches anything. */
export function recordFor(work) {
  return typeof work?.id === "string" ? (records.get(work.id) ?? null) : null;
}

/**
 * Side's desktop app keeps a step overnight in its own data file on this computer, so it needs
 * what makeWork() was given to register the same work again after a restart. Never sent anywhere.
 */
export function privateFacts(work) {
  const record = recordFor(work);
  return record ? { adapterId: record.adapter.id, path: record.path, key: record.key, lookback: record.lookback } : null;
}

/** Keeps order, but no more than `max` items from one app, so one batch can't fill the list. */
export function capPerApp(workList, max) {
  const counts = new Map();
  return workList.filter((work) => {
    const count = counts.get(work.app) ?? 0;
    counts.set(work.app, count + 1);
    return count < max;
  });
}

export function __clearWorkForTests() {
  records.clear();
}
