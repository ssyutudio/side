// Every sentence sidy or the core logic shows to a person lives here, in English.
// Tone (plan voice rules): plain facts, praise only when stopping, count forward
// never backward (no backlog numbers), no sleep-effect promises, and never claim
// the user read or did something just because a page was open.

export const groupNames = {
  breaks: 'Breaks',
  unsorted: 'Not sorted yet',
  localDev: 'Local dev',
  doc: 'Google Doc',
  figma: 'Figma file',
  notion: 'Notion page',
} as const;

/**
 * The one-step bubble. No day words here (the date label says when, from the
 * real record), and "where you stopped" only when a position was captured.
 */
export const step = {
  label: (work: string, userLine: string | null, hasPosition: boolean) => {
    const ready = hasPosition ? `${work} is ready where you stopped.` : `${work} is ready to open.`;
    if (!userLine) return ready;
    // The full line is shown in Mini and Main; here a long one is shortened so "is ready" survives.
    const q = userLine.length > 70 ? `${userLine.slice(0, 66).trimEnd()}…` : userLine;
    return `“${q}” — ${ready}`;
  },
  /** A file in a desktop app. sidy can open it (and sometimes do one small thing), never claim the exact spot. */
  appLabel: (name: string, tool: string, userLine: string | null) => {
    const ready = `${name} is ready to open in ${tool}.`;
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
  respect: 'Sure, keep going. What you did so far is saved.',
  sleepFact: (amount: string, wake: string) => `Sleep now and you get ${amount} before ${wake}.`,
  hours: (h: number) => `${h} ${h === 1 ? 'hour' : 'hours'}`,
  minutes: (m: number) => `${m} ${m === 1 ? 'minute' : 'minutes'}`,
  askWhen: 'When do you want to stop?',
  checkIn: 'This is the time you picked.',
  actions: { setAside: 'Set aside', keepGoing: 'Keep going', notToday: 'Not today' },
};

/** Lines for "what you did today". Only confirmed events, stated as facts. */
export const done = {
  setAside: (tabs: number, groups: number) =>
    `Set aside ${tabs} ${tabs === 1 ? 'tab' : 'tabs'} in ${groups} ${groups === 1 ? 'group' : 'groups'}.`,
  stepClicked: (work: string) => `Came back to ${work}.`,
  keptGoing: (work: string) => `Kept going on ${work} for 10+ minutes.`,
};
