// Every window draws in the language picked in Settings. Headless captures pick it with ?lang=ko.
import type { ViewState } from '../../main/viewState';
import { setLanguage } from '../../i18n';
import type { SideApi } from './api';

/** Sets the words and the page's lang (Korean line breaking) before a draw. No state yet: unchanged. */
export function applyLanguage(api: SideApi, s: ViewState | null): void {
  if (!api.fixture && !s) return;
  const lang = api.fixture ? (api.params.get('lang') === 'ko' ? 'ko' : 'en') : s?.settings.language === 'ko' ? 'ko' : 'en';
  setLanguage(lang);
  document.documentElement.lang = lang;
}
