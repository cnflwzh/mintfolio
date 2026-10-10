import { getPublishedPosts, summarizePost } from '../server/posts';
import { getPublicSite } from '../server/site';
import { getStaticPages } from '../server/pagesContent';
import { getArchiveRoutes } from '../server/extraRoutes';
import { generateSitemap } from '../server/sitemap';

/** Build a sitemap from public articles and Markdown pages with real lastmod. */
export async function GET(): Promise<Response> {
  const [posts, pages, archives] = await Promise.all([getPublishedPosts(), getStaticPages(), getArchiveRoutes()]);
  return new Response(generateSitemap(getPublicSite(), posts.map((post) => summarizePost(post)), [...pages, ...archives]), {
    headers: { 'Content-Type': 'application/xml; charset=utf-8' },
  });
}
