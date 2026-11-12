// "One more hour": never blocks. Respect, one fact about time before the wake-up time, and the
// one check-in the user chooses. No claims about what sleep does.
import { html, type SafeHtml } from '../shared/html';
import { t } from '../../i18n';
import { chip, clock, facts, head, panel } from './parts';
import type { ViewState } from '../../main/viewState';

function minutesOfDay(ms: number) {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesLeft(now: number, wakeMinutes: number): number {
  return (wakeMinutes - minutesOfDay(now) + 1440) % 1440;
}

/** "7 h 50 min" from a number of minutes. */
function span(left: number): string {
  const h = Math.floor(left / 60);
  const m = left % 60;
  if (h && m) return t('{h} h {m} min', { h, m });
  return h ? t('{h} h', { h }) : t('{m} min', { m });
}

export function untilWake(now: number, wakeMinutes: number): string {
  return span(minutesLeft(now, wakeMinutes));
}

function wakeText(wakeMinutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(wakeMinutes / 60), wakeMinutes % 60);
  return clock(d.getTime());
}

/**
 * The one fact. With the calendar on and an event tomorrow, it is about that event (the time comes
 * from this computer's calendar; no title). Otherwise it is about the wake-up time, as before.
 */
function factRows(now: number, wakeMinutes: number, s?: ViewState): [string, string][] {
  const first = s?.connections?.calendar?.on ? s.connections.calendar.firstTomorrow : null;
  if (first && first > now && first - now <= 36 * 3_600_000) {
    const left = Math.round((first - now) / 60_000);
    return [[t('First event tomorrow'), clock(first)], ...(left <= 12 * 60 ? ([[t('Stop now and you get'), span(left)]] as [string, string][]) : [])];
  }
  // The one fact is about the coming night; in the daytime it is left out.
  return [[t('Your wake-up'), wakeText(wakeMinutes)], ...(minutesLeft(now, wakeMinutes) <= 12 * 60 ? ([[t('Stop now and you get'), untilWake(now, wakeMinutes)]] as [string, string][]) : [])];
}

export function oneMoreView(now: number, wakeMinutes: number, minutes: 30 | 60, s?: ViewState): SafeHtml {
  const seg = (m: 30 | 60, label: string) =>
    html`<button style="height:40px;padding:0 18px;font-size:15px" aria-pressed="${m === minutes ? 'true' : 'false'}" data-act="pick" data-min="${m}">${label}</button>`;
  return panel([
    head(s ? chip(s) : html`<span class="chip ok">${t('Chrome connected')}</span>`),
    html`<div class="pb">
<div><h2 class="wh">${t('Sure. Keep going.')}</h2><p class="sub">${t('What you did so far is saved. No tabs closed.')}</p></div>
${facts([
  [t('Now'), clock(now)],
  ...factRows(now, wakeMinutes, s),
])}
<div><div style="font-weight:600;font-size:15px;margin-bottom:8px">${t('Check in with me in')}</div>
<span class="seg" role="group" aria-label="${t('Check in')}">${seg(30, t('30 min'))}${seg(60, t('1 hour'))}</span></div></div>
<div class="pf"><button class="btn fill" style="width:100%" data-act="promise" data-min="${minutes}">${t('Check in at {time}', { time: clock(now + minutes * 60_000) })}</button>
<button class="btn ghost sm" style="margin-top:6px" data-act="wrap">${t('Done — set aside now')}</button></div>`,
  ]);
}
