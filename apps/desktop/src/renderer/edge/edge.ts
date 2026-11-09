// Edge window glue: draws sidy and the one bubble, reports where clicks must land, and sends the
// user's choices to the app. Everything outside sidy, the bubble and the toast lets clicks through.
import type { ViewState } from '../../main/viewState';
import type { Bubble } from '../../main/speakService';
import { getApi, type Toast } from '../shared/api';
import { bubbleView, edgeView, toastView } from './edgeView';

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

function rightOffset() {
  return Math.round(size * 0.92) + 18;
}

function render() {
  const hiddenToast = toast?.kind === 'hidden';
  const mode = state?.hidden || hiddenToast ? 'hidden' : bubble || toast ? 'out' : 'quiet';
  let overlay = '';
  const inner = bubble && state ? bubbleView(bubble, state) : null;
  if (inner) overlay = `<div class="bubble" role="status">${inner}</div>`;
  else if (toast) overlay = String(toastView(toast));
  app.innerHTML = String(edgeView({ mode, size, hitY: hit.y, hitSize: hit.h })) + overlay;
  const box = app.querySelector<HTMLElement>('.bubble, .toast');
  if (box) {
    const center = hit.y + hit.h / 2;
    box.style.top = `${center}px`;
    box.style.transform = 'translateY(-50%)';
    if (box.classList.contains('toast')) box.style.right = '16px';
    else box.style.right = `${rightOffset()}px`;
  }
  if (inner && bubble !== drawnFor) {
    drawnFor = bubble;
    // Counted as shown only once it is really on screen.
    requestAnimationFrame(() => requestAnimationFrame(() => void api.invoke('side:bubble.drawn')));
  }
}

function showToast(t: Toast) {
  toast = t;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast = null;
    render();
  }, t.ms);
  render();
}

function openedText(r: { kind: string; restored?: string; message?: string }): string {
  if (r.kind === 'opened') return r.restored === 'top' ? "Opened the page. sidy couldn't find the exact spot." : 'Opened where you stopped.';
  if (r.kind === 'failed') return `Chrome couldn't open it. ${r.message ?? ''}`.trim();
  if (r.kind === 'unconfirmed') return "Chrome didn't answer, so sidy can't say the page opened. Look at Chrome, or try again from Mini.";
  return 'That step is no longer there.';
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
    showToast({ text: 'Opening it in Chrome…', ms: 15000 });
    void api.invoke('side:bubble.close');
    const r = await api.invoke<{ kind: string; restored?: string; message?: string }>('side:step.open', { stepId: el.dataset.step });
    return showToast({ text: openedText(r), ms: 4000 });
  }
  if (a === 'rest-today' && el.dataset.step) {
    bubble = null;
    void api.invoke('side:step.dismiss', { stepId: el.dataset.step, kind: 'rest_today' });
    void api.invoke('side:bubble.close');
    return showToast({ text: "Okay. Rest today — I'll stay quiet until tomorrow.", ms: 3500 });
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
    if (answer === 'not_today') showToast({ text: 'Okay. Your tabs stay as they are. Good night.', ms: 3500 });
  }
}

app.addEventListener('click', (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
  if (el) void act(el);
});

window.addEventListener('mousemove', (e) => {
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
  if (interactive) {
    interactive = false;
    api.setInteractive(false);
  }
  if (!bubble && !toast) render();
});

api.onLayout((l) => {
  size = l.sidyHeight;
  hit = { y: l.hit.y, h: l.hit.height };
  render();
});
api.onState((s) => {
  state = s;
  render();
});
api.onBubble((b) => {
  bubble = b;
  if (b) toast = null;
  render();
});
api.onToast((t) => showToast(t));
void api.invoke<ViewState>('side:state').then((s) => {
  if (s && 'connection' in s) {
    state = s;
    render();
  }
});
