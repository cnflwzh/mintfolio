/**
 * @fileoverview Sitemap generator for SEO.
 * 
 * Generates an XML sitemap at /sitemap.xml containing all public pages:
 * - Static pages (home, about, blog index)
 * - All published blog posts
 */

import { getPublishedPosts, isProtectedPost } from '../server/posts';
import { urls } from '../server/routing';
import { xmlEscape } from '../server/xml';
import { getPublicSite } from '../server/site';
const site = getPublicSite();

export async function GET(): Promise<Response> {
  const siteUrl = site.url.replace(/\/$/, '');
  const now = new Date().toISOString();
  const posts = (await getPublishedPosts()).filter((post) => !isProtectedPost(post));

  const staticUrls = [
    { loc: `${siteUrl}${urls.home()}`, lastmod: now },
    { loc: `${siteUrl}${urls.page('about')}/`, lastmod: now },
    { loc: `${siteUrl}${urls.archive()}/`, lastmod: now },
  ];

  const postUrls = posts.map((post) => ({
    loc: `${siteUrl}${urls.post(post.id)}/`,
    lastmod: post.data.pubDate.toISOString(),
  }));

  const allUrls = [...staticUrls, ...postUrls]
    .map((entry) => `<url><loc>${xmlEscape(entry.loc)}</loc><lastmod>${entry.lastmod}</lastmod></url>`)
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${allUrls}</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
    },
  });
}
