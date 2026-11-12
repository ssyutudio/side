// What a click on sidy does to Mini. Mini is a popover beside sidy: a click anywhere else puts it
// away (it never stays on top of the app you went back to), and sidy brings it back as it was.

/** Put away by a click elsewhere this recently: sidy brings back the same screen. Later: home. */
export const MINI_RESUME_MS = 5 * 60_000;
/** A click on sidy can itself take focus from Mini; a toggle this soon after is that same click. */
export const SAME_CLICK_MS = 400;

export type MiniToggle = 'close' | 'ignore' | 'resume' | 'home';

/** keep: Mini is in the middle of a Wrap up (preview, checking, its result): always back as it was. */
export function miniToggle(o: { visible: boolean; exists: boolean; blurredAt: number | null; now: number; keep?: boolean }): MiniToggle {
  if (o.visible) return 'close';
  if (o.blurredAt === null || !o.exists) return 'home';
  const since = o.now - o.blurredAt;
  if (since >= 0 && since < SAME_CLICK_MS) return 'ignore';
  if (o.keep) return 'resume';
  return since >= 0 && since < MINI_RESUME_MS ? 'resume' : 'home';
}
