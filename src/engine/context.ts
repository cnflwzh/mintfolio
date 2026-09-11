import type { PostQuery, PostSummary, ThemeContext, ThemeDefinition } from '@mintfolio/theme-api';
import { createSearchEntry, filterPosts } from '@mintfolio/theme-api/search';
import { getPublishedPosts, toPostSummary, collectTaxonomy, collectArchives } from '../server/posts';
import { getPublicSite } from '../server/site';
import { urls } from '../server/routing';

/** Only validated manifest data and recursively validated settings cross this boundary. */
export interface ActiveTheme {
  definition: ThemeDefinition;
  settings: Record<string, unknown>;
}

/** Reject invalid paging values before slicing, including NaN and fractions. */
function pageNumber(value: number | undefined, field: string, fallback: number): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`content.posts(): ${field} must be a non-negative safe integer`);
  return value;
}

/**
 * Construct one immutable-by-convention render context. A snapshot belongs to
 * this render, so dev content edits cannot be hidden by a process-wide cache.
 * Neither functions nor internal collection entries are serialized to browsers.
 */
export async function createThemeContext(active: ActiveTheme): Promise<ThemeContext> {
  const posts = (await getPublishedPosts()).map(toPostSummary);
  if (posts.some((post) => post.protected) && !active.definition.capabilities.encryptedPosts) {
    throw new Error(`[theme:capability] ${active.definition.manifest.id} does not support encryptedPosts, but the site has protected articles`);
  }
  return {
    site: getPublicSite(),
    navigation: [
      { id: 'home', label: '首页', url: urls.home() },
      { id: 'archive', label: '全部文章', url: urls.archive() },
      { id: 'about', label: '关于我', url: urls.page('about') },
    ],
    settings: active.settings,
    content: {
      posts: async (query: PostQuery = {}): Promise<{ items: PostSummary[]; total: number }> => {
        const matches = filterPosts(posts, query);
        const offset = pageNumber(query.offset, 'offset', 0);
        const limit = pageNumber(query.limit, 'limit', matches.length);
        return { items: matches.slice(offset, offset + limit), total: matches.length };
      },
      post: async (id: string): Promise<PostSummary | null> => posts.find((post) => post.id === id) ?? null,
    },
    taxonomy: {
      tags: async () => collectTaxonomy(posts, 'tags'),
      categories: async () => collectTaxonomy(posts, 'categories'),
      archives: async () => collectArchives(posts),
    },
    urls,
    search: { index: async () => posts.map(createSearchEntry) },
  };
}
