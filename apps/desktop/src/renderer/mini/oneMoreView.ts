// "One more hour": never blocks. Respect, one fact about time before the wake-up time, and the
// one check-in the user chooses. No claims about what sleep does.
import { html, type SafeHtml } from '../shared/html';
import { chip, clock, facts, head, panel } from './parts';
import type { ViewState } from '../../main/viewState';

function minutesOfDay(ms: number) {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

function minutesLeft(now: number, wakeMinutes: number): number {
  return (wakeMinutes - minutesOfDay(now) + 1440) % 1440;
}

export function untilWake(now: number, wakeMinutes: number): string {
  const left = minutesLeft(now, wakeMinutes);
  const h = Math.floor(left / 60);
  const m = left % 60;
  return h ? `${h} h${m ? ` ${m} min` : ''}` : `${m} min`;
}

function wakeText(wakeMinutes: number): string {
  const d = new Date(2000, 0, 1, Math.floor(wakeMinutes / 60), wakeMinutes % 60);
  return clock(d.getTime());
}

export function oneMoreView(now: number, wakeMinutes: number, minutes: 30 | 60, s?: ViewState): SafeHtml {
  const seg = (m: 30 | 60, label: string) =>
    html`<button style="height:40px;padding:0 18px;font-size:15px" aria-pressed="${m === minutes ? 'true' : 'false'}" data-act="pick" data-min="${m}">${label}</button>`;
  return panel([
    head(s ? chip(s) : html`<span class="chip ok">Chrome connected</span>`),
    html`<div class="pb">
<div><h2 class="wh">Sure. Keep going.</h2><p class="sub">What you did so far is saved. No tabs closed.</p></div>
${facts([
  ['Now', clock(now)],
  ['Your wake-up', wakeText(wakeMinutes)],
  // The one fact is about the coming night; in the daytime it is left out.
  ...(minutesLeft(now, wakeMinutes) <= 12 * 60 ? ([['Stop now and you get', untilWake(now, wakeMinutes)]] as [string, string][]) : []),
])}
<div><div style="font-weight:600;font-size:15px;margin-bottom:8px">Check in with me in</div>
<span class="seg" role="group" aria-label="Check in">${seg(30, '30 min')}${seg(60, '1 hour')}</span></div></div>
<div class="pf"><button class="btn fill" style="width:100%" data-act="promise" data-min="${minutes}">Check in at ${clock(now + minutes * 60_000)}</button>
<button class="btn ghost sm" style="margin-top:6px" data-act="wrap">Done — set aside now</button></div>`,
  ]);
}
