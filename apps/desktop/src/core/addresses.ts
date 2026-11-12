// The one place that removes web addresses from text before it goes to the model.
// Titles, the user's line, file names and model-returned names all pass through it.

// Common TLDs including country codes. Left out on purpose: file extensions that are also TLDs
// (sh, md, cc, ts, pl), so "install.sh" and "Node.js" stay. A bare name like "ASP.NET" is stripped.
const TLDS =
  'com|org|net|io|app|dev|so|ai|co|kr|uk|de|jp|fr|xyz|me|tv|gg|ly|cn|ru|it|es|nl|se|ch|us|ca|au|br|info|biz|edu|gov|page|site|online|tech|cloud|store|shop';

const SCHEME = /https?:\/\/\S+/gi;
const WWW = /\bwww\.\S*/gi;
const DOMAIN = new RegExp(`\\b[a-z0-9-]+(\\.[a-z0-9-]+)*\\.(${TLDS})\\b\\S*`, 'gi');

/** Strips anything that looks like an address or a domain (one dot is enough: "stripe.com"). */
export function stripAddresses(s: string): string {
  return s.replace(SCHEME, '').replace(WWW, '').replace(DOMAIN, '').replace(/\s{2,}/g, ' ').trim();
}
