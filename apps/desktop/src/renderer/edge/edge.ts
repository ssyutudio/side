// Edge window glue: draws sidy and the one bubble, reports where clicks must land, and sends the
// user's choices to the app. Everything outside sidy, the bubble and the toast lets clicks through.
// Dragging sidy up or down moves it along the edge; a press that barely moves is still a click.
import type { ViewState } from '../../main/viewState';
import type { Bubble } from '../../main/speakService';
import { getApi, type Toast } from '../shared/api';
import { applyLanguage } from '../shared/lang';
import { t } from '../../i18n';
import { bubbleClass, bubbleView, edgeView, toastView } from './edgeView';
import { stepOpenedText, type StepOpenReply } from '../shared/stepText';

const api = getApi();
const app = document.getElementById('app')!;
let state: ViewState | null = null;
let bubble: Bubble | null = null;
let toast: Toast | null = null;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let size = 40;
let hit = { y: 86, h: 48 };
let interactive = false;
let drawnFor: Bubble | null = null;
/** A press on sidy: where it started (screen y) and how far the pointer sits from sidy's center. */
let drag: { startY: number; lastY: number; offset: number; pointer: number; moved: boolean } | null = null;
let suppressClick = false;
/** Where the pointer was last seen over this window, to recheck click-through after a redraw. */
let lastPointer: { x: number; y: number } | null = null;

function rightOffset() {
  return Math.round(size * 0.92) + 18;
}

// While sidy reacts (about 2 s), a state-only update must not redraw it: a redraw would wipe
// the notes and restart the motion. Bubbles and toasts still draw at once.
let reacting = false;
let deferred = false;

function render() {
  if (reacting && !bubble && !toast) {
    deferred = true;
    return;
  }
  applyLanguage(api, state);
  const hiddenToast = toast?.kind === 'hidden';
  const mode = state?.hidden || hiddenToast ? 'hidden' : bubble || toast || drag?.moved ? 'out' : 'quiet';
  let overlay = '';
  const inner = bubble && state ? bubbleView(bubble, state) : null;
  if (inner && bubble) overlay = `<div class="${bubbleClass(bubble)}" role="status">${inner}</div>`;
  else if (toast) overlay = String(toastView(toast));
  app.innerHTML = String(edgeView({ mode, size, hitY: hit.y, hitSize: hit.h })) + overlay;
  const box = app.querySelector<HTMLElement>('.bubble, .toast');
  if (box) {
    // Level with sidy, but whole inside the window when sidy sits near the top or bottom; the
    // tail keeps pointing at sidy.
    const center = hit.y + hit.h / 2;
    const h = box.offsetHeight;
    const top = Math.round(Math.min(Math.max(center - h / 2, 8), Math.max(8, window.innerHeight - h - 8)));
    box.style.top = `${top}px`;
    box.style.setProperty('--tail', `${Math.round(Math.min(Math.max(center - top, 18), h - 18))}px`);
    if (box.classList.contains('toast')) box.style.right = '16px';
    else box.style.right = `${rightOffset()}px`;
  }
  // Something under a still pointer may have just gone (a toast timed out, a bubble closed):
  // let clicks through again without waiting for the mouse to move.
  if (interactive && !drag && lastPointer && !document.elementFromPoint(lastPointer.x, lastPointer.y)?.closest('.hit, .bubble, .toast')) {
    interactive = false;
    api.setInteractive(false);
  }
  if (inner && bubble !== drawnFor) {
    drawnFor = bubble;
    // Counted as shown only once it is really on screen.
    requestAnimationFrame(() => requestAnimationFrame(() => void api.invoke('side:bubble.drawn')));
  }
}

function showToast(next: Toast) {
  toast = next;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    render();
  }, next.ms);
  render();
}


async function act(el: HTMLElement) {
  const a = el.dataset.act;
  if (a === 'sidy') return void api.invoke('side:mini.toggle');
  if (a === 'bring-back') {
    toast = null;
    return void api.invoke('side:hide', { hidden: false });
  }
  if (a === 'bubble-x') {
    if (bubble?.kind === 'step') void api.invoke('side:step.dismiss', { stepId: bubble.stepId, kind: 'not_now' });
    toast = null;
    bubble = null;
    render();
    return void api.invoke('side:bubble.close');
  }
  if (a === 'step-open' && el.dataset.step) {
    bubble = null;
    showToast({ text: t('Opening it in Chrome…'), ms: 15000 });
    void api.invoke('side:bubble.close');
    const r = await api.invoke<StepOpenReply>('side:step.open', { stepId: el.dataset.step });
    return showToast({ text: stepOpenedText(r), ms: 4000 });
  }
  if (a === 'rest-today' && el.dataset.step) {
    bubble = null;
    void api.invoke('side:step.dismiss', { stepId: el.dataset.step, kind: 'rest_today' });
    void api.invoke('side:bubble.close');
    return showToast({ text: t("Okay. Rest today — I'll stay quiet until tomorrow."), ms: 3500 });
  }
  if (a === 'show-me') {
    bubble = null;
    render();
    void api.invoke('side:bubble.close');
    return void api.invoke('side:mini.open', { view: 'wrap' });
  }
  if (a === 'answer' && el.dataset.answer) {
    const answer = el.dataset.answer;
    bubble = null;
    render();
    const r = await api.invoke<{ goToWrapup?: boolean }>('side:promise.answer', { answer });
    if (r?.goToWrapup) return void api.invoke('side:mini.open', { view: 'wrap' });
    if (answer === 'not_today') showToast({ text: t('Okay. Your tabs stay as they are. Good night.'), ms: 3500 });
  }
}

app.addEventListener('click', (e) => {
  if (suppressClick) return; // the click that ends a drag must not open Mini
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (el) void act(el);
});

// ---- drag sidy up or down ----

app.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !(e.target as HTMLElement).closest('.hit')) return;
  drag = { startY: e.screenY, lastY: e.screenY, offset: e.clientY - (hit.y + hit.h / 2), pointer: e.pointerId, moved: false };
});

/** Ends a press on sidy; after a real drag, the app remembers where sidy now is. */
function endDrag(screenY?: number) {
  const d = drag;
  drag = null;
  if (!d?.moved) return;
  suppressClick = true;
  setTimeout(() => (suppressClick = false), 0);
  void api.invoke('side:sidy.move', { y: Math.round((screenY ?? d.lastY) - d.offset), done: true });
  render();
}

window.addEventListener('pointermove', (e) => {
  if (!drag) return;
  // The button came up somewhere this page never heard about.
  if (!(e.buttons & 1)) return endDrag(e.screenY);
  if (!drag.moved && Math.abs(e.screenY - drag.startY) < 4) return;
  if (!drag.moved) {
    drag.moved = true;
    // Keep the pointer while the window moves under it (#app survives redraws; sidy's button
    // does not). Only now: a captured press would send a plain click to #app instead of sidy.
    app.setPointerCapture(drag.pointer);
    render();
  }
  drag.lastY = e.screenY;
  void api.invoke('side:sidy.move', { y: Math.round(e.screenY - drag.offset), done: false });
});
window.addEventListener('pointerup', (e) => endDrag(e.screenY));
window.addEventListener('pointercancel', () => endDrag());
window.addEventListener('blur', () => endDrag());

window.addEventListener('mousemove', (e) => {
  // While sidy is dragged the window keeps every mouse event, even when it lags the pointer.
  if (drag) return;
  lastPointer = { x: e.clientX, y: e.clientY };
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const over = !!el?.closest('.hit, .bubble, .toast');
  if (over !== interactive) {
    interactive = over;
    api.setInteractive(over);
  }
  const edge = app.querySelector('.edge');
  const onSidy = !!el?.closest('.hit');
  if (edge && !bubble && !toast) {
    edge.classList.toggle('out', onSidy);
    edge.classList.toggle('tucked', !onSidy);
  }
});
window.addEventListener('mouseleave', () => {
  if (drag) return;
  lastPointer = null;
  if (interactive) {
    interactive = false;
    api.setInteractive(false);
  }
  if (!bubble && !toast) render();
});

api.onLayout((l) => {
  // Moving the window along the edge sends the same layout again and again: nothing to redraw.
  if (size === l.sidyHeight && hit.y === l.hit.y && hit.h === l.hit.height) return;
  size = l.sidyHeight;
  hit = { y: l.hit.y, h: l.hit.height };
  render();
});
api.onState((s) => {
  const wasHidden = state?.hidden === true;
  state = s;
  // Hidden: no bubble waits behind the curtain to reappear later.
  if (s.hidden) bubble = null;
  // Brought back before the "sidy is hidden" note ran out: sidy shows at once.
  if (wasHidden && !s.hidden && toast?.kind === 'hidden') {
    clearTimeout(toastTimer);
    toast = null;
  }
  render();
});
api.onBubble((b) => {
  bubble = b;
  if (b) toast = null;
  render();
});
api.onToast((next) => showToast(next));

// Once, about two seconds, then still. Never with Reduce Motion, never over a bubble.
let reactTimer: ReturnType<typeof setTimeout> | undefined;
api.onReact((kind) => {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || bubble || toast) return;
  clearTimeout(reactTimer);
  document.body.classList.remove('react-stretch', 'react-nod', 'react-whistle');
  document.querySelector('.notes')?.remove();
  reacting = true;
  document.body.classList.add(`react-${kind}`);
  if (kind === 'whistle') {
    const notes = document.createElement('div');
    notes.className = 'notes';
    notes.setAttribute('aria-hidden', 'true');
    Object.assign(notes.style, { right: `${Math.round(size * 0.6) + 6}px`, top: `${Math.max(0, hit.y + hit.h / 2 - size)}px`, width: '40px', height: '40px' });
    notes.innerHTML = '<span style="left:14px;top:18px">♪</span><span style="left:4px;top:24px">♫</span><span style="left:20px;top:28px">♪</span>';
    // Outside #app, so a redraw of sidy never removes them.
    document.body.appendChild(notes);
  }
  reactTimer = setTimeout(() => {
    document.body.classList.remove(`react-${kind}`);
    document.querySelector('.notes')?.remove();
    reacting = false;
    if (deferred) {
      deferred = false;
      render();
    }
  }, 2400);
});
// A bubble decided before this page finished loading (e.g. at app start) arrives with the state.
void api.invoke<ViewState>('side:state').then((s) => {
  if (s && 'connection' in s) {
    state = s;
    if (s.bubble && !bubble) bubble = s.bubble;
    render();
  }
});
