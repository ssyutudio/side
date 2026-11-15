// The extension page that asks Chrome for every site, so Side can remember the reading spot on any
// page (not only the few sites in the manifest). Chrome only shows the permission prompt after a
// click on an extension page; the app opens this page with `allow.open`.
import { EVERY_SITE } from './api';
import type { ChromeApi } from './api';
import { language, loadLanguage, say } from './lang';

export type AllowState = 'ask' | 'granted' | 'denied';

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function allowView(state: AllowState): string {
  const head = `<h1>${esc(say('Let Side remember where you stopped, on every site'))}</h1>`;
  const why = `<p>${esc(say('Right now Side remembers your reading spot only on a few sites: Google Docs, GitHub, MDN, Wikipedia, Stack Overflow, Notion and Hacker News. Allow every site, and the next step opens any page where you left off.'))}</p>`;
  const what = `<p class="note">${esc(say('When you leave a tab, Side reads only how far down you were and one visible sentence, and keeps them on this computer. Excluded sites and incognito windows are never read. You can take this back any time in chrome://extensions.'))}</p>`;
  if (state === 'granted') return `${head}<p class="done" role="status">${esc(say('Done. Side now remembers where you stopped on every site. You can close this tab.'))}</p>${what}`;
  const denied = state === 'denied' ? `<p class="note" role="status">${esc(say('Not allowed. Side keeps remembering on the few sites above.'))}</p>` : '';
  return `${head}${why}${what}${denied}<button type="button" id="allow">${esc(say('Allow on every site'))}</button>`;
}

interface PermissionsApi {
  contains(p: { origins: string[] }): Promise<boolean>;
  request(p: { origins: string[] }): Promise<boolean>;
}

export async function startAllowPage(api: ChromeApi, permissions: PermissionsApi, root: { innerHTML: string; querySelector(s: string): { addEventListener(t: string, f: () => void): void } | null }): Promise<void> {
  await loadLanguage(api);
  const draw = (state: AllowState) => {
    root.innerHTML = allowView(state);
    root.querySelector('#allow')?.addEventListener('click', () => {
      void permissions.request({ origins: EVERY_SITE }).then((ok) => draw(ok ? 'granted' : 'denied'), () => draw('denied'));
    });
  };
  draw((await permissions.contains({ origins: EVERY_SITE }).catch(() => false)) ? 'granted' : 'ask');
}

const page = globalThis as { chrome?: { permissions?: PermissionsApi }; document?: Document };
if (page.document && page.chrome?.permissions) {
  const doc = page.document;
  void startAllowPage(page.chrome as unknown as ChromeApi, page.chrome.permissions, doc.getElementById('app')!).then(() => {
    doc.documentElement.lang = language();
  });
}
