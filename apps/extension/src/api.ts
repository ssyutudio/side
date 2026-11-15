// The subset of the Chrome extension API Side uses. The real `chrome` object satisfies it,
// and tests pass an in-memory fake with the same shapes.

export interface TabLike {
  id?: number;
  index: number;
  windowId: number;
  groupId: number;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  url?: string;
  pendingUrl?: string;
  title?: string;
  status?: string;
  incognito: boolean;
  lastAccessed?: number;
}

export interface GroupLike {
  id: number;
  title?: string;
  windowId: number;
  collapsed: boolean;
}

export interface ChromeApi {
  tabs: {
    query(q: { active?: boolean; windowId?: number }): Promise<TabLike[]>;
    get(id: number): Promise<TabLike>;
    group(o: { tabIds: number[]; groupId?: number; createProperties?: { windowId?: number } }): Promise<number>;
    ungroup(ids: number[]): Promise<void>;
    remove(ids: number[]): Promise<void>;
    create(p: { url: string; windowId?: number; active?: boolean }): Promise<TabLike>;
    update(id: number, p: { active?: boolean; url?: string }): Promise<TabLike | undefined>;
  };
  tabGroups: {
    query(q: { title?: string; windowId?: number }): Promise<GroupLike[]>;
    update(id: number, p: { title?: string; collapsed?: boolean }): Promise<GroupLike | undefined>;
  };
  windows: {
    update(id: number, p: { focused?: boolean }): Promise<unknown>;
  };
  storage: {
    local: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
    /** Survives the service worker sleeping, cleared when the browser closes. */
    session: {
      get(keys: string | string[]): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  permissions: {
    contains(p: { origins: string[] }): Promise<boolean>;
  };
  runtime: {
    getURL(path: string): string;
  };
  scripting: {
    executeScript(inj: { target: { tabId: number }; func: (...args: any[]) => unknown; args?: unknown[] }): Promise<{ result?: unknown }[]>;
  };
}

export const NO_GROUP = -1;

/** The optional host permission that lets Side read the reading spot on any web page. */
export const EVERY_SITE = ['https://*/*', 'http://*/*'];
/** The extension page that asks for EVERY_SITE (a permission request needs a click on an extension page). */
export const ALLOW_PAGE = 'allow.html';

/** Current URL of a tab, falling back to the URL it is loading. */
export function urlOf(tab: TabLike): string {
  return tab.url || tab.pendingUrl || '';
}

export function isWebUrl(url: string): boolean {
  return url.startsWith('https://') || url.startsWith('http://');
}
