// Every sentence sidy or the core logic shows to a person lives here, in English (Korean: i18n/ko/core.ts).
// Words are made when read (getters and functions), so a language change shows at once.
// Tone (plan voice rules): plain facts, praise only when stopping, count forward
// never backward (no backlog numbers), no sleep-effect promises, and never claim
// the user read or did something just because a page was open.
import { t, tn } from '../i18n';

/** English names of the groups the rules make; their Korean is looked up when shown. */
export const groupNames = {
  get breaks() {
    return t('Breaks');
  },
  get unsorted() {
    return t('Not sorted yet');
  },
  get localDev() {
    return t('Local dev');
  },
  get doc() {
    return t('Google Doc');
  },
  get figma() {
    return t('Figma file');
  },
  get notion() {
    return t('Notion page');
  },
};

/**
 * The one-step bubble. No day words here (the date label says when, from the
 * real record), and "where you stopped" only when a position was captured.
 */
export const step = {
  label: (work: string, userLine: string | null, hasPosition: boolean) => {
    const ready = hasPosition ? t('{work} is ready where you stopped.', { work }) : t('{work} is ready to open.', { work });
    if (!userLine) return ready;
    // The full line is shown in Mini and Main; here a long one is shortened so "is ready" survives.
    const q = userLine.length > 70 ? `${userLine.slice(0, 66).trimEnd()}…` : userLine;
    return `“${q}” — ${ready}`;
  },
  /** A file in a desktop app. sidy can open it (and sometimes do one small thing), never claim the exact spot. */
  appLabel: (name: string, tool: string, userLine: string | null) => {
    const ready = t('{name} is ready to open in {tool}.', { name, tool });
    if (!userLine) return ready;
    const q = userLine.length > 70 ? `${userLine.slice(0, 66).trimEnd()}…` : userLine;
    return `“${q}” — ${ready}`;
  },
};

/**
 * One more hour. Respect first, then one fact about time left before the wake
 * time. Never a claim about what sleep does for the user.
 */
export const oneMoreHour = {
  get respect() {
    return t('Sure, keep going. What you did so far is saved.');
  },
  sleepFact: (amount: string, wake: string) => t('Sleep now and you get {amount} before {wake}.', { amount, wake }),
  hours: (h: number) => tn(h, '{n} hour', '{n} hours'),
  minutes: (m: number) => tn(m, '{n} minute', '{n} minutes'),
  get askWhen() {
    return t('When do you want to stop?');
  },
  get checkIn() {
    return t('This is the time you picked.');
  },
  actions: {
    get setAside() {
      return t('Set aside');
    },
    get keepGoing() {
      return t('Keep going');
    },
    get notToday() {
      return t('Not today');
    },
  },
};

/** Lines for "what you did today". Only confirmed events, stated as facts. */
export const done = {
  setAside: (tabs: number, groups: number) =>
    t('Set aside {tabs} in {groups}.', { tabs: tn(tabs, '{n} tab', '{n} tabs'), groups: tn(groups, '{n} group', '{n} groups') }),
  stepClicked: (work: string) => t('Came back to {work}.', { work }),
  keptGoing: (work: string) => t('Kept going on {work} for 10+ minutes.', { work }),
};
