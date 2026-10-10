import type { ContentSeo, PostSummary, PublicSite } from '@mintfolio/theme-api';
import { absoluteUrl } from './routing.ts';
import { xmlEscape } from './xml.ts';

/** Public pages/taxonomy/pagination URLs supplied by Core's static route registry. */
export interface SitemapPage {
  url: string;
  updatedAt?: string;
  seo?: ContentSeo;
  preview?: boolean;
}

/** Alternate canonicals and external URLs should not be advertised for this site. */
function sitemapUrl(siteUrl: string, entry: SitemapPage): string | undefined {
  if (entry.preview || entry.seo?.noindex) return undefined;
  const url = new URL(absoluteUrl(entry.url, siteUrl));
  if (url.origin !== new URL(siteUrl).origin || url.search || url.hash) return undefined;
  if (entry.seo?.canonical) {
    const canonical = new URL(absoluteUrl(entry.seo.canonical, siteUrl));
    if (canonical.href.replace(/\/$/, '') !== url.href.replace(/\/$/, '')) return undefined;
  }
  return url.href;
}

/**
 * Generate a deduplicated sitemap with actual content modification dates.
 * @param posts Safe published summaries; protected/preview/noindex entries are excluded.
 * @param pages Other public static routes, including custom pages and archive pages.
 * No artificial lastmod is emitted merely because a new build occurred.
 */
export function generateSitemap(
  site: Pick<PublicSite, 'url'>, posts: readonly PostSummary[], pages: readonly SitemapPage[] = [],
): string {
  const entries = new Map<string, string | undefined>();
  const pageEntries = new Map<string, SitemapPage>();
  for (const page of [{ url: '/' }, { url: '/about' }, { url: '/blog' }, ...pages]) {
    pageEntries.set(absoluteUrl(page.url, site.url), page);
  }
  for (const page of pageEntries.values()) {
    const loc = sitemapUrl(site.url, page);
    if (loc) entries.set(loc, page.updatedAt);
  }
  for (const post of posts) {
    if (post.protected) continue;
    const loc = sitemapUrl(site.url, post);
    if (loc) entries.set(loc, post.updatedAt ?? post.publishedAt);
  }
  const urls = [...entries].map(([loc, lastmod]) => `<url><loc>${xmlEscape(loc)}</loc>${lastmod ? `<lastmod>${xmlEscape(new Date(lastmod).toISOString())}</lastmod>` : ''}</url>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

/** A static robots document advertising the canonical sitemap, with no crawl block. */
export function generateRobots(site: Pick<PublicSite, 'url'>): string {
  return `User-agent: *\nAllow: /\n\nSitemap: ${absoluteUrl('/sitemap.xml', site.url)}\n`;
}
