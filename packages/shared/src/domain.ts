// One place that decides what "the same site" means. Every exclusion check,
// count and display goes through these functions so they cannot disagree.

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

function stripWww(host: string): string {
  return host.startsWith('www.') ? host.slice(4) : host;
}

/** Host of a web URL, lowercase, without a leading "www.". Null for non-web URLs. */
export function hostOf(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    return stripWww(u.hostname.toLowerCase());
  } catch {
    return null;
  }
}

/** Turns what a person typed ("https://www.Bank.com/x", "*.notion.so") into a bare domain, or null. */
export function normalizeDomain(input: string): string | null {
  let s = input.trim().toLowerCase();
  if (!s) return null;
  s = s.replace(/^[a-z]+:\/\//, '');
  s = s.replace(/^\*\./, '');
  s = s.split(/[/?#]/)[0] ?? '';
  s = s.split(':')[0] ?? '';
  s = stripWww(s);
  const labels = s.split('.');
  if (labels.length < 2) return null;
  if (!labels.every((l) => LABEL.test(l))) return null;
  return s;
}

/** The exclusion entry that covers this URL (the domain itself or any subdomain), or null. */
export function matchExcluded(url: string, domains: readonly string[]): string | null {
  const host = hostOf(url);
  if (!host) return null;
  for (const d of domains) {
    if (host === d || host.endsWith('.' + d)) return d;
  }
  return null;
}

export function isExcluded(url: string, domains: readonly string[]): boolean {
  return matchExcluded(url, domains) !== null;
}
