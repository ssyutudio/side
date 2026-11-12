// Ask sidy in Mini (approved mockups m1-mini-ask, -asking, -menu, -howto). One line in; at most one
// of a fixed list of actions out, run by the same route its own button uses. Every sentence shown is
// fixed wording from core/askSidy (askCopy); nothing written by a model is ever shown.
import { ASK_ACTIONS, askCopy, type AskActionId, type AskDecision } from '../../core/askSidy';
import { html, type SafeHtml } from '../shared/html';
import { t } from '../../i18n';

export interface AskLocal {
  line: string;
  state: 'idle' | 'asking' | 'reply';
  reply?: AskDecision;
}

function menu(lead: string): SafeHtml {
  return html`<div class="reply" role="status"><p>${t(lead)}</p>
<div class="acts">${ASK_ACTIONS.map((id) => html`<button type="button" data-act="ask-do" data-action="${id}">${t(askCopy.actions[id])}</button>`)}</div>
<p class="note" style="margin:8px 0 0">${t('Set aside today opens the preview first. Nothing closes.')}</p></div>`;
}

/** The sentence and buttons under the box for a decision that isn't simply run. */
function replyFor(d: AskDecision): SafeHtml {
  switch (d.kind) {
    case 'how_to':
      return d.search
        ? html`<div class="reply" role="status"><p>${t("I don't give guides. Search for:")}</p><div class="copy" style="margin-top:0"><code>${d.search}</code><button type="button" class="btn" data-act="ask-copy" data-text="${d.search}">${t('Copy')}</button></div></div>`
        : html`<div class="reply" role="status"><p>${t(askCopy.howTo(null))}</p></div>`;
    case 'declined':
      return menu(d.reason === 'outside_action' ? askCopy.outside : askCopy.offTopic);
    case 'buddy':
      return html`<div class="reply" role="status"><p>${t(askCopy.buddy)}</p></div>`;
    case 'crisis':
      return html`<div class="reply" role="alert"><p>${t(askCopy.crisis)}</p></div>`;
    default:
      return menu(askCopy.menu);
  }
}

export function askBlock(a: AskLocal): SafeHtml {
  const busy = a.state === 'asking';
  const under = busy
    ? html`<div class="row asking" role="status" aria-live="polite"><span class="spin"></span>${t(askCopy.asking)}</div>`
    : a.state === 'reply' && a.reply
      ? replyFor(a.reply)
      : html`<p class="note" style="margin:6px 0 0">${t('Tell sidy in a few words. Only this line goes to Claude, to pick one action. Set aside only opens the preview.')}</p>`;
  return html`<div class="ask field"><label for="ask">${t('Ask sidy')}</label>
<div class="row"><input id="ask" maxlength="300" placeholder="${t("e.g. I'm done for today")}" autocomplete="off" value="${a.line}"${busy ? ' aria-disabled="true" readonly' : ''}><button type="button" class="btn" data-act="ask"${busy ? ' aria-disabled="true"' : ''}>${t('Ask')}</button></div>
${under}</div>`;
}

/** Which of Mini's own buttons an action is, so Ask sidy can only do what a button does. */
export function actFor(id: AskActionId): string {
  return { set_aside: 'wrap', open_step: 'step-open', set_session_check: 'one-more', quiet_hour: 'focus', hide: 'hide', open_main: 'open-main', exclude_site: 'open-main' }[id];
}
