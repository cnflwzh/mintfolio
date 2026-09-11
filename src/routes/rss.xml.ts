/**
 * @fileoverview RSS feed generator for blog posts.
 * 
 * Generates an RSS 2.0 XML feed at /rss.xml containing the 50 most recent
 * published blog posts with title, link, description, and publication date.
 */

import { getPublishedPosts, isProtectedPost } from '../server/posts';
import { urls } from '../server/routing';
import { xmlEscape } from '../server/xml';
import { getPublicSite } from '../server/site';
const site = getPublicSite();

export async function GET(): Promise<Response> {
  const siteUrl = site.url.replace(/\/$/, '');
  const posts = (await getPublishedPosts()).filter((post) => !isProtectedPost(post)).slice(0, 50);

  const itemsXml = posts.map((post) => {
    const link = xmlEscape(`${siteUrl}${urls.post(post.id)}`);
    const title = xmlEscape(post.data.title);
    const description = xmlEscape(post.data.description || '');
    const pubDate = post.data.pubDate.toUTCString();

    return `<item><title>${title}</title><link>${link}</link><guid>${link}</guid><description>${description}</description><pubDate>${pubDate}</pubDate></item>`;
  }).join('');

  const rssXml = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel><title>${xmlEscape(site.title)}</title><link>${xmlEscape(siteUrl)}</link><description>${xmlEscape(site.description)}</description><language>${xmlEscape(site.language)}</language>${itemsXml}</channel></rss>`;

  return new Response(rssXml, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
    },
  });
}
