// Small formatting helpers for the Main screen. Times use Side's own clock values.
import type { QuietReason } from '@side/shared';

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function minutesToClock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return minutesToClock(d.getHours() * 60 + d.getMinutes());
}

/** "Tuesday, Nov 10" */
export function longDate(ms: number): string {
  const d = new Date(ms);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

const KEY: Record<string, string> = {
  Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘', CmdOrCtrl: '⌘', Super: '⌘',
};

/** "Control+Alt+S" -> "⌃⌥S" */
export function shortcutKeys(accel: string): string {
  return accel.split('+').map((k) => KEY[k] ?? k.toUpperCase()).join('');
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Core step labels look like "“question” — work is ready…"; split the question out once. */
export function splitStepLabel(label: string): { asked: string | null; title: string } {
  const m = /^“(.+)” — (.+)$/.exec(label);
  return m ? { asked: m[1], title: m[2] } : { asked: null, title: label };
}

export const QUIET_TEXT: Record<QuietReason, string> = {
  quiet_hours: 'quiet hours',
  focus: 'you were in focus',
  spoke_recently: 'already spoke within the hour',
  hidden: 'sidy was hidden',
  rested_today: 'you chose Rest today',
  nothing_to_say: 'nothing to offer yet',
};
