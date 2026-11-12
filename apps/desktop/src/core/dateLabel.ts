// When the last record happened, in words, from its real date (date precision
// only). "yesterday" is said only when it really was the previous work day.
import { k, t } from '../i18n';
import { workDayOf } from './todayDone';

const DAYS = [k('Sun'), k('Mon'), k('Tue'), k('Wed'), k('Thu'), k('Fri'), k('Sat')];
const MONTHS = [k('Jan'), k('Feb'), k('Mar'), k('Apr'), k('May'), k('Jun'), k('Jul'), k('Aug'), k('Sep'), k('Oct'), k('Nov'), k('Dec')];

/** Which kind of day a label is, whatever language it is written in (screens compare this, not the words). */
export function dayKind(recordAt: number, now: number): 'today' | 'yesterday' | 'earlier' {
  const diff = Math.round((workDayOf(now) - workDayOf(recordAt)) / 86_400_000);
  return diff === 0 ? 'today' : diff === 1 ? 'yesterday' : 'earlier';
}

export function dayLabel(recordAt: number, now: number): string {
  const recordDay = workDayOf(recordAt);
  const diff = Math.round((workDayOf(now) - recordDay) / 86_400_000);
  if (diff === 0) return t('today');
  if (diff === 1) return t('yesterday');
  const d = new Date(recordDay);
  return t('{wd}, {mo} {dd}', { wd: t(DAYS[d.getDay()]), mo: t(MONTHS[d.getMonth()]), dd: d.getDate() });
}
