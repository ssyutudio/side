// Ask sidy in Mini (approved mockups m1-mini-ask, -asking, -menu, -howto). One line in; at most one
// of a fixed list of actions out, run by the same route its own button uses. Every sentence shown is
// fixed wording from core/askSidy (askCopy); nothing written by a model is ever shown.
import { ASK_ACTIONS, askCopy, type AskActionId, type AskDecision } from '../../core/askSidy';
import { html, raw, type SafeHtml } from '../shared/html';
import { t } from '../../i18n';

export interface AskLocal {
  line: string;
  state: 'idle' | 'asking' | 'reply';
  reply?: AskDecision;
}

/** What the screen knows that changes the box: whether there is a next step, and whether the line can go to Claude. */
export interface AskContext {
  /** False: "Open the next step" is not offered. Missing: offered. */
  hasStep?: boolean;
  /** False: AI drafting is off or there is no Claude key, so the line never leaves this computer. Missing: Claude. */
  claude?: boolean;
}

/** Exclude this site only opens Main (Mini can't pick its section), so its button says where it goes. */
function actionLabel(id: AskActionId): string {
  return id === 'exclude_site' ? t('Open Side, then Excluded sites') : t(askCopy.actions[id]);
}

function menu(lead: string, ctx: AskContext): SafeHtml {
  const ids = ASK_ACTIONS.filter((id) => id !== 'open_step' || ctx.hasStep !== false);
  return html`<div class="reply" role="status"><p>${t(lead)}</p>
<div class="acts">${ids.map((id) => html`<button type="button" data-act="ask-do" data-action="${id}">${actionLabel(id)}</button>`)}</div>
<p class="note" style="margin:8px 0 0">${t('Set aside today opens the preview first. Nothing closes.')}</p></div>`;
}

/** The sentence and buttons under the box for a decision that isn't simply run. */
function replyFor(d: AskDecision, ctx: AskContext): SafeHtml {
  switch (d.kind) {
    case 'how_to':
      return d.search
        ? html`<div class="reply" role="status"><p>${t("I don't give guides. Search for:")}</p><div class="copy" style="margin-top:0"><code>${d.search}</code><button type="button" class="btn" data-act="ask-copy" data-text="${d.search}">${t('Copy')}</button></div></div>`
        : html`<div class="reply" role="status"><p>${t(askCopy.howTo(null))}</p></div>`;
    case 'declined':
      return menu(d.reason === 'outside_action' ? askCopy.outside : askCopy.offTopic, ctx);
    case 'buddy':
      return html`<div class="reply" role="status"><p>${t(askCopy.buddy)}</p></div>`;
    case 'crisis':
      return html`<div class="reply" role="alert"><p>${t(askCopy.crisis)}</p></div>`;
    default:
      return menu(askCopy.menu, ctx);
  }
}

export function askBlock(a: AskLocal, ctx: AskContext = {}): SafeHtml {
  const busy = a.state === 'asking';
  const under = busy
    ? html`<div class="row asking" role="status" aria-live="polite"><span class="spin"></span>${t(askCopy.asking)}</div>`
    : a.state === 'reply' && a.reply
      ? replyFor(a.reply, ctx)
      : html`<p class="note" style="margin:6px 0 0">${ctx.claude === false
          ? t('Tell sidy in a few words. This line stays on this computer, and simple rules pick one action. Set aside only opens the preview.')
          : t('Tell sidy in a few words. Only this line goes to Claude, to pick one action. Set aside only opens the preview.')}</p>`;
  return html`<div class="ask field"><label for="ask">${t('Ask sidy')}</label>
<div class="row"><input id="ask" maxlength="300" placeholder="${t("e.g. I'm done for today")}" autocomplete="off" value="${a.line}"${raw(busy ? ' aria-disabled="true" readonly' : '')}><button type="button" class="btn" data-act="ask"${raw(busy ? ' aria-disabled="true"' : '')}>${t('Ask')}</button></div>
${under}</div>`;
}

/** Which of Mini's own buttons an action is, so Ask sidy can only do what a button does. */
export function actFor(id: AskActionId): string {
  return { set_aside: 'wrap', open_step: 'step-open', set_session_check: 'one-more', quiet_hour: 'focus', hide: 'hide', open_main: 'open-main', exclude_site: 'open-main' }[id];
}
