// The only place these values live. Code reads them from here; docs refer to them by name.

/** Local WebSocket port the desktop app listens on (127.0.0.1 only). */
export const BRIDGE_PORT = 47613;
export const BRIDGE_HOST = '127.0.0.1';

/** MV3 service workers sleep; Chrome keeps them alive while a WebSocket sends at least every 30s. */
export const KEEPALIVE_MS = 20_000;
/** How long the app waits for the extension to confirm a command. */
export const COMMAND_TIMEOUT_MS = 12_000;
/** Reconnect backoff bounds for the extension. */
export const RECONNECT_MIN_MS = 1_000;
export const RECONNECT_MAX_MS = 15_000;

/** No input for this long, then input again, counts as "coming back". */
export const IDLE_RETURN_MS = 15 * 60_000;
/** sidy speaks first at most once per this window. */
export const SPEAK_COOLDOWN_MS = 60 * 60_000;
/** A step counts as "still working" if the user is still in that work this long after opening it. */
export const STILL_WORKING_AFTER_MS = 10 * 60_000;

/** One-more-hour choices, in minutes. */
export const PROMISE_CHOICES_MIN = [30, 60] as const;

/** Default wake-up time used for the "if you sleep now" fact line ("HH:MM" is stored as minutes). */
export const DEFAULT_WAKE_MINUTES = 7 * 60;

/** Screen languages. English is the default; Korean is picked in Settings. */
export const LANGUAGES = ['en', 'ko'] as const;
export type Language = (typeof LANGUAGES)[number];

export const SIDY_SIZES = ['small', 'medium', 'large'] as const;
export type SidySize = (typeof SIDY_SIZES)[number];
/** Visible sidy height in points for each size. Small follows the Director's ~40pt. */
export const SIDY_HEIGHT_PT: Record<SidySize, number> = { small: 40, medium: 52, large: 64 };
/** Minimum hit area around sidy, in points. */
export const SIDY_HIT_PT = 44;
