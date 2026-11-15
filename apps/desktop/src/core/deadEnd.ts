// Tabs that are not the work itself, so they must never be the one step: a page that failed to load,
// a bot check, a sign-in wall, a dev server on this computer (usually stopped by the next day). They
// still fold into groups like any tab; they are only left out of what a step may open.
import { KO_DEAD_END_TITLE } from '../i18n/ko/core';

const LOCAL_HOST = /^(localhost|127\.\d+\.\d+\.\d+|0\.0\.0\.0|\[::1\]|.+\.local|.+\.localhost)$/i;
const SIGN_IN_HOST = /^(accounts\.google\.com|login\.[^.]+\..+|signin\.[^.]+\..+|auth\.[^.]+\..+|appleid\.apple\.com|login\.microsoftonline\.com)$/i;
const SIGN_IN_PATH = /(^|\/)([^/]*(login|log-in|signin|sign-in|sign_in)[^/]*|auth|sso|session\/new)(\/|$)/i;
const DEAD_END_TITLE =
  /^(just a moment|attention required|access denied|are you a robot|verify you are human|prove your humanity|security check|sign in|log in|login\b|404\b|page not found|this site can.t be reached|err_)|(prove your humanity|page not found|404 not found)/i;

/** True when opening this tab tomorrow would not put the person back into their work. */
export function isDeadEnd(tab: { url: string; title?: string | null }): boolean {
  let u: URL;
  try {
    u = new URL(tab.url);
  } catch {
    return true;
  }
  if (LOCAL_HOST.test(u.hostname)) return true;
  if (SIGN_IN_HOST.test(u.hostname) || SIGN_IN_PATH.test(u.pathname)) return true;
  const title = (tab.title ?? '').trim();
  if (!title) return false;
  if (DEAD_END_TITLE.test(title) || KO_DEAD_END_TITLE.test(title)) return true;
  // Chrome titles a page that failed to load with its address ("localhost", "map.example.com/p/").
  const bare = title.replace(/^https?:\/\//i, '').replace(/\/+$/, '').toLowerCase();
  const addr = (u.host + u.pathname).replace(/\/+$/, '').toLowerCase();
  return bare === u.host.toLowerCase() || bare === addr;
}
