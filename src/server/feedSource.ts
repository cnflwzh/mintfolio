import type { PublicSite } from '@mintfolio/theme-api';
import { getPublishedPosts, summarizePost } from './posts';
import { selectFeedPosts, type FeedOptions, type FeedPost } from './feeds';
import { absoluteUrl } from './routing';
import { prepareContentHtml } from './contentHtml';

/**
 * Read only the published collection; exclusion and limit happen before rendering.
 * Full feeds reuse Astro's real Markdown renderer so image imports and remark/
 * rehype plugins behave the same as article pages. No protected entry is rendered.
 */
export async function getFeedPosts(site: PublicSite, options: FeedOptions = {}): Promise<FeedPost[]> {
  const entries = await getPublishedPosts();
  const entriesById = new Map(entries.map((entry) => [entry.id, entry]));
  const summaries = selectFeedPosts(site, entries.map((entry) => summarizePost(entry)), options);
  if ((options.content ?? site.feed?.content ?? 'summary') !== 'full') return summaries;
  const [{ render }, { experimental_AstroContainer }] = await Promise.all([
    import('astro:content'), import('astro/container'),
  ]);
  const container = await experimental_AstroContainer.create();
  return Promise.all(summaries.map(async (post): Promise<FeedPost> => {
    const entry = entriesById.get(post.id)!;
    const { Content } = await render(entry);
    const contentHtml = await container.renderToString(Content, {
      request: new Request(absoluteUrl(post.url, site.url)),
    });
    return { ...post, contentHtml: prepareContentHtml(contentHtml) };
  }));
}
