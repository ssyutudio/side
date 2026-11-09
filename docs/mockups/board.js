/* builds a board of scene frames: data-cells JSON on #grid */
const cells = JSON.parse(document.getElementById('grid').dataset.cells);
document.getElementById('grid').innerHTML = cells.map(([s, cap, q = '', crop]) => {
  const src = `scene.html?s=${s}&still=1${q}`;
  let st = '';
  if (crop) { const [x, y, k] = crop; st = `style="transform:scale(${k}) translate(${-x}px,${-y}px)"`; }
  return `<div class="cell"><div class="fr"><iframe src="${src}" ${st} loading="eager" title="${s}"></iframe></div>
   <div class="cap"><b>${cap[0]}</b>${cap[1] || ''} · <a href="scene.html?s=${s}${q}" target="_blank">open, clickable</a></div></div>`;
}).join('');
