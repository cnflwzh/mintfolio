import type { SearchPayload } from '@mintfolio/theme-api';
import { getPublishedPosts,summarizePost,getPostProse } from '../server/posts';
import { createSearchEntry } from '@mintfolio/theme-api/search';
/** Same-origin static JSON, fetched only when a visitor starts searching. */
export async function GET():Promise<Response> {
  const entries=(await getPublishedPosts()).filter(entry=>!entry.data.seo?.noindex);
  const posts=entries.map(entry=>summarizePost(entry));
  const index=entries.map((entry,i)=>createSearchEntry(posts[i]!,posts[i]!.protected?undefined:getPostProse(entry).text));
  return new Response(JSON.stringify({posts,index} satisfies SearchPayload),{headers:{'Content-Type':'application/json; charset=utf-8'}});
}
