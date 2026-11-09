/* Side mockup engine — static click-through, not production code. */
const Q = new URLSearchParams(location.search);
const ST = Q.get('s') || 'quiet-night';
const SZ = { s: 40, m: 52, l: 64 }[Q.get('sz') || 's'];
const STATIC = Q.has('still'); // board frames: no auto-advance
function go(s, extra = {}) {
  const p = new URLSearchParams(location.search); p.set('s', s); p.delete('still');
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  location.search = p.toString();
}
window.go = go;

/* ---------- sidy ---------- */
function sidy(px) {
  return `<svg class="sidy-svg" width="${px}" height="${px}" viewBox="0 0 100 100" aria-hidden="true">
  <defs><clipPath id="c${px}"><rect x="4" y="4" width="92" height="92" rx="26"/></clipPath></defs>
  <rect x="4" y="4" width="92" height="92" rx="26" fill="#F3F3EF"/>
  <rect x="72" y="0" width="30" height="100" fill="#3B54E7" clip-path="url(#c${px})"/>
  <rect x="4" y="4" width="92" height="92" rx="26" fill="none" stroke="#1E2025" stroke-width="5"/>
  <rect x="16.5" y="33" width="8" height="20" rx="4" fill="#1E2025"/>
  <rect x="38.5" y="33" width="8" height="20" rx="4" fill="#1E2025"/></svg>`;
}
window.sidy = sidy;
const CY = 640; // sidy vertical centre on the 1107px stage
function edge(mode) {
  if (mode === 'hidden') return '';
  const hitH = Math.max(SZ + 16, 48);
  return `<div class="edge ${mode}" style="top:${CY - hitH / 2}px;height:${hitH}px;--q:${Math.round(SZ * .52)}px;--o:${Math.round(SZ * .08)}px">
    <button class="hit" style="height:${hitH}px;min-width:48px" aria-label="sidy — open Side" onclick="sidyClick()">
      <span class="body">${sidy(SZ)}</span></button></div>`;
}
window.sidyClick = () => {
  const map = { 'quiet-night': 'mini-night', 'hover': 'mini-night', 'night-after': 'mini-wrapped', 'day-quiet': 'mini-day',
    'opened-quiet': 'mini-day', 'omh-quiet': 'mini-night', 'return': 'mini-day', 'return-3d': 'mini-day', 'hello': 'mini-night' };
  if (ST.startsWith('mini') || ST.startsWith('wrap') || ST === 'omh') return go(back());
  go(map[ST] || (ST.startsWith('main') ? 'mini-day' : 'mini-day'));
};
function back() { return ({ 'mini-day': 'day-quiet', 'mini-off': 'day-quiet', 'mini-wrapped': 'night-after' })[ST] || 'quiet-night'; }

/* ---------- Chrome backdrop ---------- */
const FAV = ['#4285F4', '#635BFF', '#0F9D58', '#F4B400', '#DB4437', '#9AA0A6', '#7E57C2', '#00897B'];
function tabsBefore(activeTitle) {
  let h = `<div class="tab pin"><i style="--c:#DB4437"></i></div>`;
  for (let k = 0; k < 36; k++) h += `<div class="tab"><i style="--c:${FAV[k % 8]}"></i></div>`;
  return h + `<div class="tab wide on"><i style="--c:#4285F4"></i>${activeTitle}</div>`;
}
function tabsAfter(active) {
  const t = (title, c, on) => `<div class="tab wide ${on ? 'on' : ''}"><i style="--c:${c}"></i>${title}</div>`;
  return `<div class="tab pin"><i style="--c:#DB4437"></i></div>
   ${(Q.get('cl') || '').split(',').includes('0') ? '' : '<span class="grp" style="background:#1A73E8">Pricing page<b>12</b></span>'}
   <span class="grp" style="background:#9334E6">Stripe webhooks<b>11</b></span>
   <span class="grp" style="background:#188038">Competitor pricing<b>8</b></span>
   ${t('Pricing page — draft', '#4285F4', active === 'doc')}${t('Lo-fi beats to study to', '#DB4437', active === 'vid')}
   ${t('Acme client portal', '#9AA0A6')}${t('Weekend flights', '#00897B')}${t('Trail shoes review', '#F4B400')}${t('2BR apartment listing', '#7E57C2')}`;
}
function docPage(mark) {
  return `<div class="doc"><div class="sheet">
   <h1>Pricing page — draft</h1>
   <p>For the Northwind store. Goal: one page a shop owner can read in a minute and pick a plan.</p>
   <h3>Monthly</h3><p>Pay as you go, cancel any time. Lead with the price per month and what the first week looks like.</p>
   <h3>Annual plans</h3>
   <p class="${mark ? 'stopped' : ''}">${mark ? '<span class="stopped-tag">You stopped here</span>' : ''}Annual plans save 20%. Billed once a year, with a reminder a week before renewal, so nothing surprises the owner.</p>
   <p>Open question: does a yearly price make people commit to a habit, or just to a bill?</p>
   <h3>Next</h3><p>Compare with the three rival pages, then cut this to one screen.</p>
  </div></div>`;
}
function vidPage() {
  return `<div class="vid"><div><div class="player"><div class="scene"></div><div class="bar"><i></i></div></div>
   <h2>Lo-fi beats to study to — 3 hour mix</h2><p>1.2M views</p></div>
   <div class="side-list">${['Rainy café ambience', 'How synths work', 'Desk tour 2026', 'Street food in Busan', 'Speedrun, any%'].map(x => `<div><i></i><span>${x}</span></div>`).join('')}</div></div>`;
}
function chrome({ tabs = 'before', page = 'doc', mark = false }) {
  const after = tabs === 'after';
  const strip = after ? tabsAfter(page) : tabsBefore(page === 'vid' ? 'Lo-fi beats to study to' : 'Pricing page — draft');
  const url = page === 'vid' ? 'video.example/watch?v=lofi-3h' : 'docs.google.com/document/d/pricing-draft';
  return `<div class="chrome ${page === 'vid' ? 'dark' : ''}"><div class="tabstrip">${strip}</div>
    <div class="omni"><span>←</span><span>→</span><span>↻</span><div class="url">${url}</div></div>
    <div class="page">${page === 'vid' ? vidPage() : docPage(mark)}</div></div>`;
}

/* ---------- bubble / panel helpers ---------- */
const RIGHT_B = () => Math.round(SZ * .92) + 18;
function bubble(inner, { w = 340, h = 150 } = {}) {
  return `<div class="bubble" role="status" style="width:${w}px;right:${RIGHT_B()}px;top:${CY - h / 2}px">${inner}</div>`;
}
function panel(inner, h) {
  const top = Math.max(24, Math.min(CY - h / 2, 1107 - h - 24));
  return `<div class="panel" role="dialog" aria-label="Side" style="right:${SZ + 22}px;top:${top}px;max-height:${1107 - top - 24}px">${inner}</div>`;
}
const X = (to, label = 'Close') => `<button class="x" aria-label="${label}" onclick="go('${to}')">×</button>`;
const head = (chip, to) => `<div class="ph"><span class="name">Side</span>${chip}<span class="sp"></span>${X(to)}</div>`;
const OK = `<span class="chip ok">Chrome connected</span>`;

/* ---------- scenes ---------- */
const S = {};
const auto = (to, ms) => { if (!STATIC) setTimeout(() => go(to), ms); };

S['quiet-night'] = () => ({ bg: chrome({}), edge: 'quiet' });
S['hover'] = () => ({ bg: chrome({}), edge: 'out' });
S['night-after'] = () => ({ bg: chrome({ tabs: 'after' }), edge: 'quiet' });
S['day-quiet'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet' });
S['opened-quiet'] = () => ({ bg: chrome({ tabs: 'after', page: 'doc', mark: true }), edge: 'quiet' });
S['omh-quiet'] = () => ({ bg: chrome({}), edge: 'quiet' });

S['hello'] = () => ({ bg: chrome({}), edge: 'out', ov: bubble(`${X('quiet-night', 'Not now')}
  <p>Hi, I'm sidy. I can see 38 tabs — about 3 kinds of work.</p>
  <span class="meta">When you stop for the day, I'll fold them into groups.</span>
  <div class="row"><button class="btn fill grow" onclick="go('wrap-preview')">Show me</button></div>`, { h: 170 }) });

S['return'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'out', ov: bubble(`${X('day-quiet', 'Not now')}
  <p>Yesterday you asked: will annual pricing beat monthly? Your draft is where you stopped.</p>
  <span class="meta">Pricing page — draft · at “Annual plans”</span>
  <div class="row"><button class="btn fill grow" onclick="go('opened')">Step inside</button><button class="btn grow" onclick="go('rest')">Rest today</button></div>`, { w: 360, h: 196 }) });
S['return-3d'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'out', ov: bubble(`${X('day-quiet', 'Not now')}
  <p>Welcome back. Monday's pricing draft is where you left it.</p>
  <span class="meta">Last wrap-up · Mon, Nov 9 · at “Annual plans”</span>
  <div class="row"><button class="btn fill grow" onclick="go('opened')">Step inside</button><button class="btn grow" onclick="go('rest')">Rest today</button></div>`, { w: 360, h: 172 }) });
S['opened'] = () => { auto('opened-quiet', 4000); return { bg: chrome({ tabs: 'after', page: 'doc', mark: true }), edge: 'out',
  ov: bubble(`${X('opened-quiet')}<p style="margin-bottom:0">Opened where you stopped.</p>`, { w: 280, h: 64 }) }; };
S['rest'] = () => { auto('day-quiet', 3500); return { bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'out',
  ov: bubble(`${X('day-quiet')}<p style="margin-bottom:0">Okay. Rest today — I'll stay quiet until tomorrow.</p>`, { w: 300, h: 96 }) }; };

S['omh-set'] = () => { auto('omh-quiet', 4000); const m = Q.get('m') || '60'; return { bg: chrome({}), edge: 'out',
  ov: bubble(`${X('omh-quiet')}<p style="margin-bottom:0">Okay. I'll check in once, at ${m === '30' ? '12:10' : '12:40'} AM.</p>`, { w: 300, h: 72 }) }; };
S['omh-due'] = () => ({ bg: chrome({}), edge: 'out', ov: bubble(`${X('omh-quiet', 'Close')}
  <p>${(Q.get('m') || '60') === '30' ? 'The 30 minutes you asked for are up.' : 'The hour you asked for is up.'} Set today aside?</p>
  <div class="row"><button class="btn fill" onclick="go('wrap-preview')">Set aside</button><button class="btn" onclick="go('omh-quiet')">Keep going</button><button class="btn" onclick="go('rest-night')">Not today</button></div>`, { w: 392, h: 132 }) });
S['rest-night'] = () => { auto('omh-quiet', 3500); return { bg: chrome({}), edge: 'out',
  ov: bubble(`${X('omh-quiet')}<p style="margin-bottom:0">Okay. Your tabs stay as they are. Good night.</p>`, { w: 300, h: 96 }) }; };

S['hide-toast'] = () => { auto('hidden', 6000); return { bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'hidden',
  ov: `<div class="toast" style="top:${CY - 30}px">sidy is hidden. Press <kbd style="color:var(--ink)">⌃⌥S</kbd> or click Side in the Dock.<button class="btn sm" onclick="go('day-quiet')">Bring back</button></div>` }; };
S['hidden'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'hidden' });

/* D2 reactions: once, about 2 s, then still. Not a bubble; not counted as speaking. */
const NOTES = () => `<div class="notes" style="right:${Math.round(SZ*.6)+6}px;top:${CY - SZ}px;width:40px;height:40px"><span style="left:14px;top:18px">♪</span><span style="left:4px;top:24px">♫</span><span style="left:20px;top:28px">♪</span></div>`;
S['react-whistle'] = () => { auto('day-quiet', 2600); return { bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet', ov: NOTES(), cls: 'react-whistle' }; };
S['react-stretch'] = () => { auto('return', 2600); return { bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet', cls: 'react-stretch' }; };
S['react-nod'] = () => { auto('day-quiet', 2600); return { bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet', cls: 'react-nod' }; };

/* Mini */
const QA = (items) => `<div class="qa">${items.map(([ic, t, s, to, k, off]) => `<button ${off ? 'aria-disabled="true" class="off"' : ''} onclick="${off ? '' : `go('${to}')`}"><span class="tf">${ic}</span><span>${t}${s ? `<small>${s}</small>` : ''}</span>${k ? `<span class="k">${k}</span>` : ''}</button>`).join('')}</div>`;
const FOOT = `<div class="pf"><button class="btn grow" style="width:100%" onclick="go('main-today')">Open Side</button></div>`;
S['mini-night'] = () => ({ bg: chrome({}), edge: 'quiet', ov: panel(`${head(OK, 'quiet-night')}<div class="pb">
  <div class="step"><div class="lbl">Stopping for today?</div><div class="t">Fold 38 tabs into 3 groups</div><div class="w">Nothing closes. Undo any time tonight.</div>
   <button class="btn fill" style="width:100%" onclick="go('wrap-preview')">Set aside today</button></div>
  <div class="facts"><div><span>Tabs in Chrome</span><b>38</b></div><div><span>Set aside</span><b>0</b></div><div><span>Next step</span><b>Ready after you set aside</b></div></div>
  ${QA([['⏳', 'One more hour', 'Keep going, with one check-in', 'omh'], ['🙈', 'Hide sidy', '', 'hide-toast', '⌃⌥S']])}
  </div>${FOOT}`, 520) });
S['mini-wrapped'] = () => ({ bg: chrome({ tabs: 'after' }), edge: 'quiet', ov: panel(`${head(OK, 'night-after')}<div class="pb">
  <div class="done-line"><b>31 tabs set aside in 3 groups.</b> 7 still open.</div>
  <div class="facts"><div><span>Tabs in Chrome</span><b>38</b></div><div><span>Set aside</span><b>31 in 3 groups</b></div><div><span>Tomorrow's step</span><b>Pricing draft, “Annual plans”</b></div></div>
  ${QA([['↩️', "Bring back today's tabs", 'Unfolds the 3 groups', 'mini-night'], ['⏳', 'One more hour', '', 'omh'], ['🙈', 'Hide sidy', '', 'hide-toast', '⌃⌥S']])}
  </div>${FOOT}`, 520) });
S['mini-day'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet', ov: panel(`${head(OK, 'day-quiet')}<div class="pb">
  <div class="step"><div class="lbl">Next step · from yesterday</div><div class="t">Open your pricing draft at “Annual plans”</div><div class="w">You asked: will annual pricing beat monthly?</div>
   <button class="btn fill" style="width:100%" onclick="go('opened')">Step inside</button></div>
  <div class="facts"><div><span>Tabs in Chrome</span><b>38</b></div><div><span>Set aside</span><b>31 in 3 groups</b></div><div><span>Last wrap-up</span><b>Yesterday</b></div></div>
  ${QA([['🌙', 'Set aside today', 'Fold open tabs into groups', 'wrap-preview'], ['↩️', "Bring back yesterday's tabs", '', 'day-quiet'], ['🙈', 'Hide sidy', '', 'hide-toast', '⌃⌥S']])}
  </div>${FOOT}`, 608) });
S['mini-off'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet', ov: panel(`${head('<span class="chip warn">Chrome not connected</span>', 'day-quiet')}<div class="pb">
  <div class="alert"><b>Chrome isn't connected.</b>Side reconnects on its own when Chrome is open. Still off? Make sure the Side extension is switched on in chrome://extensions.</div>
  <button class="btn fill" onclick="go('mini-day')">Check again</button>
  <div class="facts"><div><span>Tabs in Chrome</span><b>Unknown until connected</b></div><div><span>Set aside</span><b>31 in 3 groups</b></div><div><span>Next step</span><b>Waiting for Chrome</b></div></div>
  ${QA([['🌙', 'Set aside today', 'Needs Chrome — connect first.', 'mini-off', '', 1], ['↩️', "Bring back yesterday's tabs", 'Needs Chrome — connect first.', 'mini-off', '', 1], ['🙈', 'Hide sidy', '', 'hide-toast', '⌃⌥S']])}
  </div>${FOOT}`, 600) });

/* Wrap up */
const GROUPS = [['#1A73E8', 'Pricing page', 12, 'Pricing table docs, plan comparison examples…',
   ['Pricing table patterns', 'Plan comparison examples', 'Annual vs monthly — a study', 'Pricing copy checklist', 'Free trial length data', 'SaaS pricing teardown', 'Price anchoring, explained', 'Northwind brand notes', 'Pricing FAQ examples', 'Currency display rules', 'Discount badge examples', 'Pricing page A/B results']],
  ['#9334E6', 'Stripe webhooks', 11, 'Webhook signatures, Stripe CLI, Event types…',
   ['Webhook signatures', 'Stripe CLI — listen', 'Event types', 'Idempotent requests', 'Retry schedule', 'Refund events', 'Test clocks', 'Webhook logs', 'Endpoint secrets', 'Local tunnel setup', 'Error codes']],
  ['#188038', 'Competitor pricing', 8, 'Pricing pages of three rival apps…',
   ['Rival A — pricing', 'Rival A — FAQ', 'Rival B — pricing', 'Rival B — plans compared', 'Rival C — pricing', 'Rival C — annual offer', 'Review site — pricing roundup', 'Forum thread — "worth it?"']]];
const STAY = [['Pricing page — draft', "You're on it"], ['Inbox', 'Pinned'], ['Lo-fi beats to study to', 'Playing sound'],
  ['1 tab from an excluded site', 'Not read'], ['3 more tabs', 'Not sorted yet']];
const CL = () => (Q.get('cl') || '').split(',').filter(Boolean).map(Number);   // groups set to Close
const SPLIT = () => { const cl = CL(); let f = 0, c = 0, fg = 0;
  GROUPS.forEach(([, , k], i) => { if (cl.includes(i)) c += k; else { f += k; fg++; } }); return { f, c, fg }; };
function wrapBody(dim) {
  const cl = CL(), op = Q.get('op');
  return `<div class="pb" style="${dim ? 'opacity:.45;pointer-events:none' : ''}">
   <div><h2 class="wh">Set today aside</h2><p class="sub">3 groups, folded in Chrome. Nothing closes unless you pick Close.</p></div>
   <div class="gl">${GROUPS.map(([c, n, k, ex, tabs], i) => { const close = cl.includes(i), open = op === String(i) || close;
     return `<div class="g" style="--c:${c}"><button class="dis" aria-expanded="${open}" onclick="go('wrap-preview',{op:'${open ? '' : i}'})"><span class="chev">▶</span><i style="width:12px;height:12px;border-radius:4px;background:var(--c);flex:none"></i><span class="n">${n}</span></button>
     <span class="seg" role="group" aria-label="${n}: fold or close"><button aria-pressed="${!close}" onclick="setCl(${i},0)">Fold</button><button aria-pressed="${close}" onclick="setCl(${i},1)">Close</button></span>
     ${open ? `${close ? `<div class="warn-line">These ${k} tabs will close. Undo brings them back.</div>` : ''}<ul class="tl2" aria-label="${k} tabs">${tabs.map(t => `<li>${t}</li>`).join('')}</ul>` : `<span class="ex">${k} tabs · ${ex}</span>`}</div>`; }).join('')}</div>
   <div class="stay"><h4>7 stay open</h4><ul>${STAY.map(([t, r]) => `<li>${t}<span>${r}</span></li>`).join('')}</ul></div></div>`;
}
window.setCl = (i, on) => { const s = new Set(CL()); on ? s.add(i) : s.delete(i); go('wrap-preview', { cl: [...s].join(','), op: on ? i : '' }); };
const PRIMARY = () => { const { f, c } = SPLIT(); return c ? (f ? `Fold ${f} · Close ${c}` : `Close ${c} tabs`) : `Set aside ${f} tabs`; };
const RESULT = () => { const { f, c, fg } = SPLIT(); return c ? `${f} tabs folded in ${fg} group${fg === 1 ? '' : 's'}, ${c} closed.` : `31 tabs set aside in 3 groups.`; };
S['wrap-preview'] = () => ({ bg: chrome({}), edge: 'quiet', ov: panel(`${head(OK, 'mini-night')}${wrapBody(false)}
  <div class="pf"><button class="btn fill" style="width:100%" onclick="go('wrap-checking',{op:''})">${PRIMARY()}</button>
  <div class="row" style="justify-content:space-between;margin-top:6px"><button class="btn ghost sm" onclick="go('omh')">One more hour</button><button class="btn ghost sm" onclick="go('mini-night')">Cancel</button></div></div>`, 900) });
S['wrap-checking'] = () => { auto(Q.get('fail') ? 'wrap-failed' : 'wrap-done', 1800); return { bg: chrome({}), edge: 'quiet', ov: panel(`${head('<span class="chip wait">Working</span>', 'mini-night')}${wrapBody(true)}
  <div class="pf" role="status" aria-live="polite"><div class="row" style="align-items:center;gap:12px;height:44px"><span class="spin"></span><span><b>Saved on this computer.</b> Checking with Chrome…</span></div>
  <p class="note" style="margin:6px 0 0">sidy only reports what Chrome confirms.</p></div>`, 900) }; };
const CHIPS = ['Will annual pricing beat monthly?', 'Why does the refund webhook fire twice?'];
window.chip = (i) => go('wrap-done', { ch: i });
S['wrap-done'] = () => { const ch = Q.get('ch'), ev = Q.get('ev') !== '0';
  const val = '';
  return { bg: chrome({ tabs: 'after' }), edge: 'quiet', ov: panel(`${head(OK, 'night-after')}<div class="pb">
  <div class="today">${ev ? 'Today: you picked up your pricing draft from this morning’s step and stayed on it.' : 'Today: 31 tabs set aside in 3 groups.'}
   <small>${ev ? 'From what you did with Side today — not from page text.' : 'No steps today, so sidy only counts what it set aside.'}</small></div>
  <div class="done-line"><b>${RESULT()}</b> 7 still open. Chrome confirmed.</div>
  <button class="btn" onclick="go('quiet-night')">Undo · bring back 31 tabs</button>
  <div class="field" style="margin-top:4px"><label for="tm">What are you most curious about tomorrow?</label>
   <div class="chips" role="group" aria-label="Suggestions">${CHIPS.map((c, i) => `<button aria-pressed="${String(i) === ch}" onclick="chip(${i})">${c}</button>`).join('')}</div>
   <input id="tm" style="margin-top:8px" placeholder="Or write your own" aria-label="Or write your own" value="${val}" autocomplete="off">
   <p class="note" style="margin:6px 0 0">Optional. Suggested by Claude from your group names. sidy brings it back tomorrow.</p></div>
  </div><div class="pf"><div class="row"><button class="btn fill grow" onclick="go('wrap-bye')">Save</button><button class="btn grow" onclick="go('wrap-bye',{skip:1})">Skip</button></div></div>`, 600) }; };
S['wrap-bye'] = () => { auto('night-after', 3500); return { bg: chrome({ tabs: 'after' }), edge: 'out',
  ov: bubble(`${X('night-after')}<p style="margin-bottom:0">${Q.get('skip') ? 'Set aside. See you tomorrow.' : 'Saved your question. See you tomorrow.'}</p>`, { w: 300, h: 72 }) }; };
S['wrap-failed'] = () => ({ bg: chrome({}), edge: 'quiet', ov: panel(`${head('<span class="chip warn">Chrome didn\'t answer</span>', 'mini-night')}<div class="pb">
  <div class="alert"><b>Chrome didn't answer.</b>Your list is saved on this computer, but sidy can't confirm what happened to the tabs. Look at Chrome's tab bar, or try again — tabs already set aside are skipped, so nothing closes twice.</div>
  </div><div class="pf"><div class="row"><button class="btn fill grow" onclick="go('wrap-checking')">Try again</button><button class="btn grow" onclick="go('mini-night')">Cancel</button></div></div>`, 330) });
S['wrap-savefail'] = () => ({ bg: chrome({}), edge: 'quiet', ov: panel(`${head(OK, 'mini-night')}<div class="pb">
  <div class="alert"><b>Couldn't save on this computer.</b>Nothing was changed in Chrome. Your disk may be full. Free some space, then try again.</div>
  </div><div class="pf"><div class="row"><button class="btn fill grow" onclick="go('wrap-checking')">Try again</button><button class="btn grow" onclick="go('mini-night')">Cancel</button></div></div>`, 300) });

S['omh'] = () => { const m = Q.get('m') || '60'; return { bg: chrome({}), edge: 'quiet', ov: panel(`${head(OK, 'mini-night')}<div class="pb">
  <div><h2 class="wh">Sure. Keep going.</h2><p class="sub">I saved tonight's groups first. No tabs closed.</p></div>
  <div class="facts"><div><span>Now</span><b>11:40 PM</b></div><div><span>Your wake-up</span><b>7:30 AM</b></div><div><span>Stop now and you get</span><b>7 h 50 min</b></div></div>
  <div><div style="font-weight:600;font-size:15px;margin-bottom:8px">Check in with me in</div>
   <span class="seg" role="group" aria-label="Check in"><button style="height:40px;padding:0 18px;font-size:15px" aria-pressed="${m === '30'}" onclick="go('omh',{m:30})">30 min</button><button style="height:40px;padding:0 18px;font-size:15px" aria-pressed="${m === '60'}" onclick="go('omh',{m:60})">1 hour</button></span></div>
  </div><div class="pf"><button class="btn fill" style="width:100%" onclick="go('omh-set')">Check in at ${m === '30' ? '12:10' : '12:40'} AM</button>
  <button class="btn ghost sm" style="margin-top:6px" onclick="go('wrap-preview')">Done — set aside now</button></div>`, 500) }; };

/* Onboarding */
function onb(state) {
  const s3 = state === 'connecting' ? `<li class="now"><span class="dot"><span class="spin" style="width:14px;height:14px;border-color:rgba(255,255,255,.4);border-top-color:#fff"></span></span><div><b>Connect</b><p>Looking for the extension…</p></div></li>`
    : state === 'failed' ? `<li class="now"><span class="dot">3</span><div><b>Connect</b><div class="alert" style="margin-top:8px"><b>Not connected yet.</b>In chrome://extensions, check that Side is switched on, then press Check again.</div><button class="btn fill" style="margin-top:10px" onclick="go('onb-ok')">Check again</button></div></li>`
    : `<li class="done"><span class="dot">✓</span><div><b>Connected to Chrome</b><p>Side extension 0.1.0</p></div></li>`;
  const s2done = state === 'ok';
  const s2 = s2done ? `<li class="done"><span class="dot">✓</span><div><b>Side extension added</b></div></li>`
    : `<li class="${state === 'failed' ? 'done' : 'now'}"><span class="dot">${state === 'failed' ? '✓' : '2'}</span><div><b>Add the Side extension to Chrome</b>
      <p>Open this page in Chrome, switch on Developer mode, click Load unpacked and pick the folder below.</p>
      <div class="copy"><code>chrome://extensions</code><button class="btn sm" onclick="this.textContent='Copied'">Copy</button></div>
      <div class="copy"><code>~/side/apps/extension</code><button class="btn sm" onclick="this.textContent='Copied'">Copy</button></div></div></li>`;
  const draft = state === 'ok' ? `<div style="margin-top:22px;border-top:1px solid var(--line);padding-top:18px"><b style="font-size:17px">Your 38 open tabs, as sidy would fold them</b>
     <div class="gl" style="margin-top:10px">${GROUPS.map(([c, n, k]) => `<div class="g" style="--c:${c};grid-template-columns:12px 1fr auto"><i></i><span class="n">${n}</span><span class="c">${k} tabs</span></div>`).join('')}</div>
     <p class="note" style="margin:8px 0 16px">7 stay open: the tab you're on, pinned, playing sound, excluded and not sorted yet. Nothing changes until you choose.</p>
     <button class="btn fill" style="width:100%" onclick="go('hello')">Meet sidy</button></div>` : '';
  return `<div class="dim"></div><div class="onb" role="dialog" aria-label="Set up Side">${sidy(48)}
   <h1>${state === 'ok' ? 'Side is connected' : 'Set up Side'}</h1><p class="lead">${state === 'ok' ? '' : 'Two minutes. '}Tab titles go to Claude to name your groups. Addresses and page text stay on this computer.</p>
   <ol class="steps"><li class="done"><span class="dot">✓</span><div><b>Side is running</b></div></li>${s2}${s3}</ol>${draft}</div>`;
}
S['onb-connecting'] = () => (auto('onb-failed', 3000), { bg: chrome({}), edge: 'quiet', ov: onb('connecting') });
S['onb-failed'] = () => ({ bg: chrome({}), edge: 'quiet', ov: onb('failed') });
S['onb-ok'] = () => ({ bg: chrome({}), edge: 'quiet', ov: onb('ok') });

/* Main */
const NAV = [['today', '☀️', 'Today'], ['history', '📖', 'History'], ['excluded', '🚫', 'Excluded sites'], ['saw', '👀', 'What Side saw'], ['settings', '⚙️', 'Settings']];
function mainWin(cur, body) {
  return `<div class="win" style="left:72px;top:56px;width:${1710 - 72 - 132}px;height:${1107 - 56 - 48}px">
   <div class="titlebar"><i></i><i></i><i></i><span>Side</span></div>
   <nav class="nav" aria-label="Side">${NAV.map(([k, ic, t]) => `<button ${k === cur ? 'aria-current="page"' : ''} onclick="go('main-${k}')"><span class="tf">${ic}</span>${t}</button>`).join('')}
    <div class="foot"><span class="chip ok">Chrome connected</span></div></nav>
   <main class="content">${body}</main></div>`;
}
const M = (cur, body) => () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet', ov: mainWin(cur, body) });
S['main-today'] = M('today', `<h1>Today</h1><p class="lead">Tuesday, Nov 10</p>
  <div class="hero"><div><div class="lbl">Next step · from yesterday</div><div class="t">Open your pricing draft at “Annual plans”</div>
   <div class="w">Pricing page — draft · Google Docs</div><q>You asked: “Will annual pricing beat monthly?”</q></div>
   <button class="btn fill" style="height:48px;padding:0 22px;font-size:16px" onclick="go('opened')">Step inside</button></div>
  <div class="counts"><span><b>38</b>tabs in Chrome</span><span><b>31</b>set aside in 3 groups</span><span><b>2</b>steps opened this week</span><span><b>2</b>kept going 10 min</span></div>
  <section class="sec"><h2>By your side</h2><div class="bys">${sidy(32)}<p>${Q.has('learned')
    ? 'Of the 5 steps you opened, the 4 that dropped you back into a draft at your last paragraph kept you going past 10 minutes. The one that opened a fresh page didn’t. sidy will keep offering the first kind.'
    : 'sidy is still learning what gets you started. 2 steps opened so far — after 3, it can tell you which kind works for you.'}</p></div>
   <p class="note" style="margin:6px 0 0">Written by Claude from your own counts only — no titles or sites.</p></section>
  <section class="sec"><h2>Today so far</h2><ul class="tl">
   <li class="b"><time>9:05 AM</time>sidy offered one step: your pricing draft</li>
   <li class="b"><time>9:05 AM</time>You stepped inside — page ready in 1.4 s</li>
   <li><time>9:15 AM</time>Still on the draft 10 minutes later</li></ul></section>
  <section class="sec"><h2>Why sidy stayed quiet</h2><div class="quiet">sidy spoke once today.<ul><li>10:20 AM – 12:05 PM · you were typing steadily (focus)</li><li>1:30 PM · already spoke within the hour</li></ul></div></section>`);
S['main-today-empty'] = M('today', `<h1>Today</h1><p class="lead">Monday, Nov 9 · your first day with Side</p>
  <div class="hero"><div><div class="lbl">No step yet</div><div class="t">Set today aside when you stop</div>
   <div class="w">sidy folds your tabs and keeps one small step ready for when you come back.</div></div>
   <button class="btn fill" style="height:48px;padding:0 22px;font-size:16px" onclick="go('wrap-preview')">Set aside today</button></div>
  <section class="sec" style="margin-top:28px"><h2>Today so far</h2><p class="quiet">Nothing yet. Steps and wrap-ups show up here.</p></section>`);
S['main-history'] = M('history', `<h1>History</h1><p class="lead">One line per day you used Side. Days off are simply not here.</p>
  <div class="hist">
   <details open><summary>Mon, Nov 9<b>Set aside 31 tabs · 3 groups</b></summary><div class="d"><span>You asked</span>Will annual pricing beat monthly?<span>Next day's step</span>Pricing draft at “Annual plans”<span>Stepped inside</span>Yes · Tue 9:05 AM<span>Kept going 10 min</span>Yes</div></details>
   <details><summary>Sat, Nov 7<b>One more hour, then set aside 18 tabs</b></summary><div class="d"><span>You asked</span>(skipped)<span>Next day's step</span>Stripe webhook test at “Verify signature”<span>Stepped inside</span>No · you chose Rest today<span>Kept going 10 min</span>—</div></details>
   <details><summary>Fri, Nov 6<b>Set aside 12 tabs · 2 groups</b></summary><div class="d"><span>You asked</span>Why do refunds fire twice?<span>Next day's step</span>Webhook logs at “evt_refund”<span>Stepped inside</span>Yes · Sat 10:12 AM<span>Kept going 10 min</span>No</div></details>
  </div>`);
S['main-excluded'] = M('excluded', `<h1>Excluded sites</h1><p class="lead">Tabs from these sites are never saved, grouped or sent anywhere. They stay open in Chrome as they are.</p>
  <div class="field" style="max-width:640px"><label for="dom">Add a site</label><div class="row"><input id="dom" value="${STATIC ? 'clients.northwind.co' : ''}" inputmode="url" autocomplete="off"><button class="btn fill" onclick="go('main-excluded',{added:1})">Add</button></div><p class="note" style="margin:6px 0 0">Example: mybank.com — covers every page on that site.</p></div>
  <table class="tbl" style="margin-top:24px"><thead><tr><th>Site</th><th>Added</th><th>Skipped today</th><th></th></tr></thead><tbody>${Q.has('added') ? '<tr><td>clients.northwind.co</td><td>Nov 10</td><td>0 tabs</td><td style="text-align:right"><button class="btn sm">Remove</button></td></tr>' : ''}
   <tr><td>client-portal.acme.com</td><td>Nov 9</td><td>1 tab</td><td style="text-align:right"><button class="btn sm">Remove</button></td></tr>
   <tr><td>mybank.com</td><td>Nov 9</td><td>0 tabs</td><td style="text-align:right"><button class="btn sm">Remove</button></td></tr></tbody></table>`);
S['main-saw'] = M('saw', `<h1>What Side saw</h1><p class="lead">From your last wrap-up, Mon, Nov 9.</p>
  <div class="counts" style="margin-top:0"><span><b>37</b>tabs read</span><span><b>1</b>skipped</span><span><b>36</b>titles sent to Claude</span></div>
  <section class="sec"><h2>Read</h2><p class="note" style="margin:-4px 0 10px">Title, address and where you stopped on the page. Never the page text.</p>
  <table class="tbl"><thead><tr><th>Tab</th><th>Site</th><th>Where you stopped</th></tr></thead><tbody>
   <tr><td>Pricing page — draft</td><td>docs.google.com</td><td>“Annual plans save 20%…”</td></tr>
   <tr><td>Webhook signatures</td><td>docs.stripe.com</td><td>62% down the page</td></tr>
   <tr><td>Rival app pricing</td><td>rival.example</td><td>Top of page</td></tr></tbody></table>
   <button class="link" style="margin-top:10px">Show all 37</button></section>
  <section class="sec"><h2>Skipped</h2><p class="quiet">1 tab from client-portal.acme.com — excluded site, not read.</p></section>
  <section class="sec"><h2>Sent off this computer</h2><p class="quiet">36 tab titles and your one line, to Claude (Anthropic), to name 3 groups and suggest tomorrow's question. No addresses, no page text, nothing from excluded sites. Anonymous counts: off. <button class="link" onclick="go('main-settings')">Settings</button></p></section>`);
S['main-saw-empty'] = M('saw', `<h1>What Side saw</h1><p class="lead">Nothing read yet.</p>
  <div class="hero" style="grid-template-columns:1fr auto"><div><div class="t" style="font-size:20px">After your first wrap-up you'll see every tab Side read and skipped.</div><div class="w">And exactly what was sent to Claude — titles only.</div></div>
  <button class="btn fill" onclick="go('wrap-preview')">Set aside today</button></div>`);
S['main-history-empty'] = M('history', `<h1>History</h1><p class="lead">One line per day you used Side.</p>
  <div class="hero" style="grid-template-columns:1fr auto"><div><div class="t" style="font-size:20px">No days yet. Your first wrap-up shows up here.</div></div>
  <button class="btn fill" onclick="go('wrap-preview')">Set aside today</button></div>`);
S['main-excluded-empty'] = M('excluded', `<h1>Excluded sites</h1><p class="lead">Tabs from these sites are never saved, grouped or sent anywhere.</p>
  <div class="field" style="max-width:640px"><label for="dom">Add a site</label><div class="row"><input id="dom" inputmode="url" autocomplete="off"><button class="btn fill" onclick="go('main-excluded',{added:1})">Add</button></div><p class="note" style="margin:6px 0 0">Example: mybank.com — covers every page on that site.</p></div>
  <p class="quiet" style="max-width:640px;margin-top:20px">No sites excluded. Add one above — its tabs are never saved or sent.</p>`);
S['main-loading'] = M('today', `<h1>Today</h1><p class="lead">Tuesday, Nov 10</p>
  <div class="row" role="status" aria-live="polite" style="align-items:center;gap:12px;font-size:16px;margin-top:24px"><span class="spin"></span>Loading your history…</div>`);
S['main-error'] = M('today', `<h1>Today</h1><p class="lead">Tuesday, Nov 10</p>
  <div class="alert" role="alert" style="max-width:640px;font-size:15px"><b>Side couldn't read its data file on this computer.</b>Your tabs in Chrome are untouched. Try again; if it keeps failing, the file may have been moved.</div>
  <div class="row" style="margin-top:14px"><button class="btn fill" onclick="go('main-today')">Try again</button><button class="btn">Show data file</button></div>`);
S['main-settings'] = () => { const sz = Q.get('sz') || 's'; return M('settings', `<h1>Settings</h1><p class="lead">Changes apply right away.</p><div class="set">
  <div class="r"><b>sidy size</b><p>Small fits the edge best. You can see it change on the right.</p><span class="ctl seg" role="group" aria-label="sidy size">${[['s', 'Small'], ['m', 'Medium'], ['l', 'Large']].map(([k, t]) => `<button style="height:40px;padding:0 16px;font-size:15px" aria-pressed="${k === sz}" onclick="go('main-settings',{sz:'${k}'})">${t}</button>`).join('')}</span></div>
  <div class="r"><b>Show or hide sidy</b><p>Works from any app.</p><span class="ctl row" style="align-items:center"><kbd>⌃⌥S</kbd><button class="btn sm">Change</button></span></div>
  <div class="r"><b>Quiet hours</b><p>sidy won't start talking in this window.</p><span class="ctl"><button class="btn sm">10:00 PM – 8:00 AM</button></span></div>
  <div class="r"><b>Wake-up time</b><p>Used for one fact when you choose One more hour.</p><span class="ctl"><button class="btn sm">7:30 AM</button></span></div>
  <div class="r"><b>Little reactions</b><p>sidy stretches when you unlock, whistles when a video starts, nods to music. Once, about 2 seconds, no sound. Off during focus, quiet hours and Reduce Motion.</p><span class="ctl"><button class="sw" role="switch" aria-checked="true" aria-label="Little reactions" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')!=='true')"></button></span></div>
  <div class="r"><b>AI drafting</b><p>On: sends tab titles and your one line to Claude (Anthropic) to name groups, suggest tomorrow's question and word steps. Never addresses, page text or excluded sites. Off: sidy uses simple rules.</p><span class="ctl"><button class="sw" role="switch" aria-checked="true" aria-label="AI drafting" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')!=='true')"></button></span></div>
  <div class="r"><b>Share anonymous counts</b><p>Numbers only — tabs set aside, steps shown and opened. No titles, sites or words.</p><span class="ctl"><button class="sw" role="switch" aria-checked="false" aria-label="Share anonymous counts" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')!=='true')"></button></span></div>
  </div>
  <h2 style="font-size:18px;margin:28px 0 0">Connections</h2><p class="note" style="margin:2px 0 0">Where sidy can open your next step. Chrome is the first.</p><div class="set">
  <div class="r"><b>Chrome</b><p>Connected · Side extension 0.1.0</p><span class="ctl"><button class="btn sm">Check again</button></span></div>
  </div>`)(); };

/* ---------- M1 (11/9): connections, files, editor spots, Ask sidy — for Director approval ---------- */
/* Settings → Connections. The general rows are taken from main-settings as they are; the page opens scrolled to Connections. */
const SET_TOP = () => S['main-settings']().ov.split('<h2 style="font-size:18px;margin:28px 0 0">Connections</h2>')[0];
const CHIP = { ok: '<span class="chip ok">Connected</span>', no: '<span class="chip warn">Not connected</span>', chk: '<span class="chip wait chk"><span class="spin" style="width:12px;height:12px;border-width:2px"></span>Checking</span>' };
const crow = (name, chip, line, ctl, extra = '', aria = '') => `<div class="r cn"${aria ? ` aria-label="${aria}"` : ''}><div class="hd"><b>${name}</b>${CHIP[chip]}</div><p>${line}</p><span class="ctl row">${ctl}</span>${extra}</div>`;
const AGAIN = `<button class="btn">Check again</button>`;
const TG = (label, on, to) => `<button class="tg" role="switch" aria-checked="${on}" aria-label="${label}" onclick="go('${to}')"><span class="sw" aria-hidden="true"></span></button>`;
const APPS = ['Word', 'Excel', 'PowerPoint', 'Photoshop'];
function appsBlock() {
  return `<div class="apps"><div class="al">Found on this computer</div>
   ${APPS.map(a => `<button class="tg row-tg" role="switch" aria-checked="false" onclick="this.setAttribute('aria-checked',this.getAttribute('aria-checked')!=='true');this.querySelector('.st').textContent=this.getAttribute('aria-checked')==='true'?'On':'Off'"><span class="nm">${a} · <span class="st">Off</span></span><span class="sw" aria-hidden="true"></span></button>`).join('')}
   <p class="note" style="margin:10px 0 4px">sidy reads only file names and when you last used them, never what's inside.</p>
   <div class="fr"><div><b>Work folder</b><p>Optional. sidy looks for files only in this folder.</p></div><button class="btn">Choose…</button></div>
   <div class="fr"><div><b>Excluded folders</b><p>Files in these folders are never read.</p></div><button class="btn">Add…</button></div></div>`;
}
function conn({ apps = false, cal = 'off' } = {}) {
  const calRow = {
    off: ['Calendar · Off', 'no', "Turn it on so sidy knows when tomorrow starts. Titles stay on this computer.", TG('Calendar', false, 'conn-cal-checking')],
    chk: ['Calendar · On', 'chk', 'Waiting for macOS to ask you.', TG('Calendar', true, 'conn')],
    on: ['Calendar · On', 'ok', "Reads tomorrow's first event time and how many are left today. Titles stay on this computer.", TG('Calendar', true, 'conn')],
    denied: ['Calendar · Off', 'no', 'macOS said no. Allow Side in System Settings > Privacy &amp; Security > Calendars.', AGAIN + TG('Calendar', false, 'conn-cal-checking')],
  }[cal];
  const [cn, cc, cl, ctl] = calRow;
  const body = `<h2 id="conn" style="font-size:18px;margin:28px 0 0">Connections</h2><p class="note" style="margin:2px 0 0">Where sidy can open your next step. Nothing is read until you connect it.</p><div class="set">
   ${crow('Chrome', 'ok', 'Side extension 0.1.0', AGAIN, '', 'Chrome connected')}
   ${crow('Desktop apps', 'no', 'Turn on the apps sidy may open a file in.', `<button class="btn" aria-expanded="${apps}" onclick="go('${apps ? 'conn' : 'conn-apps'}')">${apps ? 'Hide apps' : 'Show apps'}</button>`, apps ? appsBlock() : '', 'Desktop apps not connected')}
   ${crow('VS Code / Cursor', 'no', 'Install the Side extension for VS Code, then open a folder.', AGAIN, '', 'VS Code not connected')}
   ${crow('Claude Code', 'no', "Add Side's hook to Claude Code. One line in README.", AGAIN, '', 'Claude Code not connected')}
   ${crow(cn.replace(' · ', '<span class="state"> · ') + '</span>', cc, cl, ctl, '', `Calendar ${cc === 'ok' ? 'connected' : cc === 'chk' ? 'checking' : 'not connected'}`)}
  </div>`;
  return { bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'quiet', ov: SET_TOP() + body + '</main></div>', after: scrollTo('#conn') };
}
const scrollTo = (sel) => () => { const c = document.querySelector('.content'), h = document.querySelector(sel); if (!c || !h) return;
  c.scrollTop += h.getBoundingClientRect().top - c.getBoundingClientRect().top - 36;
  // never leave a row half cut at the top: show it whole when most of it is visible
  const top = c.getBoundingClientRect().top;
  for (const r of c.querySelectorAll('.set > .r')) { const b = r.getBoundingClientRect(); if (b.top < top && b.bottom > top) { if (top - b.top < b.height / 2) c.scrollTop -= top - b.top; break; } } };
S['conn'] = () => conn();
S['conn-apps'] = () => conn({ apps: true });
S['conn-cal-checking'] = () => { auto('conn-cal', 1800); return conn({ cal: 'chk' }); };
S['conn-cal'] = () => conn({ cal: 'on' });
S['conn-cal-denied'] = () => conn({ cal: 'denied' });

/* Wrap up with files saved today: listed only, never closed or touched. */
const FILES = `<div class="files"><h4>Files saved today</h4><ul><li>november-orders.xlsx — Excel</li><li>cover.psd — Photoshop</li></ul>
  <p class="note" style="margin:6px 0 0">Left as they are. sidy only remembers them for tomorrow.</p></div>`;
S['wrap-files'] = () => ({ bg: chrome({}), edge: 'quiet', ov: panel(`${head(OK, 'mini-night')}${wrapBody(false).replace(/<\/div>$/, FILES + '</div>')}
  <div class="pf"><button class="btn fill" style="width:100%" onclick="go('wrap-checking',{op:''})">${PRIMARY()}</button>
  <div class="row" style="justify-content:space-between;margin-top:6px"><button class="btn ghost sm" onclick="go('omh')">One more hour</button><button class="btn ghost sm" onclick="go('mini-night')">Cancel</button></div></div>`, 900) });

/* Return with a file in a desktop app, or a spot in the editor. One action, same bubble as return. */
S['return-file'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'out', ov: bubble(`${X('day-quiet', 'Not now')}
  <p style="text-wrap:pretty">“why does row 88 not add up” — november-orders is ready to open in Excel.</p>
  <span class="meta">Last wrap-up · Yesterday</span>
  <div class="row"><button class="btn fill grow" onclick="go('return-file-done')">Step inside</button><button class="btn grow" onclick="go('rest')">Rest today</button></div>`, { w: 360, h: 196 }) });
S['return-editor'] = () => ({ bg: chrome({ tabs: 'after', page: 'vid' }), edge: 'out', ov: bubble(`${X('day-quiet', 'Not now')}
  <p style="text-wrap:balance">retry.test.ts is ready in VS Code, at line 88.</p>
  <span class="meta">Last wrap-up · Yesterday</span>
  <div class="row"><button class="btn fill grow">Step inside</button><button class="btn grow" onclick="go('rest')">Rest today</button></div>`, { w: 360, h: 148 }) });
/* A plain spreadsheet window standing in for the opened file (no app branding). */
function sheetBg() {
  const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G'], items = ['Desk lamp', 'Notebook, A5', 'Pen set', 'Mug', 'Phone stand', 'Cable ties', 'Desk mat'];
  let rows = '';
  for (let r = 74; r <= 110; r++) {
    const f = r <= 96, k = r % 7, q = (r % 4) + 1, p = 6 + k * 3;
    rows += `<tr><th>${r}</th>${f ? `<td>NW-${1000 + r}</td><td>${items[k]}</td><td class="n">${q}</td><td class="n">${p}.00</td><td class="n${r === 96 ? ' sel' : ''}">${(q * p).toFixed(2)}</td>` : '<td></td><td></td><td></td><td></td><td></td>'}<td></td><td></td></tr>`;
  }
  return `<div class="sheetwin"><div class="titlebar"><i></i><i></i><i></i><span>november-orders.xlsx</span></div>
   <div class="fx"><span>E96</span><span>=C96*D96</span></div>
   <table class="xl"><thead><tr><th></th>${cols.map(c => `<th>${c}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table></div>`;
}
S['return-file-done'] = () => { auto('file-quiet', 4000); return { bg: sheetBg(), edge: 'out',
  ov: bubble(`${X('file-quiet')}<p style="margin-bottom:0;text-wrap:pretty">Go to the last filled cell of november-orders in Excel — done.</p>`, { w: 360, h: 72 }) }; };
S['file-quiet'] = () => ({ bg: sheetBg(), edge: 'quiet' });

/* What Side saw, with files and editor spots. */
S['saw-files'] = M('saw', `<div class="compact"><h1>What Side saw</h1><p class="lead">From your last wrap-up, Mon, Nov 9.</p>
  <div class="counts" style="margin:0 0 6px"><span><b>37</b>tabs read</span><span><b>1</b>skipped</span><span><b>36</b>titles sent to Claude</span></div>
  <div class="counts" style="margin:0 0 24px"><span><b>3</b>files read</span><span><b>1</b>skipped (excluded folder)</span><span><b>1</b>editor spot</span></div>
  <section class="sec"><h2>Read</h2><p class="note" style="margin:-4px 0 10px">Title, address and where you stopped on the page. Never the page text.</p>
  <table class="tbl"><thead><tr><th>Tab</th><th>Site</th><th>Where you stopped</th></tr></thead><tbody>
   <tr><td>Pricing page — draft</td><td>docs.google.com</td><td>“Annual plans save 20%…”</td></tr>
   <tr><td>Webhook signatures</td><td>docs.stripe.com</td><td>62% down the page</td></tr></tbody></table>
   <button class="link" style="margin-top:10px">Show all 37</button></section>
  <section class="sec"><h2>Files and editor spots</h2><p class="note" style="margin:-4px 0 10px">File name and when you last used it. Never what's inside. Paths stay on this computer.</p>
  <table class="tbl"><thead><tr><th>File</th><th>App</th><th>What sidy kept</th></tr></thead><tbody>
   <tr><td>november-orders.xlsx</td><td>Excel</td><td>Name · last used yesterday</td></tr>
   <tr><td>cover.psd</td><td>Photoshop</td><td>Name · last used yesterday</td></tr>
   <tr><td>q4-plan.docx</td><td>Word</td><td>Name · last used yesterday</td></tr>
   <tr><td>retry.test.ts</td><td>VS Code</td><td>Name · line 88 (editor spot)</td></tr></tbody></table></section>
  <section class="sec"><h2>Skipped</h2><div class="quiet"><ul style="margin:0;padding-left:18px"><li>1 tab from client-portal.acme.com — excluded site, not read.</li><li>1 file in an excluded folder — not read.</li></ul></div></section>
  <section class="sec"><h2>Sent off this computer</h2><p class="quiet">36 tab titles and your one line, to Claude (Anthropic), to name 3 groups and suggest tomorrow's question. No addresses, no page text, no file names, nothing from excluded sites. Anonymous counts: off. <button class="link" onclick="go('main-settings')">Settings</button></p></section></div>`);

/* Ask sidy in Mini: one line becomes at most one fixed action. Wording from core/askSidy.ts askCopy. */
const ASK_ACTS = [['Set aside today', 'wrap-preview'], ['Open the next step', 'opened'], ['One more hour', 'omh'], ['Quiet for 1 hour', 'quiet-night'],
  ['Hide sidy', 'hide-toast'], ['Open Side', 'main-today'], ['Exclude this site', 'main-excluded']];
window.askGo = () => { const v = (document.getElementById('ask') || {}).value || '';
  go(/\bhow\b|tutorial/i.test(v) ? 'mini-ask-howto' : /\b(order|buy|pay|book|send)\b/i.test(v) ? 'mini-ask-menu' : 'mini-ask-asking'); };
function askBlock(state) {
  const val = { asking: "I'm done for today", menu: 'order the groceries', howto: 'how do I do a VLOOKUP in Excel' }[state] || '';
  const busy = state === 'asking';
  const reply = state === 'menu'
    ? `<div class="reply" role="status"><p>I can't do that for you. I can open your work so you can do it yourself. I can do these:</p>
       <div class="acts">${ASK_ACTS.map(([t, to]) => `<button onclick="go('${to}')">${t}</button>`).join('')}</div>
       <p class="note" style="margin:8px 0 0">Set aside today opens the preview first. Nothing closes.</p></div>`
    : state === 'howto'
      ? `<div class="reply" role="status"><p>I don't give guides. Search for: </p>
       <div class="copy" style="margin-top:0"><code>Excel VLOOKUP tutorial</code><button class="btn" onclick="this.textContent='Copied'">Copy</button></div></div>`
      : busy ? `<div class="row asking" role="status" aria-live="polite"><span class="spin"></span>Asking sidy…</div>` : '';
  return `<div class="ask field"><label for="ask">Ask sidy</label>
    <div class="row"><input id="ask" placeholder="e.g. I'm done for today" autocomplete="off" value="${val}"${busy ? ' aria-disabled="true" readonly' : ''} onkeydown="if(event.key==='Enter')askGo()"><button class="btn"${busy ? ' aria-disabled="true"' : ''} onclick="askGo()">Ask</button></div>
    ${reply || `<p class="note" style="margin:6px 0 0">Tell sidy in a few words. Only this line goes to Claude, to pick one action. Set aside only opens the preview.</p>`}</div>`;
}
const miniAsk = (state) => () => { if (state === 'asking') auto('wrap-preview', 1800); return { bg: chrome({}), edge: 'quiet', ov: panel(`${head(OK, 'quiet-night')}<div class="pb">
  <div class="step"><div class="lbl">Stopping for today?</div><div class="t">Fold 38 tabs into 3 groups</div><div class="w">Nothing closes. Undo any time tonight.</div>
   <button class="btn fill" style="width:100%" onclick="go('wrap-preview')">Set aside today</button></div>
  <div class="facts"><div><span>Tabs in Chrome</span><b>38</b></div><div><span>Set aside</span><b>0</b></div><div><span>Next step</span><b>Ready after you set aside</b></div></div>
  ${QA([['⏳', 'One more hour', 'Keep going, with one check-in', 'omh'], ['🙈', 'Hide sidy', '', 'hide-toast', '⌃⌥S']])}
  ${askBlock(state)}
  </div>${FOOT}`, state === 'menu' ? 1040 : state === 'howto' ? 760 : 680) }; };
S['mini-ask'] = miniAsk('');
S['mini-ask-asking'] = miniAsk('asking');
S['mini-ask-menu'] = miniAsk('menu');
S['mini-ask-howto'] = miniAsk('howto');

/* ---------- render ---------- */
function render() {
  const sc = (S[ST] || S['quiet-night'])();
  const stage = document.getElementById('stage');
  stage.innerHTML = sc.bg + edge(sc.edge) + (sc.ov || '') + (STATIC ? '' : mockBar());
  if (Q.has('guide')) stage.classList.add('hitguide');
  if (sc.cls) stage.classList.add(sc.cls);
  if (sc.after) sc.after();
  if (Q.has('t')) { stage.classList.add('frz'); const t = +Q.get('t'); stage.querySelectorAll('.edge svg').forEach(el => el.style.animationDelay = `${-t}s`); stage.querySelectorAll('.notes span').forEach((el, k) => el.style.animationDelay = `${(0.35 * k - t).toFixed(2)}s`); }
}
function mockBar() {
  return `<div class="mock" aria-hidden="true">Mockup only:
   <button onclick="go('quiet-night')">Tonight</button><button onclick="go('return')">Next day</button><button onclick="go('return-3d')">3 days later</button>
   <button onclick="go('omh-due')">Check-in time</button><button onclick="go('mini-off')">Chrome off</button><button onclick="go('onb-connecting')">First run</button>
   <button onclick="go('main-today')">Main</button><button onclick="go('react-whistle')">Video starts</button><button onclick="go('react-stretch')">Unlock</button><button onclick="go('react-nod')">Music</button><span>· ⌃⌥S toggles sidy</span></div>`;
}
document.addEventListener('keydown', (e) => {
  if (e.ctrlKey && e.altKey && e.code === 'KeyS') go(ST === 'hidden' || ST === 'hide-toast' ? 'day-quiet' : 'hide-toast');
  if (e.key === 'Escape' && (ST.startsWith('mini') || ST.startsWith('wrap') || ST === 'omh')) go(back());
});
if (document.getElementById("stage")) render();
