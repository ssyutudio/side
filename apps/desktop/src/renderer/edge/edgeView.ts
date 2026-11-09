// What the edge window draws: sidy tucked at the right edge, and at most one bubble or toast.
// Pure functions from state to HTML, so every state is tested without a DOM.
import type { ViewState } from '../../main/viewState';
import type { Bubble } from '../../main/speakService';
import type { Toast } from '../shared/api';
import { html, raw, type SafeHtml } from '../shared/html';
import { sidySvg } from '../shared/sidy';

export type EdgeMode = 'quiet' | 'out' | 'hidden';

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Quiet: only ~48% of sidy shows (eyes, no blue). Out: ~92% shows, blue side included. */
export function edgeView(o: { mode: EdgeMode; size: number; hitY: number; hitSize: number }): SafeHtml {
  if (o.mode === 'hidden') return raw('');
  const q = Math.round(o.size * 0.52);
  const out = Math.round(o.size * 0.08);
  const cls = o.mode === 'quiet' ? 'tucked' : 'out';
  return html`<div class="edge ${cls}" style="top:${o.hitY}px;height:${o.hitSize}px;--q:${q}px;--o:${out}px">
<button class="hit" data-act="sidy" style="height:${o.hitSize}px;min-width:${o.hitSize}px" aria-label="sidy — open Side"><span class="body">${raw(sidySvg(o.size))}</span></button></div>`;
}

const close = (label: string) => html`<button class="x" data-act="bubble-x" aria-label="${label}">×</button>`;

/** The check-in bubble carries three buttons, so it is drawn at the approved wider size (392). */
export function bubbleClass(b: Bubble): string {
  return b.kind === 'promise' ? 'bubble wide' : 'bubble';
}

export function bubbleView(b: Bubble, s: ViewState): SafeHtml | null {
  if (b.kind === 'step') {
    const step = s.step;
    if (!step || step.id !== b.stepId) return null;
    const away = step.when !== 'today' && step.when !== 'yesterday';
    return html`${close('Not now')}
<p>${away ? 'Welcome back. ' : ''}${step.label}</p>
<span class="meta">Last wrap-up · ${cap(step.when)}</span>
<div class="row"><button class="btn fill grow" data-act="step-open" data-step="${step.id}">Step inside</button><button class="btn grow" data-act="rest-today" data-step="${step.id}">Rest today</button></div>`;
  }
  if (b.kind === 'first_run') {
    const kinds = b.groups === 1 ? 'one kind of work' : `about ${b.groups} kinds of work`;
    return html`${close('Not now')}
<p>Hi, I'm sidy. I can see ${b.tabs} tabs — ${kinds}.</p>
<span class="meta">When you stop for the day, I'll fold them into groups.</span>
<div class="row"><button class="btn fill grow" data-act="show-me">Show me</button></div>`;
  }
  const time = b.minutes === 60 ? 'The hour you asked for is up.' : `The ${b.minutes} minutes you asked for are up.`;
  return html`${close('Close')}
<p>${time} Set today aside?</p>
<div class="row"><button class="btn fill grow" data-act="answer" data-answer="set_aside">Set aside</button><button class="btn grow" data-act="answer" data-answer="keep_going">Keep going</button><button class="btn grow" data-act="answer" data-answer="not_today">Not today</button></div>`;
}

export function toastView(t: Toast): SafeHtml {
  if (t.kind === 'hidden') {
    return html`<div class="toast" role="status">sidy is hidden. Press <kbd style="color:var(--ink)">⌃⌥S</kbd> or click Side in the Dock.<button class="btn sm" data-act="bring-back">Bring back</button></div>`;
  }
  return html`<div class="bubble short" role="status">${close('Close')}<p style="margin-bottom:0">${t.text}</p></div>`;
}
