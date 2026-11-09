// Placeholder edge page: positions a neutral shape in the hit area and toggles click-through.
const hit = document.getElementById('hit');
const shape = document.getElementById('shape');
let inside = false;

window.side.onLayout(({ hit: r, sidyHeight }) => {
  Object.assign(hit.style, { left: r.x + 'px', top: r.y + 'px', width: r.width + 'px', height: r.height + 'px' });
  // Only part of the body shows: the rest sits past the screen edge, like a head peeking in.
  Object.assign(shape.style, { width: sidyHeight + 'px', height: sidyHeight + 'px', marginRight: -Math.round(sidyHeight * 0.45) + 'px' });
});

window.addEventListener('mousemove', (e) => {
  const over = hit.contains(document.elementFromPoint(e.clientX, e.clientY));
  if (over !== inside) {
    inside = over;
    window.side.setInteractive(over);
  }
});
window.addEventListener('mouseleave', () => {
  if (inside) {
    inside = false;
    window.side.setInteractive(false);
  }
});
