// Korean for the extension's few words. Keys are the exact English; {name} marks a value.
// Terms and tone follow apps/desktop/src/i18n/ko/GLOSSARY.md (this bundle cannot import it).
export const KO: Record<string, string> = {
  'Nothing to set aside.': '정리할 것이 없어요.',
  'Tab {id} was placed in two works.': '탭 {id}이(가) 두 작업에 들어 있었어요.',
  'This set-aside was already undone.': '이 정리는 이미 되돌렸어요.',
  'There is nothing to undo for this set-aside.': '이 정리에는 되돌릴 것이 없어요.',
  'Side only opens web pages.': 'Side는 웹 페이지만 열 수 있어요.',
  'That address is not valid.': '주소가 올바르지 않아요.',
  "Chrome could not save Side's record, so no tab was changed. ({detail})": 'Chrome이 Side의 기록을 저장하지 못해서 탭은 바뀌지 않았어요. ({detail})',
  'Chrome did not finish the change. ({detail})': 'Chrome이 변경을 끝내지 못했어요. ({detail})',
  'Something unexpected happened. ({detail})': '예상하지 못한 일이 생겼어요. ({detail})',
  'You stopped here': '여기까지 봤어요',
  'Let Side remember where you stopped, on every site': '모든 사이트에서 멈춘 곳을 기억하게 하기',
  'Right now Side remembers your reading spot only on a few sites: Google Docs, GitHub, MDN, Wikipedia, Stack Overflow, Notion and Hacker News. Allow every site, and the next step opens any page where you left off.':
    '지금은 Google Docs, GitHub, MDN, Wikipedia, Stack Overflow, Notion, Hacker News 몇 곳에서만 읽던 곳을 기억해요. 모든 사이트를 허용하면 다음 한 걸음이 어떤 페이지든 멈춘 곳에서 열려요.',
  'When you leave a tab, Side reads only how far down you were and one visible sentence, and keeps them on this computer. Excluded sites and incognito windows are never read. You can take this back any time in chrome://extensions.':
    '탭을 떠날 때 얼마나 내려가 있었는지와 보이는 한 문장만 읽고, 이 컴퓨터에만 둬요. 제외한 사이트와 시크릿 창은 읽지 않아요. chrome://extensions에서 언제든 되돌릴 수 있어요.',
  'Allow on every site': '모든 사이트 허용',
  'Done. Side now remembers where you stopped on every site. You can close this tab.': '됐어요. 이제 모든 사이트에서 멈춘 곳을 기억해요. 이 탭은 닫아도 돼요.',
  'Not allowed. Side keeps remembering on the few sites above.': '허용하지 않았어요. 위의 몇 사이트에서만 계속 기억해요.',
};
