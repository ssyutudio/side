// sidy, drawn once for every size: a rounded square (radius ~28%), one ink line (~5%), the blue
// side on the right (~26% of the width), two vertical pill eyes on the left looking at the work.
// No mouth, cheeks, sparkles, gradients or oversized eyes.
export function sidySvg(px: number, title = ''): string {
  const id = `sc${px}${Math.random().toString(36).slice(2, 7)}`;
  const label = title ? `role="img" aria-label="${title}"` : 'aria-hidden="true"';
  return `<svg class="sidy-svg" width="${px}" height="${px}" viewBox="0 0 100 100" ${label}>
<defs><clipPath id="${id}"><rect x="4" y="4" width="92" height="92" rx="26"/></clipPath></defs>
<rect x="4" y="4" width="92" height="92" rx="26" fill="#F3F3EF"/>
<rect x="72" y="0" width="30" height="100" fill="#3B54E7" clip-path="url(#${id})"/>
<rect x="4" y="4" width="92" height="92" rx="26" fill="none" stroke="#1E2025" stroke-width="5"/>
<rect x="16.5" y="33" width="8" height="20" rx="4" fill="#1E2025"/>
<rect x="38.5" y="33" width="8" height="20" rx="4" fill="#1E2025"/></svg>`;
}
