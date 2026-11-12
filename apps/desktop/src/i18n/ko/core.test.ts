// Korean words made by the core logic, the viewState and the connectors, and the English prompts
// that must not change. Lives here because Hangul may only appear under i18n/ko.
import type { SavedTab, SetAside, Step, TabsReport, TabSnapshot } from '@side/shared';
import { setLanguage } from '..';
import { buildViewState } from '../../main/viewState';
import { defaultAppData } from '../../main/appData';
import { localizeAppLabel } from '../../main/connectors/desktopApps';
import { askCopy, buildAskRequest, decideByWords, detectCrisis } from '../../core/askSidy';
import { fixedClock } from '../../core/clock';
import { done, groupNames, oneMoreHour as moreCopy, step as stepCopy } from '../../core/copy';
import { dayLabel } from '../../core/dateLabel';
import { displayGroupName, groupTabs } from '../../core/grouping';
import { buildGroupingRequest, parseGroupingAnswer } from '../../core/llmGrouping';
import { buildSuggestRequest, parseSuggestions } from '../../core/llmHelp';
import { buildBySideRequest, parseBySide, ruleBySide } from '../../core/llmHelpBySide';
import { oneMoreHour } from '../../core/promise';
import { newGroup } from '../../core/previewEdit';
import { stepLabelFor } from '../../core/step';
import type { SideNumbers } from '../../core/stats';
import type { WrapupPreview } from '../../core/wrapupPreview';

afterEach(() => setLanguage('en'));

const at = (d: number, h: number, m = 0) => new Date(2026, 10, d, h, m).getTime();
const tab = (tabId: number, url: string, title: string): TabSnapshot => ({
  tabId, windowId: 1, index: tabId, url, title, lastAccessed: tabId, active: false, pinned: false,
  audible: false, incognito: false, groupId: -1, groupTitle: null, position: null,
});

describe('Korean copy', () => {
  it('writes the step label, today lines and group names in Korean', () => {
    setLanguage('ko');
    expect(stepCopy.label('retry-lib', null, true)).toBe('retry-lib, 보던 곳에서 바로 열 수 있어요.');
    expect(stepCopy.label('retry-lib', 'why?', false)).toBe('“why?” — retry-lib, 바로 열 수 있어요.');
    expect(stepCopy.appLabel('Q3', 'Excel', null)).toBe('Q3, Excel에서 바로 열 수 있어요.');
    expect(done.setAside(3, 1)).toBe('탭 3개를 그룹 1개로 정리했어요.');
    expect(done.stepClicked('Docs')).toBe('Docs에 돌아왔어요.');
    expect(done.keptGoing('Docs')).toBe('Docs 작업을 10분 넘게 이어갔어요.');
    expect(groupNames.breaks).toBe('쉬는 탭');
    expect(groupNames.unsorted).toBe('아직 안 나눔');
    expect(groupTabs([tab(1, 'https://www.youtube.com/watch?v=x', 'Lo-fi')]).map((g) => g.name)).toEqual(['쉬는 탭']);
    expect(groupTabs([tab(1, 'http://localhost:3000/', 'App')]).map((g) => g.name)).toEqual(['로컬 개발']);
  });

  it('writes date labels in Korean', () => {
    setLanguage('ko');
    expect(dayLabel(at(10, 1, 30), at(9, 23))).toBe('오늘');
    expect(dayLabel(at(10, 1, 30), at(10, 19))).toBe('어제');
    expect(dayLabel(at(9, 23), at(12, 11))).toBe('11월 9일 (월)');
  });

  it('writes the one more hour fact in Korean, and keeps the English', () => {
    expect(oneMoreHour(at(10, 0), 7 * 60).fact).toBe('Sleep now and you get 7 hours before 7:00 AM.');
    setLanguage('ko');
    const r = oneMoreHour(at(10, 0), 7 * 60);
    expect(r.fact).toBe('지금 자면 오전 7:00 전까지 7시간 동안 잘 수 있어요.');
    expect(r.respect).toBe(moreCopy.respect);
    expect(moreCopy.minutes(30)).toBe('30분');
    expect(moreCopy.actions.setAside).toBe('Set aside');
  });

  it('answers Ask sidy with fixed Korean wording and takes Korean lines', () => {
    setLanguage('ko');
    expect(askCopy.actions.set_aside).toBe('Set aside today');
    expect(askCopy.howTo('x')).toContain('x');
    expect(decideByWords('오늘 끝')).toMatchObject({ kind: 'action', action: 'set_aside' });
    expect(decideByWords('한 시간만 더 할래')).toMatchObject({ action: 'set_session_check', minutes: 60 });
    expect(decideByWords('30분만 더')).toMatchObject({ action: 'set_session_check', minutes: 30 });
    expect(decideByWords('다음 걸음 열어줘')).toMatchObject({ action: 'open_step' });
    expect(decideByWords('조용히 해줘')).toMatchObject({ action: 'quiet_hour' });
    expect(decideByWords('숨겨')).toMatchObject({ action: 'hide' });
    expect(decideByWords('설정 열어줘')).toMatchObject({ action: 'open_main' });
    expect(decideByWords('엑셀 사용법 알려줘')).toMatchObject({ kind: 'how_to' });
    // A how-to that names an action word is still a how-to.
    expect(decideByWords('엑셀에서 열 숨기는 방법')).toMatchObject({ kind: 'how_to' });
    expect(decideByWords('설정 어떻게 해')).toMatchObject({ kind: 'how_to' });
    expect(decideByWords('나 대신 메일 보내줘')).toMatchObject({ kind: 'declined', reason: 'outside_action' });
    expect(decideByWords('안녕')).toMatchObject({ kind: 'menu' });
    expect(detectCrisis('죽고 싶다')).toBe(true);
    expect(detectCrisis('오늘 끝')).toBe(false);
  });

  it('shows the rule names for saved groups in the current language, never a person\'s own', () => {
    expect(displayGroupName('breaks', 'Breaks')).toBe('Breaks');
    setLanguage('ko');
    expect(displayGroupName('breaks', 'Breaks')).toBe('쉬는 탭');
    expect(displayGroupName('unsorted', 'Not sorted yet')).toBe('아직 안 나눔');
    expect(displayGroupName('doc:1', 'Google Doc')).toBe('Google 문서');
    expect(displayGroupName('breaks', 'My videos')).toBe('My videos');
    expect(displayGroupName('gh:a/b', 'Breaks')).toBe('Breaks');
    setLanguage('en');
    expect(displayGroupName('breaks', '쉬는 탭')).toBe('Breaks');
  });

  it('names a new group in Korean', () => {
    setLanguage('ko');
    const p = { fold: [{ key: 'g1', name: 'A', tabIds: [1, 2], source: 'rule' }], kept: [], alreadySetAside: [], skipped: { excluded: 0, incognito: 0, internal: 0 }, foldCount: 2, expectUrls: {} } as WrapupPreview;
    expect(newGroup(p, 2).preview.fold[1].name).toBe('새 그룹');
  });
});

describe('Korean By your side sentences', () => {
  const nums = (clicked: number, judged: number, kept: number) =>
    ({ shown: clicked, clicked, stillWorkingRate: { n: judged, value: judged ? kept / judged : null } }) as SideNumbers;

  it('keeps the English and writes Korean rule sentences', () => {
    expect(ruleBySide(nums(1, 0, 0))).toBe('sidy is still learning what gets you started. 1 step opened so far — after 3, it can tell you which kind works for you.');
    setLanguage('ko');
    expect(ruleBySide(nums(1, 0, 0))).toBe('sidy는 어떻게 시작하면 좋은지 아직 배우는 중이에요. 지금까지 걸음 1개를 열었어요 — 3개가 되면 어떤 방식이 맞는지 알려 줄 수 있어요.');
    expect(ruleBySide(nums(5, 4, 3))).toBe('열고 확인할 만큼 머문 걸음 4개 중 3개는 10분 넘게 이어졌어요.');
  });

  it('accepts a Korean sentence from Claude but not advice', () => {
    const c = { shown: 5, opened: 4, judged: 4, kept: 3 };
    setLanguage('ko');
    expect(parseBySide('연 걸음 4개 중 3개가 10분 넘게 이어졌어요.', c)).not.toBeNull();
    expect(parseBySide('일찍 수면을 취하는 게 좋아요.', c)).toBeNull();
    expect(parseBySide('연 걸음 9개가 이어졌어요.', c)).toBeNull();
  });
});

describe('prompts', () => {
  const tabs = [tab(1, 'https://github.com/acme/retry-queue/pull/12', 'Add jitter'), tab(2, 'https://www.youtube.com/watch?v=x', 'Lo-fi')];
  const EN_GROUPING =
    'You sort browser tabs into a few works so a person can set them aside for the night. ' +
    'You only see tab titles with ids. Reply with JSON only: {"groups":[{"name":"short work name","ids":["T1"]}]}. ' +
    'Use each id at most once. Names are plain English, at most 40 characters, no emoji. ' +
    'Put videos and social feeds in a group named "Breaks". Leave out ids you are unsure about.';

  it('leaves every English prompt exactly as it was', () => {
    expect(buildGroupingRequest(tabs, null, [], fixedClock(0)).system).toBe(EN_GROUPING);
    expect(buildSuggestRequest(['a']).system).toBe(
      'A person is stopping work for the night. From the names of the work groups they set aside, write two short questions ' +
        'they might be curious about tomorrow. Plain English, each under 70 characters, each ending with "?". ' +
        'No advice, no instructions, nothing about sleep or health. Reply with JSON only: {"suggestions":["...","..."]}.',
    );
    expect(buildBySideRequest({ shown: 1, opened: 1, judged: 0, kept: 0 }).system).toContain('Write ONE short, plain English sentence (under 160 characters) telling a person');
    expect(buildAskRequest('hi').system).toContain('"search":"<for how_to: a short English search query under 40 characters, else null>"}');
  });

  it('asks for Korean only when Korean is picked', () => {
    setLanguage('ko');
    const g = buildGroupingRequest(tabs, null, [], fixedClock(0)).system;
    expect(g).toContain('Korean');
    expect(g).not.toContain('plain English');
    expect(g).toContain('"쉬는 탭"');
    expect(g.startsWith(EN_GROUPING.slice(0, EN_GROUPING.indexOf('Names are')))).toBe(true);
    expect(buildSuggestRequest(['a']).system).toContain('Korean');
    expect(buildBySideRequest({ shown: 1, opened: 1, judged: 0, kept: 0 }).system).toContain('Korean');
    expect(buildAskRequest('오늘 끝').system).toContain('Korean');
    expect(buildAskRequest('오늘 끝').user).toBe('<line>오늘 끝</line>');
  });

  it('still maps a group Claude calls Breaks in Korean to the Breaks group', () => {
    setLanguage('ko');
    const req = buildGroupingRequest(tabs, null, [], fixedClock(0));
    for (const name of ['쉬는 탭', 'Breaks']) {
      const out = parseGroupingAnswer(JSON.stringify({ groups: [{ name, ids: ['T2'] }] }), req, req.token, tabs, fixedClock(0));
      expect(out.groups.find((g) => g.key === 'breaks')).toMatchObject({ name: '쉬는 탭', tabIds: [2] });
    }
  });

  it('takes Korean suggestions of 4+ characters, and no advice', () => {
    setLanguage('ko');
    expect(parseSuggestions('{"suggestions":["재시도는 왜 필요할까?","수면을 줄여야 할까?"]}')).toEqual(['재시도는 왜 필요할까?']);
  });
});

describe('stepLabelFor', () => {
  const saved: SavedTab = { tabId: 1, url: 'https://github.com/acme/retry-lib/issues/12', title: 'Retry jitter', lastAccessed: 1, position: null, groupKey: 'g1' };
  const sa = {
    id: 'sa1', endedAt: 1, tabs: [saved], groups: [{ key: 'g1', name: 'retry-lib', tabIds: [1], source: 'rule' }], kept: [],
    userLine: null, todayDone: [], closeRequested: false, status: 'applied', result: null,
  } as SetAside;
  const stored = {
    id: 's', fromSetAside: 'sa1', createdAt: 1, label: 'retry-lib is ready to open.',
    action: { type: 'open_url' as const, url: saved.url, title: saved.title, position: null },
    checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true }, source: 'rule' as const,
  };

  it('rebuilds a stored label in the current language and keeps it when it cannot', () => {
    expect(stepLabelFor(stored, sa)).toBe('retry-lib is ready to open.');
    setLanguage('ko');
    expect(stepLabelFor(stored, sa)).toBe('retry-lib, 바로 열 수 있어요.');
    expect(stepLabelFor(stored, undefined)).toBe('retry-lib is ready to open.');
    expect(stepLabelFor({ ...stored, action: { ...stored.action, url: 'https://x.test/' } }, sa)).toBe('retry-lib is ready to open.');
  });
});

describe('localizeAppLabel', () => {
  it('leaves English labels alone', () => {
    expect(localizeAppLabel('Open Q3 in Excel', 'Excel')).toBe('Open Q3 in Excel');
  });

  it('writes the label in Korean and keeps the file name', () => {
    setLanguage('ko');
    expect(localizeAppLabel('Open Q3 report in Excel', 'Excel')).toBe('Excel에서 Q3 report 열기');
    expect(localizeAppLabel('Go to the last slide of Pitch in Keynote', 'Keynote')).toBe('Keynote에서 Pitch의 마지막 슬라이드로 가기');
    expect(localizeAppLabel('Open Figma', 'Figma')).toBe('Figma 열기');
    expect(localizeAppLabel('Something else', 'Excel')).toBe('Something else');
  });
});

describe('buildViewState in Korean', () => {
  const NOW = new Date(2026, 10, 10, 19, 0).getTime();
  const YESTERDAY = new Date(2026, 10, 9, 23, 50).getTime();
  const url = 'https://github.com/acme/retry-lib/issues/12';
  const sa: SetAside = {
    id: 'sa1', endedAt: YESTERDAY,
    tabs: [
      { tabId: 1, url, title: 'Retry jitter', lastAccessed: 1, position: null, groupKey: 'g1' },
      { tabId: 2, url: 'https://www.youtube.com/watch?v=x', title: 'Lo-fi', lastAccessed: 1, position: null, groupKey: 'breaks' },
    ],
    groups: [
      { key: 'g1', name: 'retry-lib', tabIds: [1], source: 'rule' },
      { key: 'breaks', name: 'Breaks', tabIds: [2], source: 'rule' },
    ],
    kept: [], userLine: 'why cap jitter?', todayDone: ['Set aside 2 tabs in 2 groups.'], closeRequested: false, status: 'applied',
    result: { grouped: [{ key: 'g1', chromeGroupId: 3, tabIds: [1] }], closed: [], kept: [] },
  };
  const stored: Step = {
    id: 'st1', fromSetAside: 'sa1', createdAt: YESTERDAY, label: '“why cap jitter?” — retry-lib is ready to open.',
    action: { type: 'open_url', url, title: 'Retry jitter', position: null },
    checks: { noJudgment: true, cannotFail: true, inRealTool: true, resultVisible: true }, source: 'rule',
  };
  const report: TabsReport = {
    tabs: [tab(1, url, 'Retry jitter')],
    skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 },
    capturedAt: NOW,
  };
  const view = () => buildViewState({ data: { ...defaultAppData(), setAsides: [sa], steps: [stored] }, report, bridge: 'connected', bubble: null, now: NOW });

  it('shows a stored English step label, date label and group names in Korean', () => {
    setLanguage('ko');
    const v = view();
    expect(v.step).toMatchObject({ when: '어제', whenKind: 'yesterday' });
    expect(v.step?.label).toBe('“why cap jitter?” — retry-lib, 바로 열 수 있어요.');
    expect(v.lastWrapup?.groups.map((g) => g.name)).toEqual(['retry-lib', '쉬는 탭']);
    expect(v.history[0].groups).toEqual(['retry-lib', '쉬는 탭']);
    expect(v.history[0].step?.label).toBe(v.step?.label);
    expect(v.saw.tabs[0].where).toBe('저장 안 됨');
  });

  it('keeps English as it was', () => {
    const v = view();
    expect(v.step?.label).toBe(stored.label);
    expect(v.step?.when).toBe('yesterday');
    expect(v.lastWrapup?.groups.map((g) => g.name)).toEqual(['retry-lib', 'Breaks']);
  });
});
