// Named states for opening a screen without the app (headless captures and visual checks).
// The data mirrors the approved mockups; nothing here ships as product data.
import type { ViewState } from '../../main/viewState';
import type { Bubble } from '../../main/speakService';
import type { PreviewView } from '../../main/controller';
import type { SideNumbers } from '../../core/stats';

const DAY = new Date(2026, 10, 10, 19, 5).getTime();

const numbers = (o: Partial<SideNumbers> = {}): SideNumbers => ({
  connected: true,
  tabsInChrome: 38,
  tabsOpen: 7,
  tabsSetAside: 31,
  stepReady: true,
  todayLine: null,
  spokeToday: 1,
  spokeTotal: 3,
  shown: 2,
  clicked: 2,
  clickRate: { value: 1, n: 2 },
  stillWorkingRate: { value: 0.5, n: 2 },
  lastSecondsToWork: 1.4,
  setAsideTotals: { tabs: 31, lines: 1 },
  ...o,
});

const base = (o: Partial<ViewState> = {}): ViewState => ({
  now: DAY,
  connection: 'connected',
  step: {
    id: 'st1',
    label: '“Will annual pricing beat monthly?” — Pricing page is ready where you stopped.',
    when: 'yesterday',
    host: 'docs.google.com',
    hasPosition: true,
  },
  bubble: null,
  numbers: numbers(),
  todayLines: ['Came back to Pricing page — draft.', 'Kept going on Pricing page — draft for 10+ minutes.'],
  lastWrapup: {
    id: 'sa1',
    status: 'applied',
    when: 'yesterday',
    groups: [
      { key: 'g1', name: 'Pricing page', count: 12 },
      { key: 'g2', name: 'Stripe webhooks', count: 11 },
      { key: 'g3', name: 'Competitor pricing', count: 8 },
    ],
    kept: [
      { title: 'Pricing page — draft', reason: 'active' },
      { title: 'Inbox', reason: 'pinned' },
      { title: 'Lo-fi beats to study to', reason: 'audible' },
    ],
    closed: 0,
    userLine: 'Will annual pricing beat monthly?',
    canUndo: true,
  },
  history: [
    {
      id: 'sa1',
      when: 'Mon, Nov 9',
      tabs: 31,
      groups: ['Pricing page', 'Stripe webhooks', 'Competitor pricing'],
      userLine: 'Will annual pricing beat monthly?',
      status: 'applied',
      step: { label: 'Pricing page is ready where you stopped.', shown: true, clicked: true, stillWorking: true, secondsToWork: 1.4 },
    },
    {
      id: 'sa0',
      when: 'Fri, Nov 6',
      tabs: 12,
      groups: ['Stripe webhooks', 'Reading'],
      userLine: null,
      status: 'applied',
      step: { label: 'Stripe webhooks is ready to open.', shown: true, clicked: false, stillWorking: null, secondsToWork: null },
    },
  ],
  saw: {
    readTabs: 37,
    withPosition: 9,
    hosts: [
      { host: 'docs.google.com', count: 6 },
      { host: 'github.com', count: 11 },
      { host: 'en.wikipedia.org', count: 5 },
    ],
    skipped: { excluded: 1, excludedByDomain: { 'client-portal.acme.com': 1 }, incognito: 0, internal: 2 },
    llm: { enabled: true, sends: 1, lastAt: DAY - 20 * 3_600_000 },
    uploadEnabled: false,
  },
  quiet: { last: { at: DAY - 3_600_000, reason: 'spoke_recently' }, today: { focus: 1, spoke_recently: 1 } },
  promise: null,
  settings: {
    sidySize: 'small',
    shortcut: 'Control+Alt+S',
    quietHours: { start: 22 * 60 + 30, end: 8 * 60 },
    wakeMinutes: 7 * 60 + 30,
    llmEnabled: true,
    uploadEnabled: false,
    excludedDomains: ['client-portal.acme.com'],
  },
  hidden: false,
  focusUntil: null,
  demoOffsetMs: 0,
  ...o,
});

export const FIXTURES: Record<string, ViewState> = {
  day: base(),
  night: base({
    step: null,
    lastWrapup: null,
    numbers: numbers({ tabsOpen: 38, tabsSetAside: 0, stepReady: false, todayLine: null, setAsideTotals: { tabs: 0, lines: 0 } }),
    todayLines: [],
  }),
  wrapped: base({
    lastWrapup: { ...base().lastWrapup!, when: 'today', userLine: null },
    todayLines: ['Set aside 31 tabs in 3 groups.'],
    numbers: numbers({ todayLine: 'Set aside 31 tabs in 3 groups.' }),
  }),
  offline: base({ connection: 'disconnected', numbers: numbers({ connected: false, tabsInChrome: null, tabsOpen: null, tabsSetAside: null }) }),
  waiting: base({ connection: 'waiting', step: null, lastWrapup: null, numbers: numbers({ connected: false, tabsInChrome: null, tabsOpen: null, tabsSetAside: null, stepReady: false }) }),
  'three-days': base({ step: { ...base().step!, when: 'Mon, Nov 9' }, lastWrapup: { ...base().lastWrapup!, when: 'Mon, Nov 9' } }),
  'first-day': base({
    step: null,
    lastWrapup: null,
    history: [],
    todayLines: [],
    saw: { ...base().saw, readTabs: 0, withPosition: 0, hosts: [], skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 }, llm: { enabled: true, sends: 0, lastAt: null } },
    numbers: numbers({ tabsSetAside: 0, tabsOpen: 38, stepReady: false, spokeToday: 0, spokeTotal: 0, shown: 0, clicked: 0, clickRate: { value: null, n: 0 }, stillWorkingRate: { value: null, n: 0 }, lastSecondsToWork: null, setAsideTotals: { tabs: 0, lines: 0 } }),
    quiet: { last: null, today: {} },
    settings: { ...base().settings, excludedDomains: [] },
  }),
};

export const FIXTURE_PREVIEW: PreviewView = {
  groups: [
    { key: 'g1', name: 'Pricing page', tabs: [
      { title: 'Pricing table patterns', host: 'github.com' },
      { title: 'Plan comparison examples', host: 'en.wikipedia.org' },
      { title: 'Annual vs monthly — a study', host: 'developer.mozilla.org' },
      { title: 'Pricing copy checklist', host: 'docs.google.com' },
      { title: 'Free trial length data', host: 'news.ycombinator.com' },
      ...Array.from({ length: 7 }, (_, i) => ({ title: `Pricing reference ${i + 1}`, host: 'github.com' })),
    ] },
    { key: 'g2', name: 'Stripe webhooks', tabs: Array.from({ length: 11 }, (_, i) => ({ title: `Webhook signatures part ${i + 1}`, host: 'stripe.com' })) },
    { key: 'g3', name: 'Competitor pricing', tabs: Array.from({ length: 8 }, (_, i) => ({ title: `Pricing pages of three rivals ${i + 1}`, host: 'example.com' })) },
  ],
  kept: [
    { title: 'Pricing page — draft', reason: 'active' },
    { title: 'Inbox', reason: 'pinned' },
    { title: 'Lo-fi beats to study to', reason: 'audible' },
  ],
  alreadySetAside: 0,
  skipped: { excluded: 1, incognito: 0, internal: 2 },
  foldCount: 31,
};

export const FIXTURE_BUBBLES: Record<string, Bubble> = {
  step: { kind: 'step', stepId: 'st1', trigger: 'app_start' },
  first: { kind: 'first_run', tabs: 38, groups: 3 },
  promise: { kind: 'promise', promiseId: 'p1', minutes: 30 },
};
