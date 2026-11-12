// AC17: the calendar connector reads two numbers and nothing else, and never writes.
import { CALENDAR_JXA, calendarPort, dayBounds, parsePeek } from './calendar';

describe('calendar connector', () => {
  it('the script never touches a title, place, attendee or note, and has no way to save or remove', () => {
    for (const word of ['title', 'location', 'attendees', 'notes', 'organizer', 'URL', 'saveEvent', 'removeEvent', 'commit']) {
      expect(CALENDAR_JXA).not.toContain(word);
    }
    // The only event properties it reads.
    expect([...CALENDAR_JXA.matchAll(/\be\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(['isAllDay', 'startDate']);
  });

  it('passes only the mode and a number, never text, to the script', async () => {
    const calls: string[][] = [];
    const port = calendarPort(async (args) => (calls.push(args), { ok: true, stdout: '{"status":"allowed","firstTomorrow":1794182400000,"leftToday":2}' }));
    expect(await port.peek(1794096000000.4)).toEqual({ status: 'allowed', firstTomorrow: 1794182400000, leftToday: 2 });
    await port.status();
    await port.request(5);
    expect(calls).toEqual([['read', '1794096000000', ...dayBounds(1794096000000)], ['status', '0'], ['request', '5', ...dayBounds(5)]]);
  });

  it('reads a "no" from macOS as it is, and anything odd as unavailable', () => {
    expect(parsePeek('{"status":"denied","firstTomorrow":null,"leftToday":0}')).toEqual({ status: 'denied', firstTomorrow: null, leftToday: 0 });
    for (const bad of ['', 'garbage', 'null', '{"status":"allowed"}', '{"status":"allowed","firstTomorrow":null,"leftToday":0,"title":"Dentist"}', '{"status":"maybe","firstTomorrow":null,"leftToday":0}', '{"status":"allowed","firstTomorrow":-5,"leftToday":0}']) {
      expect(parsePeek(bad)).toEqual({ status: 'unavailable', firstTomorrow: null, leftToday: 0 });
    }
  });

  it('a failed or slow osascript is "unavailable", never a crash', async () => {
    const port = calendarPort(async () => ({ ok: false, stdout: '' }));
    expect(await port.peek(1)).toEqual({ status: 'unavailable', firstTomorrow: null, leftToday: 0 });
  });

  it('the day bounds are 4 a.m. work-day starts: at 1:30 a.m. tomorrow is this coming morning', () => {
    const at = (m: number, d: number, h: number, min = 0) => new Date(2026, m, d, h, min).getTime();
    expect(dayBounds(at(10, 10, 1, 30))).toEqual([String(at(10, 10, 4)), String(at(10, 11, 4))]);
    expect(dayBounds(at(10, 10, 23, 40))).toEqual([String(at(10, 11, 4)), String(at(10, 12, 4))]);
  });

  it('the bounds follow the calendar across a DST change, not a fixed 86400 s', () => {
    const prev = process.env.TZ;
    process.env.TZ = 'America/New_York'; // 2026-11-01 has 25 hours
    try {
      const [tomorrow, after] = dayBounds(new Date(2026, 9, 31, 22, 0).getTime());
      expect(Number(tomorrow)).toBe(new Date(2026, 10, 1, 4, 0).getTime());
      expect(Number(after)).toBe(new Date(2026, 10, 2, 4, 0).getTime());
      expect(Number(after) - Number(tomorrow)).toBe(24 * 3_600_000); // 4:00 to 4:00 after the change
    } finally {
      if (prev === undefined) delete process.env.TZ;
      else process.env.TZ = prev;
    }
  });
});
