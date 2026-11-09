// The calendar connector (K5, Director: read this computer's calendar only). Off until turned on in
// Connections. Through EventKit (JXA, no compiled helper), it reads two things: when tomorrow's first
// timed event starts, and how many timed events are left today. It never asks EventKit for a title,
// a place or attendees, so none can reach Claude or the screen, and there is no code that creates,
// changes or deletes an event. macOS asks for permission the first time; a "no" is said as it is.
import { execFile } from 'node:child_process';
import { z } from 'zod';

/** EKAuthorizationStatus: 0 not asked, 1 restricted, 2 denied, 3 full access (and 4 write-only). */
export type CalendarStatus = 'not_asked' | 'restricted' | 'denied' | 'allowed' | 'write_only' | 'unavailable';

export interface CalendarPeek {
  status: CalendarStatus;
  /** Start of tomorrow's first timed event (epoch ms), or null. */
  firstTomorrow: number | null;
  /** Timed events that start between now and the end of today. */
  leftToday: number;
}

// Fixed text: the only inputs are the mode and a number, read from argv. Only startDate and isAllDay
// are touched on each event.
export const CALENDAR_JXA = `
ObjC.import('EventKit');
ObjC.import('Foundation');
function statusName(s) { return ['not_asked','restricted','denied','allowed','write_only'][s] || 'unavailable'; }
function run(argv) {
  var mode = argv[0], now = Number(argv[1]);
  var store = $.EKEventStore.alloc.init;
  var status = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent));
  if (mode === 'request' && status === 0) {
    var done = false;
    var cb = function (granted, err) { done = true; };
    if (store.respondsToSelector('requestFullAccessToEventsWithCompletion:')) store.requestFullAccessToEventsWithCompletion(cb);
    else store.requestAccessToEntityTypeCompletion($.EKEntityTypeEvent, cb);
    var until = $.NSDate.dateWithTimeIntervalSinceNow(60);
    while (!done && $.NSDate.date.compare(until) < 0) $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.2));
    status = Number($.EKEventStore.authorizationStatusForEntityType($.EKEntityTypeEvent));
  }
  if (mode === 'status' || status !== 3 || !isFinite(now)) return JSON.stringify({ status: statusName(status), firstTomorrow: null, leftToday: 0 });
  var cal = $.NSCalendar.currentCalendar;
  var nowDate = $.NSDate.dateWithTimeIntervalSince1970(now / 1000);
  var today = cal.startOfDayForDate(nowDate);
  var tomorrow = today.dateByAddingTimeInterval(86400);
  var after = tomorrow.dateByAddingTimeInterval(86400);
  function timed(from, to) {
    var pred = store.predicateForEventsWithStartDateEndDateCalendars(from, to, $());
    var list = store.eventsMatchingPredicate(pred);
    var out = [];
    for (var i = 0; i < list.count; i++) {
      var e = list.objectAtIndex(i);
      if (e.isAllDay) continue;
      out.push(Number(e.startDate.timeIntervalSince1970) * 1000);
    }
    return out;
  }
  var left = timed(nowDate, tomorrow).filter(function (t) { return t >= now; }).length;
  var next = timed(tomorrow, after).filter(function (t) { return t >= Number(tomorrow.timeIntervalSince1970) * 1000; });
  next.sort(function (a, b) { return a - b; });
  return JSON.stringify({ status: 'allowed', firstTomorrow: next.length ? Math.round(next[0]) : null, leftToday: left });
}`;

const Reply = z
  .object({
    status: z.enum(['not_asked', 'restricted', 'denied', 'allowed', 'write_only', 'unavailable']),
    firstTomorrow: z.number().int().nonnegative().nullable(),
    leftToday: z.number().int().min(0).max(500),
  })
  .strict();

type Exec = (args: string[], timeoutMs: number) => Promise<{ ok: boolean; stdout: string }>;

const osascript: Exec = (args, timeoutMs) =>
  new Promise((resolve) => {
    try {
      execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', CALENDAR_JXA, ...args], { timeout: timeoutMs, encoding: 'utf8', shell: false }, (err, stdout) =>
        resolve({ ok: !err, stdout: String(stdout ?? '') }),
      );
    } catch {
      resolve({ ok: false, stdout: '' });
    }
  });

const UNAVAILABLE: CalendarPeek = { status: 'unavailable', firstTomorrow: null, leftToday: 0 };

/** Parses the helper's one line; anything else counts as "couldn't read". */
export function parsePeek(stdout: string): CalendarPeek {
  try {
    const r = Reply.safeParse(JSON.parse(stdout.trim()));
    return r.success ? r.data : UNAVAILABLE;
  } catch {
    return UNAVAILABLE;
  }
}

export interface CalendarPort {
  /** Permission only; never reads an event and never asks. */
  status(): Promise<CalendarPeek>;
  /** Asks macOS the first time (when turned on in Connections), then reads. */
  request(now: number): Promise<CalendarPeek>;
  /** Reads, only if already allowed. */
  peek(now: number): Promise<CalendarPeek>;
}

export function calendarPort(exec: Exec = osascript): CalendarPort {
  return {
    status: async () => parsePeek((await exec(['status', '0'], 5000)).stdout),
    request: async (now) => parsePeek((await exec(['request', String(Math.round(now))], 70_000)).stdout),
    peek: async (now) => parsePeek((await exec(['read', String(Math.round(now))], 8000)).stdout),
  };
}
