// Tiny DOM-like objects for testing the page functions without a browser.

export interface FakeEl {
  nodeType: 1;
  tagName: string;
  id: string;
  className: string;
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  textContent: string;
  parentElement: FakeEl | null;
  children: FakeEl[];
  rect: { top: number; bottom: number };
  getBoundingClientRect(): { top: number; bottom: number };
}

export function el(tag: string, props: Partial<Omit<FakeEl, 'children' | 'parentElement'>> = {}, children: FakeEl[] = []): FakeEl {
  let scrollTop = props.scrollTop ?? 0;
  const node: FakeEl = {
    nodeType: 1,
    tagName: tag.toUpperCase(),
    id: props.id ?? '',
    className: props.className ?? '',
    get scrollTop() {
      return scrollTop;
    },
    set scrollTop(v: number) {
      const max = Math.max(0, node.scrollHeight - node.clientHeight);
      scrollTop = Math.min(Math.max(0, v), max);
    },
    scrollHeight: props.scrollHeight ?? 0,
    clientHeight: props.clientHeight ?? 0,
    textContent: props.textContent ?? '',
    parentElement: null,
    children,
    rect: props.rect ?? { top: -1000, bottom: -900 },
    getBoundingClientRect() {
      return node.rect;
    },
  };
  for (const c of children) c.parentElement = node;
  return node;
}

function flatten(root: FakeEl): FakeEl[] {
  const out: FakeEl[] = [];
  const walk = (n: FakeEl) => {
    out.push(n);
    n.children.forEach(walk);
  };
  walk(root);
  return out;
}

function matches(n: FakeEl, sel: string): boolean {
  if (sel.startsWith('#')) return n.id === sel.slice(1);
  if (sel.startsWith('.')) return n.className.split(/\s+/).includes(sel.slice(1));
  return sel.split(',').map((s) => s.trim().toUpperCase()).includes(n.tagName);
}

/** A window with documentElement > body > ...children. `scrollY` mirrors the root scroller. */
export function fakeWindow(bodyChildren: FakeEl[], opts: { innerHeight?: number; rootScrollHeight?: number; rootScrollTop?: number } = {}) {
  const innerHeight = opts.innerHeight ?? 800;
  const body = el('body', {}, bodyChildren);
  const root = el('html', { scrollHeight: opts.rootScrollHeight ?? innerHeight, clientHeight: innerHeight }, [body]);
  root.scrollTop = opts.rootScrollTop ?? 0;
  const all = () => flatten(root);
  const doc = {
    documentElement: root,
    scrollingElement: root,
    body,
    querySelectorAll: (sel: string) => {
      if (sel === '*') return all();
      if (sel.includes(' > ')) return all().filter((n) => pathMatches(n, sel));
      return all().filter((n) => matches(n, sel));
    },
    querySelector: (sel: string) => doc.querySelectorAll(sel)[0] ?? null,
  };
  const win = {
    document: doc,
    innerHeight,
    get scrollY() {
      return root.scrollTop;
    },
    scrollTo(_x: number, y: number) {
      root.scrollTop = y;
    },
  };
  return { win, doc, root, body };
}

// Supports the "tag:nth-of-type(n) > tag" paths the capture function builds.
function pathMatches(n: FakeEl, sel: string): boolean {
  const parts = sel.split(' > ').reverse();
  let cur: FakeEl | null = n;
  for (const p of parts) {
    if (!cur) return false;
    const m = /^([a-z0-9]+)(?::nth-of-type\((\d+)\))?$/.exec(p);
    if (p.startsWith('#')) {
      if (cur.id !== p.slice(1)) return false;
    } else if (m) {
      if (cur.tagName !== m[1].toUpperCase()) return false;
      if (m[2]) {
        const same = (cur.parentElement?.children ?? []).filter((c) => c.tagName === cur!.tagName);
        if (same.indexOf(cur) + 1 !== Number(m[2])) return false;
      }
    } else return false;
    cur = cur.parentElement;
  }
  return true;
}
