// Every user-facing string the extension produces. The app shows its own wording; these travel as
// error messages so a person reading logs or the app's details view gets a plain explanation.

export const COPY = {
  nothingToSetAside: 'Nothing to set aside.',
  tabInTwoWorks: (id: number) => `Tab ${id} was placed in two works.`,
  alreadyUndone: 'This set-aside was already undone.',
  nothingToUndo: 'There is nothing to undo for this set-aside.',
  onlyWebPages: 'Side only opens web pages.',
  badAddress: 'That address is not valid.',
  storageFailed: (detail: string) => `Chrome could not save Side's record, so no tab was changed. (${detail})`,
  chromeFailed: (detail: string) => `Chrome did not finish the change. (${detail})`,
  unexpected: (detail: string) => `Something unexpected happened. (${detail})`,
} as const;
