// sidy's little reactions (Director 2-A): a stretch on unlock, a whistle when a Chrome video starts
// playing sound, a nod when music starts. Once, about two seconds, then still. Not a bubble and
// not counted as speaking. Off with the setting, while hidden, in focus or quiet hours, while a
// bubble shows, and with Reduce Motion. At most once per ten minutes per kind.
import type { Settings, TabsReport } from '@side/shared';
import { hostOf } from '@side/shared';
import { inQuietHours } from './speakPolicy';

export type ReactionKind = 'stretch' | 'whistle' | 'nod';
export const REACT_COOLDOWN_MS = 10 * 60_000;

const MUSIC = ['music.youtube.com', 'open.spotify.com', 'soundcloud.com', 'music.apple.com', 'bandcamp.com', 'tidal.com', 'deezer.com'];
const VIDEO = ['youtube.com', 'vimeo.com', 'netflix.com', 'twitch.tv', 'tv.apple.com', 'disneyplus.com', 'primevideo.com', 'tiktok.com'];
const on = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith('.' + d));

export function audioKind(url: string): 'whistle' | 'nod' | null {
  const host = hostOf(url);
  if (!host) return null;
  if (on(host, MUSIC)) return 'nod';
  if (on(host, VIDEO)) return 'whistle';
  return null;
}

/** The kind of a tab that just started playing sound between two reports, or null. */
export function newlyAudible(prev: TabsReport | null, next: TabsReport): 'whistle' | 'nod' | null {
  if (!prev) return null;
  const was = new Set(prev.tabs.filter((t) => t.audible).map((t) => t.tabId));
  for (const t of next.tabs) {
    if (t.audible && !was.has(t.tabId)) {
      const k = audioKind(t.url);
      if (k) return k;
    }
  }
  return null;
}

export interface ReactContext {
  now: number;
  enabled: boolean;
  hidden: boolean;
  focusUntil: number | null;
  quietHours: Settings['quietHours'];
  bubbleShowing: boolean;
  reducedMotion: boolean;
  last: Partial<Record<ReactionKind, number>>;
}

export function mayReact(kind: ReactionKind, c: ReactContext): boolean {
  if (!c.enabled || c.hidden || c.bubbleShowing || c.reducedMotion) return false;
  if (c.focusUntil !== null && c.now < c.focusUntil) return false;
  if (inQuietHours(c.now, c.quietHours)) return false;
  const last = c.last[kind];
  return last === undefined || c.now - last >= REACT_COOLDOWN_MS;
}
