// What a person reads when something can't be done, or was only partly done.
// `error` on a result is a short code for the program; `message` is this sentence.

const TEXT = {
  app_not_installed: { en: "Couldn't find {tool} on this computer." },
  file_moved: { en: "Couldn't find that file. It may have been moved or renamed." },
  open_failed: { en: "Couldn't open it in {tool}." },
  stale_candidate: { en: "That action isn't available any more." },
  automation_denied: {
    en: "Opened it, but no further. To allow the rest, turn on {tool} under the app running Side, in System Settings > Privacy & Security > Automation.",
  },
  automation_pending: { en: "Opened it, but no further. {tool} isn't answering. Check for a window waiting on you." },
  action_incomplete: { en: "Opened it, but no further." },
  already_running: { en: "{tool} was already running, so I only brought it to the front. I didn't open the file, so nothing unsaved is touched." },
};

export function say(code, locale, tool = "") {
  const entry = TEXT[code];
  if (!entry) return "";
  return entry.en.replace("{tool}", () => tool);
}
