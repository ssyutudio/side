// Every user-facing string the extension produces. The app shows its own wording; these travel as
// error messages so a person reading logs or the app's details view gets a plain explanation.
// Read when needed, so they follow the language the app last sent (see lang.ts).
import { say } from './lang';

export const COPY = {
  get nothingToSetAside() {
    return say('Nothing to set aside.');
  },
  tabInTwoWorks: (id: number) => say('Tab {id} was placed in two works.', { id }),
  get alreadyUndone() {
    return say('This set-aside was already undone.');
  },
  get nothingToUndo() {
    return say('There is nothing to undo for this set-aside.');
  },
  get onlyWebPages() {
    return say('Side only opens web pages.');
  },
  get badAddress() {
    return say('That address is not valid.');
  },
  storageFailed: (detail: string) => say("Chrome could not save Side's record, so no tab was changed. ({detail})", { detail }),
  chromeFailed: (detail: string) => say('Chrome did not finish the change. ({detail})', { detail }),
  unexpected: (detail: string) => say('Something unexpected happened. ({detail})', { detail }),
};
