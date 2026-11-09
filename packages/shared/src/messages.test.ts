import { parseMessage, encodeMessage, makeMessage } from './messages';

const tab = {
  tabId: 11,
  windowId: 1,
  index: 0,
  url: 'https://docs.google.com/document/d/abc/edit',
  title: 'Retry design doc',
  lastAccessed: 1762650000000,
  active: true,
  pinned: false,
  audible: false,
  incognito: false,
  groupId: -1,
  groupTitle: null,
  position: {
    scroller: 'element',
    selector: '.kix-appview-editor',
    top: 1840,
    ratio: 0.42,
    quote: 'Retries back off exponentially',
    capturedAt: 1762650000000,
  },
};

describe('parseMessage', () => {
  it('accepts a valid tabs.report', () => {
    const raw = JSON.stringify({
      id: 'm1',
      type: 'tabs.report',
      payload: { tabs: [tab], skipped: { excluded: 2, excludedByDomain: { 'client-bank.com': 2 }, incognito: 0, internal: 1 }, capturedAt: 1 },
    });
    const r = parseMessage(raw);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.msg.type).toBe('tabs.report');
  });

  it('ignores null, broken JSON, unknown types and missing payloads', () => {
    expect(parseMessage(null).ok).toBe(false);
    expect(parseMessage('{"id":').ok).toBe(false);
    expect(parseMessage(JSON.stringify({ id: 'x', type: 'format.disk', payload: {} })).ok).toBe(false);
    expect(parseMessage(JSON.stringify({ id: 'x', type: 'tabs.report' })).ok).toBe(false);
    expect(parseMessage(JSON.stringify([1, 2])).ok).toBe(false);
    expect(parseMessage(42).ok).toBe(false);
  });

  it('rejects a tab whose url is not a string', () => {
    const bad = { ...tab, url: 7 };
    const raw = JSON.stringify({ id: 'm', type: 'tabs.report', payload: { tabs: [bad], skipped: { excluded: 0, excludedByDomain: {}, incognito: 0, internal: 0 }, capturedAt: 1 } });
    expect(parseMessage(raw).ok).toBe(false);
  });

  it('round-trips a command and its result', () => {
    const cmd = makeMessage('cmd.wrapup.apply', {
      setAsideId: 'sa1',
      groups: [{ key: 'g1', name: 'Retry tests', tabIds: [11] }],
      closeTabIds: [],
      expectUrls: { '11': tab.url },
    });
    const back = parseMessage(encodeMessage(cmd));
    expect(back.ok && back.msg.type).toBe('cmd.wrapup.apply');

    const res = makeMessage('cmd.result', { ok: true, result: { grouped: [{ key: 'g1', chromeGroupId: 5, tabIds: [11] }], closed: [], kept: [] } }, cmd.id);
    const parsed = parseMessage(encodeMessage(res));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.msg.replyTo).toBe(cmd.id);
  });

  it('accepts parsed objects as well as strings', () => {
    expect(parseMessage({ id: 'p', type: 'ping', payload: {} }).ok).toBe(true);
  });
});
