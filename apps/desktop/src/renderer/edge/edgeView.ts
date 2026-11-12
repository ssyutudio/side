// What the edge window draws: sidy tucked at the right edge, and at most one bubble or toast.
// Pure functions from state to HTML, so every state is tested without a DOM.
import type { ViewState } from '../../main/viewState';
import type { Bubble } from '../../main/speakService';
import type { Toast } from '../shared/api';
import { html, raw, type SafeHtml } from '../shared/html';
import { sidySvg } from '../shared/sidy';
import { t, tn } from '../../i18n';

export type EdgeMode = 'quiet' | 'out' | 'hidden';

const cap = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** Quiet: only ~48% of sidy shows (eyes, no blue). Out: ~92% shows, blue side included. */
export function edgeView(o: { mode: EdgeMode; size: number; hitY: number; hitSize: number }): SafeHtml {
  if (o.mode === 'hidden') return raw('');
  const q = Math.round(o.size * 0.52);
  const out = Math.round(o.size * 0.08);
  const cls = o.mode === 'quiet' ? 'tucked' : 'out';
  return html`<div class="edge ${cls}" style="top:${o.hitY}px;height:${o.hitSize}px;--q:${q}px;--o:${out}px">
<button class="hit" data-act="sidy" style="height:${o.hitSize}px;min-width:${o.hitSize}px" aria-label="${t('sidy — open Side')}"><span class="body">${raw(sidySvg(o.size))}</span></button></div>`;
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
    const away = step.whenKind === 'earlier';
    return html`${close(t('Not now'))}
<p>${away ? `${t('Welcome back.')} ` : ''}${step.label}</p>
<span class="meta">${t('Last wrap-up')} · ${cap(step.when)}</span>
<div class="row"><button class="btn fill grow" data-act="step-open" data-step="${step.id}">${t('Step inside')}</button><button class="btn grow" data-act="rest-today" data-step="${step.id}">${t('Rest today')}</button></div>`;
  }
  if (b.kind === 'first_run') {
    const kinds = b.groups === 1 ? t('one kind of work') : t('about {n} kinds of work', { n: b.groups });
    return html`${close(t('Not now'))}
<p>${tn(b.tabs, "Hi, I'm sidy. I can see {n} tab — {kinds}.", "Hi, I'm sidy. I can see {n} tabs — {kinds}.", { kinds })}</p>
<span class="meta">${t("When you stop for the day, I'll fold them into groups.")}</span>
<div class="row"><button class="btn fill grow" data-act="show-me">${t('Show me')}</button></div>`;
  }
  const time = b.minutes === 60 ? t('The hour you asked for is up.') : t('The {minutes} minutes you asked for are up.', { minutes: b.minutes });
  return html`${close(t('Close'))}
<p>${time} ${t('Set today aside?')}</p>
<div class="row"><button class="btn fill grow" data-act="answer" data-answer="set_aside">${t('Set aside')}</button><button class="btn grow" data-act="answer" data-answer="keep_going">${t('Keep going')}</button><button class="btn grow" data-act="answer" data-answer="not_today">${t('Not today')}</button></div>`;
}

export function toastView(toast: Toast): SafeHtml {
  if (toast.kind === 'hidden') {
    // The key shows {keys}; the shortcut is drawn in its place.
    const [before, after = ''] = t('sidy is hidden. Press {keys} or click Side in the Dock.').split('{keys}');
    // One text block (the key inline), so the sentence doesn't break into separate flex pieces.
    return html`<div class="toast" role="status"><span class="tt">${before}<kbd style="color:var(--ink)">⌃⌥S</kbd>${after}</span><button class="btn sm" data-act="bring-back">${t('Bring back')}</button></div>`;
  }
  return html`<div class="bubble short" role="status">${close(t('Close'))}<p style="margin-bottom:0">${toast.text}</p></div>`;
}
