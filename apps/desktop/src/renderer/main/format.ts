// Small formatting helpers for the Main screen. Times use Side's own clock values.
import type { QuietReason } from '@side/shared';
import { k, language, t } from '../../i18n';

const DAYS = [k('Sunday'), k('Monday'), k('Tuesday'), k('Wednesday'), k('Thursday'), k('Friday'), k('Saturday')];
const MONTHS = [k('Jan'), k('Feb'), k('Mar'), k('Apr'), k('May'), k('Jun'), k('Jul'), k('Aug'), k('Sep'), k('Oct'), k('Nov'), k('Dec')];

export function minutesToClock(min: number): string {
  const h = Math.floor(min / 60) % 24;
  const m = min % 60;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const mm = String(m).padStart(2, '0');
  if (language() === 'ko') return `${h < 12 ? t('AM') : t('PM')} ${h12}:${mm}`;
  return `${h12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

export function clock(ms: number): string {
  const d = new Date(ms);
  return minutesToClock(d.getHours() * 60 + d.getMinutes());
}

/** "Tuesday, Nov 10" */
export function longDate(ms: number): string {
  const d = new Date(ms);
  return t('{weekday}, {month} {day}', { weekday: t(DAYS[d.getDay()]), month: t(MONTHS[d.getMonth()]), day: d.getDate() });
}

const KEY: Record<string, string> = {
  Control: '⌃', Ctrl: '⌃', Alt: '⌥', Option: '⌥', Shift: '⇧', Command: '⌘', Cmd: '⌘', CommandOrControl: '⌘', CmdOrCtrl: '⌘', Super: '⌘',
};

/** "Control+Alt+S" -> "⌃⌥S" */
export function shortcutKeys(accel: string): string {
  return accel.split('+').map((part) => KEY[part] ?? part.toUpperCase()).join('');
}

/** Core step labels look like "“question” — work is ready…"; split the question out once. */
export function splitStepLabel(label: string): { asked: string | null; title: string } {
  const m = /^“(.+)” — (.+)$/.exec(label);
  return m ? { asked: m[1], title: m[2] } : { asked: null, title: label };
}

export const QUIET_TEXT: Record<QuietReason, string> = {
  quiet_hours: k('quiet hours'),
  focus: k('you were in focus'),
  spoke_recently: k('already spoke within the hour'),
  hidden: k('sidy was hidden'),
  rested_today: k('you chose Rest today'),
  nothing_to_say: k('nothing to offer yet'),
};
