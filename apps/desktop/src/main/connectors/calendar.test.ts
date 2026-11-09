// AC17: the calendar connector reads two numbers and nothing else, and never writes.
import { CALENDAR_JXA, calendarPort, parsePeek } from './calendar';

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
    expect(calls).toEqual([['read', '1794096000000'], ['status', '0'], ['request', '5']]);
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
});
