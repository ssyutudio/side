// Korean for the core strings. Keys are the exact English passed to t(), tn() or k().
export const CORE: Record<string, string> = {
  // Group names the rules make (they also become Chrome tab-group titles)
  'Breaks': '쉬는 탭',
  'Not sorted yet': '아직 안 나눔',
  'Local dev': '로컬 개발',
  'Google Doc': 'Google 문서',
  'Figma file': 'Figma 파일',
  'Notion page': 'Notion 페이지',
  'New group': '새 그룹',

  // The next step
  '{work} is ready where you stopped.': '{work}, 보던 곳에서 바로 열 수 있어요.',
  '{work} is ready to open.': '{work}, 바로 열 수 있어요.',
  '{name} is ready to open in {tool}.': '{name}, {tool}에서 바로 열 수 있어요.',

  // One more hour
  'Sure, keep going. What you did so far is saved.': '네, 계속하셔도 돼요. 지금까지 한 일은 저장해 뒀어요.',
  'Sleep now and you get {amount} before {wake}.': '지금 자면 {wake} 전까지 {amount} 동안 잘 수 있어요.',
  '{n} hour': '{n}시간',
  '{n} hours': '{n}시간',
  '{n} minute': '{n}분',
  '{n} minutes': '{n}분',
  'When do you want to stop?': '언제 멈출까요?',
  'This is the time you picked.': '정한 시간이 됐어요.',
  'Set aside': 'Set aside',
  'Keep going': '계속하기',
  'Not today': '오늘은 안 할래요',
  '{time} AM': '오전 {time}',
  '{time} PM': '오후 {time}',

  // What you did today
  'Set aside {tabs} in {groups}.': '{tabs}를 {groups}로 정리했어요.',
  '{n} tab': '탭 {n}개',
  '{n} tabs': '탭 {n}개',
  '{n} group': '그룹 {n}개',
  '{n} groups': '그룹 {n}개',
  'Came back to {work}.': '{work}에 돌아왔어요.',
  'Kept going on {work} for 10+ minutes.': '{work} 작업을 10분 넘게 이어갔어요.',

  // Date labels
  'today': '오늘',
  'yesterday': '어제',
  '{wd}, {mo} {dd}': '{mo} {dd}일 ({wd})',
  'Sun': '일',
  'Mon': '월',
  'Tue': '화',
  'Wed': '수',
  'Thu': '목',
  'Fri': '금',
  'Sat': '토',
  'Jan': '1월',
  'Feb': '2월',
  'Mar': '3월',
  'Apr': '4월',
  'May': '5월',
  'Jun': '6월',
  'Jul': '7월',
  'Aug': '8월',
  'Sep': '9월',
  'Oct': '10월',
  'Nov': '11월',
  'Dec': '12월',

  // Today so far, and what Side saw
  'sidy offered one step: {work}': 'sidy가 한 걸음을 알려 줬어요: {work}',
  'You stepped inside': 'Step inside를 눌렀어요',
  'You stepped inside — page ready in {secs} s': 'Step inside를 눌렀어요 — {secs}초 만에 열렸어요',
  'Still on {work} 10 minutes later': '10분 뒤에도 {work} 작업 중이었어요',
  'Moved on within 10 minutes': '10분 안에 다른 일로 넘어갔어요',
  'Not captured': '저장 안 됨',
  '{percent}% down the page': '페이지 {percent}% 지점',
  'Top of page': '페이지 맨 위',
  'Left open': '열어 둠',

  // By your side
  'sidy is still learning what gets you started. {steps} opened so far — after {learn}, it can tell you which kind works for you.':
    'sidy는 어떻게 시작하면 좋은지 아직 배우는 중이에요. 지금까지 {steps}를 열었어요 — {learn}개가 되면 어떤 방식이 맞는지 알려 줄 수 있어요.',
  '{steps} opened so far. sidy checks 10 minutes after each one whether you kept going.':
    '지금까지 {steps}를 열었어요. sidy는 열고 10분 뒤에 계속했는지 확인해요.',
  'Of {steps} you opened and stayed with long enough to tell, {kept} kept you going past 10 minutes.':
    '열고 확인할 만큼 머문 {steps} 중 {kept}개는 10분 넘게 이어졌어요.',
  '{n} step': '걸음 {n}개',
  '{n} steps': '걸음 {n}개',

  // Ask sidy
  'Set aside today': 'Set aside today',
  'Open the next step': '다음 한 걸음 열기',
  'One more hour': '한 시간만 더',
  'Quiet for 1 hour': '1시간 조용히',
  'Hide sidy': 'sidy 숨기기',
  'Open Side': 'Open Side',
  'Exclude this site': '이 사이트 제외하기',
  'I can do these:': '이런 걸 할 수 있어요:',
  "That's outside what I do. I help you get back into your own work. I can do these:":
    '그건 제가 하는 일이 아니에요. 저는 하던 일로 돌아가도록 도와요. 이런 걸 할 수 있어요:',
  "I can't do that for you. I can open your work so you can do it yourself. I can do these:":
    '그건 대신 해 드릴 수 없어요. 직접 할 수 있게 하던 일을 열어 드릴 수는 있어요. 이런 걸 할 수 있어요:',
  "I don't give guides. Search for: {phrase}": '안내는 드리지 않아요. 이렇게 검색해 보세요: {phrase}',
  "I don't give guides. A quick search will find one.": '안내는 드리지 않아요. 잠깐 검색하면 찾을 수 있어요.',
  "I'm here. When you're ready, one small step is waiting.": '여기 있어요. 준비되면 작은 한 걸음이 기다리고 있어요.',
  'This is beyond what Side is for. Please reach out to someone you trust or a professional now. If you might act on this, please call or text 988 in the US or Canada, 109 in Korea, or your local emergency number.':
    '이 일은 Side가 다룰 수 있는 범위를 넘어요. 지금 믿을 수 있는 사람이나 전문가에게 연락해 주세요. 스스로를 해칠 수도 있겠다 싶으면 한국은 109, 미국과 캐나다는 988, 또는 가까운 응급 번호로 전화하거나 문자를 보내 주세요.',
  'Asking sidy…': 'sidy에게 묻는 중…',

  // What Claude is asked (the rest of each prompt stays English; these parts name the language)
  'Names are plain English, at most 40 characters, no emoji. ': 'Names are plain, natural Korean (한국어), at most 40 characters, no emoji. ',
  'Put videos and social feeds in a group named "Breaks". ': 'Put videos and social feeds in a group named "쉬는 탭". ',
  'Plain English, each under 70 characters, each ending with "?". ': 'Plain, natural Korean (한국어) in a friendly 해요체 tone, each under 70 characters, each ending with "?". ',
  'Write ONE short, plain English sentence (under 160 characters) telling a person what their own numbers say about ':
    'Write ONE short, plain, natural Korean (한국어) sentence in a friendly 해요체 tone (under 100 characters, ending with a period) telling a person what their own numbers say about ',
  '"search":"<for how_to: a short English search query under 40 characters, else null>"}':
    '"search":"<for how_to: a short Korean (한국어) search query under 40 characters, else null>"}',

  // Desktop apps: what happened when a file was opened
  "Couldn't find {tool} on this computer.": '이 컴퓨터에서 {tool} 앱을 찾지 못했어요.',
  "Couldn't find that file. It may have been moved or renamed.": '그 파일을 찾지 못했어요. 옮기거나 이름을 바꿨을 수 있어요.',
  "Couldn't open it in {tool}.": '{tool}에서 열 수 없었어요.',
  "That action isn't available any more.": '그 동작은 더 이상 쓸 수 없어요.',
  'Opened it, but no further. To allow the rest, turn on {tool} under the app running Side, in System Settings > Privacy & Security > Automation.':
    '열기만 했어요. 나머지를 허용하려면 시스템 설정 > 개인정보 보호 및 보안 > 자동화에서 Side를 실행 중인 앱 아래의 {tool} 항목을 켜 주세요.',
  "Opened it, but no further. {tool} isn't answering. Check for a window waiting on you.":
    '열기만 했어요. {tool} 앱이 응답하지 않아요. 기다리는 창이 있는지 확인해 보세요.',
  'Opened it, but no further.': '열기만 했어요.',
  "{tool} was already running, so I only brought it to the front. I didn't open the file, so nothing unsaved is touched.":
    '{tool} 앱이 이미 실행 중이어서 앞으로만 가져왔어요. 파일은 열지 않았으니 저장 안 한 내용은 그대로예요.',
  'Open {name} in {tool}': '{tool}에서 {name} 열기',
  'Open {tool}': '{tool} 열기',
  'Open {tool}. Look for {name}': '{tool} 열기 (찾을 파일: {name})',
  'Go to the last filled cell of {name} in {tool}': '{tool}에서 {name}의 마지막 입력 셀로 가기',
  'Go to the end of {name} in {tool}': '{tool}에서 {name}의 끝으로 가기',
  'Go to the last slide of {name} in {tool}': '{tool}에서 {name}의 마지막 슬라이드로 가기',
  'Play the last slide of {name} as a slide show': '{name}의 마지막 슬라이드를 슬라이드 쇼로 재생',
  'Open a one-line SELECT 1 in {tool}': '{tool}에서 한 줄짜리 SELECT 1 열기',
  'Play the last ten seconds of {look} in {tool}': '{tool}에서 {look}의 마지막 10초 재생',
  'Hear the last ten seconds of {look} in {tool}': '{tool}에서 {look}의 마지막 10초 듣기',
  'Hear the first ten seconds of {look}': '{look}의 처음 10초 듣기',
  'Look at {look} in {tool}': '{tool}에서 {look} 보기',
};

/** Words that make a suggestion or sentence advice (kept out of what Claude writes), like the English list. */
export const KO_ADVICE = /(해야|하는 게 좋|수면|잠을|건강|진단|우울|불안|치료|ADHD)/i;

/**
 * Korean phrasings for Ask sidy's word rules (AI drafting off, or Claude unreachable). Same fixed
 * actions as the English rules. \b does not work with Hangul, so these use plain patterns.
 */
export const KO_ASK = {
  rules: [
    { re: /(오늘\s*(은\s*)?(끝|마무리|그만)|오늘\s*정리|하루\s*(끝|마무리)|마무리|퇴근|탭\s*(접|정리)|정리\s*(할래|할게|해\s*줘|하기)|그만\s*할래)/, action: 'set_aside' as const },
    { re: /(30\s*분|삼십\s*분|반\s*시간)/, action: 'set_session_check' as const, minutes: 30 as const },
    { re: /(한\s*시간|1\s*시간|계속\s*(할래|하기|할게|해))/, action: 'set_session_check' as const, minutes: 60 as const },
    { re: /(다음\s*(한\s*)?걸음|이어서\s*(하기|할래|할게|해)|어디까지\s*(했|봤)|보던\s*(곳|거)|시작\s*(할래|할게|해|하기)|다시\s*시작)/, action: 'open_step' as const },
    { re: /(조용|방해\s*(하지|마)|말\s*걸지|집중\s*(모드|할래))/, action: 'quiet_hour' as const },
    { re: /(숨겨|숨기|사라져|안\s*보이게)/, action: 'hide' as const },
    { re: /(이\s*사이트.*(제외|읽지|보지|무시)|제외\s*(해|할래|하기)|(제외|무시).*사이트)/, action: 'exclude_site' as const },
    { re: /(side\s*열|설정|기록|메인\s*(창|화면)|뭘?\s*봤)/i, action: 'open_main' as const },
  ],
  howTo: /(어떻게\s*(해|하|쓰|만들|써)|방법|사용법|튜토리얼|하는\s*법)/,
  outside: /((결제|구매|주문|송금|이체|예약|삭제|트윗|게시|메일|문자|전화).{0,30}(대신|해\s*줘|보내\s*줘)|대신\s*(해|보내|결제|사))/,
  /** Despair or hurting oneself: the same backstop as the English patterns. */
  crisis: /(죽고\s*싶|자살|자해|목숨을?\s*끊|살고\s*싶지\s*않|사라지고\s*싶|살기\s*싫|죽어\s*버리고)/,
};
