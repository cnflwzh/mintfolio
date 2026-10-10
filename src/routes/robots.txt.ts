import { getPublicSite } from '../server/site';
import { generateRobots } from '../server/sitemap';

/** Crawling policy is static; private articles use noindex in their own metadata. */
export function GET(): Response {
  return new Response(generateRobots(getPublicSite()), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
