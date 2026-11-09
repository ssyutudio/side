// Fits 1920x1080 slides to the window, fills the live numbers from numbers.js, and handles a missing QR.
(function () {
  const deck = document.querySelector('.deck');
  const fit = () => deck.style.setProperty('--fit', String(Math.min(1, (window.innerWidth - 48) / 1920)));
  fit();
  window.addEventListener('resize', fit);

  // Arrow keys and space step through slides.
  const slides = [...document.querySelectorAll('.slide')];
  document.addEventListener('keydown', (e) => {
    if (!['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key)) return;
    e.preventDefault();
    const y = window.scrollY + 10;
    const tops = slides.map((s) => s.getBoundingClientRect().top + window.scrollY);
    const cur = tops.reduce((best, t, i) => (t <= y ? i : best), 0);
    const next = ['ArrowLeft', 'ArrowUp', 'PageUp'].includes(e.key) ? Math.max(0, cur - 1) : Math.min(slides.length - 1, cur + 1);
    slides[next].scrollIntoView({ block: 'start' });
  });

  // QR: if the waitlist QR has not been generated yet, say so instead of showing a broken image.
  for (const img of document.querySelectorAll('img.qr')) {
    img.addEventListener('error', () => {
      const box = document.createElement('div');
      box.className = 'missing';
      box.style.width = img.width + 'px';
      box.style.height = img.height + 'px';
      box.textContent = 'Waitlist QR goes here once the waitlist is deployed (docs/assets/waitlist-qr.svg).';
      img.replaceWith(box);
    });
  }

  const N = window.SIDE_NUMBERS || null;
  for (const el of document.querySelectorAll('[data-url]')) {
    el.textContent = N && N.waitlistUrl ? N.waitlistUrl.replace(/^https:\/\//, '') : '';
  }
  if (!N) return;

  const pct = (r) => (r && r.value !== null ? Math.round(r.value * 100) + '%' : '–');
  const ofN = (r, what) => (r && r.n > 0 ? `n = ${r.n} ${what}` : 'not measured yet');
  for (const el of document.querySelectorAll('[data-n]')) {
    const v = N[el.dataset.n];
    el.textContent = typeof v === 'number' ? String(v) : '–';
  }
  for (const el of document.querySelectorAll('[data-rate]')) el.textContent = pct(N[el.dataset.rate]);
  const rateNote = { clickRate: 'steps offered', stillWorkingRate: 'steps clicked and checked' };
  for (const el of document.querySelectorAll('[data-rate-n]')) el.textContent = ofN(N[el.dataset.rateN], rateNote[el.dataset.rateN]);
  for (const el of document.querySelectorAll('[data-sub]')) {
    if (el.dataset.sub === 'wrapUps') el.textContent = `in ${N.wrapUps} wrap-up${N.wrapUps === 1 ? '' : 's'}`;
    if (el.dataset.sub === 'waitlistAt') el.textContent = N.generatedAt ? `as of ${new Date(N.generatedAt).toUTCString().slice(5, 22)} UTC` : '';
  }

  if (N.hasData) {
    document.getElementById('stats').hidden = false;
    document.getElementById('nodata').hidden = true;
  } else if (typeof N.waitlistCount === 'number') {
    const w = document.getElementById('waitlist-only');
    w.hidden = false;
    w.textContent = `Waitlist sign-ups so far: ${N.waitlistCount}.`;
  }
})();
