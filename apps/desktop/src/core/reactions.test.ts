import type { TabSnapshot, TabsReport } from '@side/shared';
import { audioKind, newlyAudible, mayReact, REACT_COOLDOWN_MS } from './reactions';

const NOW = new Date(2026, 10, 10, 15, 0).getTime();
const tab = (id: number, url: string, audible: boolean): TabSnapshot => ({
  tabId: id, windowId: 1, index: id, url, title: 't', lastAccessed: NOW, active: false, pinned: false, audible, incognito: false, groupId: -1, groupTitle: null, position: null,
});
const report = (...tabs: TabSnapshot[]): TabsReport => ({ tabs, skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 }, capturedAt: NOW });

describe('audioKind', () => {
  it('tells video from music by site, and ignores the rest', () => {
    expect(audioKind('https://www.youtube.com/watch?v=x')).toBe('whistle');
    expect(audioKind('https://music.youtube.com/watch?v=x')).toBe('nod');
    expect(audioKind('https://open.spotify.com/track/1')).toBe('nod');
    expect(audioKind('https://docs.google.com/document/d/1')).toBeNull();
  });
});

describe('newlyAudible', () => {
  it('reacts only when a tab starts playing, not while it keeps playing', () => {
    const quiet = report(tab(1, 'https://www.youtube.com/watch?v=x', false));
    const playing = report(tab(1, 'https://www.youtube.com/watch?v=x', true));
    expect(newlyAudible(quiet, playing)).toBe('whistle');
    expect(newlyAudible(playing, playing)).toBeNull();
    expect(newlyAudible(null, playing)).toBeNull();
  });
});

describe('mayReact', () => {
  const base = { now: NOW, enabled: true, hidden: false, focusUntil: null, quietHours: null, bubbleShowing: false, reducedMotion: false, last: {} };
  it('plays once, then waits ten minutes for the same kind', () => {
    expect(mayReact('nod', base)).toBe(true);
    expect(mayReact('nod', { ...base, last: { nod: NOW - 60_000 } })).toBe(false);
    expect(mayReact('nod', { ...base, last: { nod: NOW - REACT_COOLDOWN_MS } })).toBe(true);
    expect(mayReact('whistle', { ...base, last: { nod: NOW - 60_000 } })).toBe(true);
  });

  it('stays still when off, hidden, in focus, in quiet hours, while a bubble shows, or with Reduce Motion', () => {
    expect(mayReact('stretch', { ...base, enabled: false })).toBe(false);
    expect(mayReact('stretch', { ...base, hidden: true })).toBe(false);
    expect(mayReact('stretch', { ...base, focusUntil: NOW + 1000 })).toBe(false);
    expect(mayReact('stretch', { ...base, quietHours: { start: 14 * 60, end: 16 * 60 } })).toBe(false);
    expect(mayReact('stretch', { ...base, bubbleShowing: true })).toBe(false);
    expect(mayReact('stretch', { ...base, reducedMotion: true })).toBe(false);
  });
});
