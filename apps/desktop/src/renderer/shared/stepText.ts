// What sidy says after Step inside, from what the tool really confirmed. One place for the bubble
// and Mini, so both say the same thing.

import { t } from '../../i18n';

export interface StepOpenReply {
  kind: string;
  restored?: string;
  message?: string | null;
  reason?: string;
  /** Desktop apps: "ran" when the app also did its one action, "opened" when it only opened the file. */
  did?: string;
  tool?: string;
  label?: string;
  name?: string;
}

export function stepOpenedText(r: StepOpenReply): string {
  if (r.kind === 'opened') return r.restored === 'top' ? t("Opened the page. sidy couldn't find the exact spot.") : t('Opened where you stopped.');
  if (r.kind === 'app_opened') {
    // Say only what the app confirmed. A partial answer carries the adapters' own sentence.
    if (r.did === 'ran') return r.label ? t('{text} — done.', { text: r.label }) : t('Opened {name} in {tool} — done.', { name: r.name ?? '', tool: r.tool ?? '' });
    const opened = t('Opened {name} in {tool}.', { name: r.name ?? '', tool: r.tool ?? '' });
    const msg = r.message ?? '';
    // The adapters' sentence comes in the screen language, so its opening words do too.
    const PARTIAL = t('Opened it, but no further.');
    if (!msg) return opened;
    // "Opened, but the one action didn't run": keep the reason (and where to allow it), drop the repeat.
    if (msg.startsWith(PARTIAL)) return `${opened} ${msg.slice(PARTIAL.length).trim()}`.trim();
    // Anything else (the app was already running, so the file wasn't passed) is said as it is.
    return msg;
  }
  if (r.kind === 'app_failed') return r.message || t("Couldn't open it in {tool}.", { tool: r.tool ?? '' });
  if (r.kind === 'failed') return `${t("Chrome couldn't open it.")} ${r.message ?? ''}`.trim();
  if (r.kind === 'unconfirmed' && r.reason === 'not_connected') return t("Chrome isn't connected. Open Chrome, then press Step inside again.");
  if (r.kind === 'unconfirmed') return t("Chrome didn't answer, so sidy can't say the page opened. Look at Chrome, or try again from Mini.");
  return t('That step is no longer there.');
}
