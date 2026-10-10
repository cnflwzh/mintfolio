import { getPublicSite } from '../server/site';
import { getFeedPosts } from '../server/feedSource';
import { generateAtom } from '../server/feeds';

/** Atom 1.0 shares RSS publication, filtering and full-content policy. */
export async function GET(): Promise<Response> {
  const site = getPublicSite();
  return new Response(generateAtom(site, await getFeedPosts(site)), {
    headers: { 'Content-Type': 'application/atom+xml; charset=utf-8' },
  });
}
