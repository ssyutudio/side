// In-memory Chrome API for tests. Objects follow the chrome.tabs.Tab and chrome.tabGroups.TabGroup
// shapes from the official docs (optional fields included). Any call can be made to fail with failOn().

export interface FakeTab {
  id?: number;
  index: number;
  windowId: number;
  groupId: number;
  openerTabId?: number;
  highlighted: boolean;
  active: boolean;
  pinned: boolean;
  audible?: boolean;
  discarded: boolean;
  autoDiscardable: boolean;
  mutedInfo?: { muted: boolean };
  url?: string;
  pendingUrl?: string;
  title?: string;
  favIconUrl?: string;
  status?: 'unloaded' | 'loading' | 'complete';
  incognito: boolean;
  width?: number;
  height?: number;
  sessionId?: string;
  lastAccessed?: number;
  frozen: boolean;
  selected: boolean;
}

export interface FakeGroup {
  id: number;
  collapsed: boolean;
  color: string;
  title?: string;
  windowId: number;
}

type Listener = (...args: any[]) => void;
class FakeEvent {
  listeners: Listener[] = [];
  addListener(fn: Listener) {
    this.listeners.push(fn);
  }
  removeListener(fn: Listener) {
    this.listeners = this.listeners.filter((l) => l !== fn);
  }
  fire(...args: any[]) {
    for (const l of this.listeners) l(...args);
  }
}

export function makeTab(id: number, url: string, extra: Partial<FakeTab> = {}): FakeTab {
  return {
    id,
    index: 0,
    windowId: 1,
    groupId: -1,
    highlighted: false,
    active: false,
    pinned: false,
    audible: false,
    discarded: false,
    autoDiscardable: true,
    mutedInfo: { muted: false },
    url,
    title: `Tab ${id}`,
    status: 'complete',
    incognito: false,
    lastAccessed: 1_700_000_000_000 + id,
    frozen: false,
    selected: false,
    ...extra,
  };
}

export function createFakeChrome(initialTabs: FakeTab[] = []) {
  const tabs = new Map<number, FakeTab>();
  const groups = new Map<number, FakeGroup>();
  const store: Record<string, unknown> = {};
  let nextTabId = 1000;
  let nextGroupId = 500;
  const calls: string[] = [];
  const failures: { name: string; nth: number; seen: number }[] = [];
  const permittedOrigins: string[] = [];
  let scriptResult: (tabId: number, args: unknown[]) => unknown = () => null;

  for (const t of initialTabs) tabs.set(t.id!, { ...t });

  function call(name: string) {
    calls.push(name);
    for (const f of failures) {
      if (f.name === name) {
        f.seen++;
        if (f.seen === f.nth) throw new Error(`Injected failure in ${name}`);
      }
    }
  }

  function reindex(windowId: number) {
    [...tabs.values()]
      .filter((t) => t.windowId === windowId)
      .sort((a, b) => a.index - b.index)
      .forEach((t, i) => (t.index = i));
  }

  function dropEmptyGroups() {
    for (const g of groups.values()) {
      if (![...tabs.values()].some((t) => t.groupId === g.id)) groups.delete(g.id);
    }
  }

  const events = {
    onCreated: new FakeEvent(),
    onRemoved: new FakeEvent(),
    onUpdated: new FakeEvent(),
    onActivated: new FakeEvent(),
  };

  const chrome = {
    runtime: { getManifest: () => ({ version: '0.1.0' }), lastError: undefined },
    tabs: {
      ...events,
      TAB_ID_NONE: -1,
      async query(q: { active?: boolean; windowId?: number; url?: string } = {}) {
        call('tabs.query');
        return [...tabs.values()]
          .filter((t) => (q.active === undefined || t.active === q.active) && (q.windowId === undefined || t.windowId === q.windowId))
          .map((t) => ({ ...t }));
      },
      async get(id: number) {
        call('tabs.get');
        const t = tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}.`);
        return { ...t };
      },
      async group(opts: { tabIds: number | number[]; groupId?: number; createProperties?: { windowId?: number } }) {
        call('tabs.group');
        const ids = Array.isArray(opts.tabIds) ? opts.tabIds : [opts.tabIds];
        for (const id of ids) if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`);
        let gid = opts.groupId;
        if (gid === undefined) {
          gid = nextGroupId++;
          const windowId = opts.createProperties?.windowId ?? tabs.get(ids[0])!.windowId;
          groups.set(gid, { id: gid, collapsed: false, color: 'grey', windowId });
        } else if (!groups.has(gid)) throw new Error(`No group with id: ${gid}.`);
        for (const id of ids) tabs.get(id)!.groupId = gid;
        dropEmptyGroups();
        return gid;
      },
      async ungroup(ids: number | number[]) {
        call('tabs.ungroup');
        for (const id of Array.isArray(ids) ? ids : [ids]) {
          const t = tabs.get(id);
          if (t) t.groupId = -1;
        }
        dropEmptyGroups();
      },
      async remove(ids: number | number[]) {
        call('tabs.remove');
        const list = Array.isArray(ids) ? ids : [ids];
        for (const id of list) if (!tabs.has(id)) throw new Error(`No tab with id: ${id}.`);
        for (const id of list) {
          const w = tabs.get(id)!.windowId;
          tabs.delete(id);
          reindex(w);
          events.onRemoved.fire(id, { windowId: w, isWindowClosing: false });
        }
        dropEmptyGroups();
      },
      async create(props: { url?: string; windowId?: number; active?: boolean; index?: number }) {
        call('tabs.create');
        const id = nextTabId++;
        const windowId = props.windowId ?? 1;
        const index = [...tabs.values()].filter((t) => t.windowId === windowId).length;
        const t = makeTab(id, props.url ?? 'chrome://newtab/', { windowId, index, active: props.active ?? true, title: props.url });
        if (t.active) for (const o of tabs.values()) if (o.windowId === windowId) o.active = false;
        tabs.set(id, t);
        events.onCreated.fire({ ...t });
        return { ...t };
      },
      async update(id: number, props: { active?: boolean; url?: string }) {
        call('tabs.update');
        const t = tabs.get(id);
        if (!t) throw new Error(`No tab with id: ${id}.`);
        if (props.active) {
          for (const o of tabs.values()) if (o.windowId === t.windowId) o.active = false;
          t.active = true;
        }
        if (props.url !== undefined) t.url = props.url;
        return { ...t };
      },
    },
    tabGroups: {
      TAB_GROUP_ID_NONE: -1,
      async query(q: { title?: string; windowId?: number } = {}) {
        call('tabGroups.query');
        return [...groups.values()]
          .filter((g) => (q.title === undefined || g.title === q.title) && (q.windowId === undefined || g.windowId === q.windowId))
          .map((g) => ({ ...g }));
      },
      async get(id: number) {
        call('tabGroups.get');
        const g = groups.get(id);
        if (!g) throw new Error(`No group with id: ${id}.`);
        return { ...g };
      },
      async update(id: number, props: { title?: string; collapsed?: boolean; color?: string }) {
        call('tabGroups.update');
        const g = groups.get(id);
        if (!g) throw new Error(`No group with id: ${id}.`);
        Object.assign(g, props);
        return { ...g };
      },
    },
    windows: {
      async update(id: number, _props: { focused?: boolean }) {
        call('windows.update');
        return { id };
      },
    },
    storage: {
      local: {
        async get(keys?: string | string[] | null) {
          call('storage.get');
          if (keys == null) return JSON.parse(JSON.stringify(store));
          const list = Array.isArray(keys) ? keys : [keys];
          const out: Record<string, unknown> = {};
          for (const k of list) if (k in store) out[k] = JSON.parse(JSON.stringify(store[k]));
          return out;
        },
        async set(items: Record<string, unknown>) {
          call('storage.set');
          for (const [k, v] of Object.entries(items)) store[k] = JSON.parse(JSON.stringify(v));
        },
        async remove(keys: string | string[]) {
          call('storage.remove');
          for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
        },
      },
    },
    permissions: {
      async contains(p: { origins?: string[] }) {
        call('permissions.contains');
        return (p.origins ?? []).every((o) => permittedOrigins.includes(o));
      },
    },
    scripting: {
      async executeScript(inj: { target: { tabId: number }; func: (...a: any[]) => unknown; args?: unknown[] }) {
        call('scripting.executeScript');
        if (!tabs.has(inj.target.tabId)) throw new Error(`No tab with id: ${inj.target.tabId}.`);
        const result = await scriptResult(inj.target.tabId, inj.args ?? []);
        return [{ documentId: 'doc', frameId: 0, result }];
      },
    },
  };

  return {
    chrome,
    tabs,
    groups,
    store,
    calls,
    events,
    /** Make the nth call (1-based, counted from now) of `name` throw. */
    failOn(name: string, nth = 1) {
      failures.push({ name, nth, seen: 0 });
    },
    clearFailures() {
      failures.length = 0;
    },
    permit(origin: string) {
      permittedOrigins.push(origin);
    },
    onScript(fn: (tabId: number, args: unknown[]) => unknown) {
      scriptResult = fn;
    },
  };
}

export type FakeChrome = ReturnType<typeof createFakeChrome>;
export type ChromeLike = FakeChrome['chrome'];
