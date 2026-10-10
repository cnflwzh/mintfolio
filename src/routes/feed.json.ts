import { getPublicSite } from '../server/site';
import { getFeedPosts } from '../server/feedSource';
import { generateJsonFeed } from '../server/feeds';

/** JSON Feed 1.1 shares RSS publication, filtering and full-content policy. */
export async function GET(): Promise<Response> {
  const site = getPublicSite();
  return new Response(generateJsonFeed(site, await getFeedPosts(site)), {
    headers: { 'Content-Type': 'application/feed+json; charset=utf-8' },
  });
}
