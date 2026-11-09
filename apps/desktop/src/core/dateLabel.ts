// When the last record happened, in words, from its real date (date precision
// only). "yesterday" is said only when it really was the previous work day.
import { workDayOf } from './todayDone';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function dayLabel(recordAt: number, now: number): string {
  const recordDay = workDayOf(recordAt);
  const diff = Math.round((workDayOf(now) - recordDay) / 86_400_000);
  if (diff === 0) return 'today';
  if (diff === 1) return 'yesterday';
  const d = new Date(recordDay);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}
