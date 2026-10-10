import { getPublicSite } from '../server/site';
import { getFeedPosts } from '../server/feedSource';
import { generateRss } from '../server/feeds';

/** RSS is pre-rendered at build time; no backend is needed after deployment. */
export async function GET(): Promise<Response> {
  const site = getPublicSite();
  return new Response(generateRss(site, await getFeedPosts(site)), {
    headers: { 'Content-Type': 'application/rss+xml; charset=utf-8' },
  });
}
