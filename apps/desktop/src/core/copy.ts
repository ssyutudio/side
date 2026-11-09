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

/** Lines for "what you did today". Only confirmed events, stated as facts. */
export const done = {
  setAside: (tabs: number, groups: number) =>
    `Set aside ${tabs} ${tabs === 1 ? 'tab' : 'tabs'} in ${groups} ${groups === 1 ? 'group' : 'groups'}.`,
  stepClicked: (work: string) => `Came back to ${work}.`,
  keptGoing: (work: string) => `Kept going on ${work} for 10+ minutes.`,
};
