/** Normalize one URL segment without treating an encoded slash as a path boundary. */
function encodedSegment(value) {
  try { value = decodeURIComponent(value); } catch { /* A literal percent is encoded below. */ }
  return encodeURIComponent(value.normalize('NFC'));
}
/** Normalize Astro's base to one encoded path with a trailing slash. */
export function normalizeBase(base = '/') {
  const segments = base.split('/').filter(Boolean).map(encodedSegment);
  return segments.length ? '/' + segments.join('/') + '/' : '/';
}
/** Prefix a logical Core route, even when its first segment equals the base. */
export function prefixRoute(path, base = '/') { return normalizeBase(base).slice(0, -1) + path; }
/** Count matching base segments, comparing Unicode and percent-encoded forms equally. */
function matchingBaseSegments(value, base) {
  const prefix = normalizeBase(base).split('/').filter(Boolean);
  const parts = value.split(/[?#]/, 1)[0].slice(1).split('/');
  return prefix.every((segment, index) => parts[index] !== undefined && encodedSegment(parts[index]) === segment) ? prefix.length : -1;
}
/** Resolve an authored root-relative URL; existing prefixes and external URLs are preserved. */
export function withBase(value, base = '/') {
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  return matchingBaseSegments(value, base) >= 0 ? value : normalizeBase(base).slice(0, -1) + value;
}
/** Remove the deployment prefix when returning logical Astro route parameters. */
export function withoutBase(value, base = '/') {
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  const count = matchingBaseSegments(value, base);
  if (count <= 0) return value;
  const parts = value.split(/[?#]/, 1)[0].slice(1).split('/');
  const suffix = value.slice(1 + parts.slice(0, count).join('/').length);
  return suffix.startsWith('/') ? suffix : '/' + suffix;
}
/** Derive the public deployment URL; reject a conflicting site.url pathname early. */
export function deploymentUrl(siteUrl, base = '/') {
  const site = new URL(siteUrl), path = normalizeBase(base);
  if (site.search || site.hash || (site.pathname !== '/' && normalizeBase(site.pathname) !== path)) throw new Error('[mintfolio:config] site.url pathname must match Astro base (or use the site origin)');
  return new URL(path, site.origin).href;
}
