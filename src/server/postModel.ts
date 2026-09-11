import type { PostSummary, PublicImage, TaxonomyTerm, TaxonomyCount, ArchivePeriod } from '@mintfolio/theme-api';
import { urls } from './routing.ts';

/**
 * The fields Core needs from a validated content entry. Astro's collection entry
 * structurally satisfies this interface, but raw content remains private. Keeping
 * the projection independent of Astro lets policy tests use in-memory records.
 */
export interface PostSource {
  id: string;
  data: {
    title: string;
    description: string;
    pubDate: Date;
    tags?: string[];
    category?: string;
    cover?: string | PublicImage;
    draft: boolean;
    password?: string;
  };
}

export const UNCATEGORIZED = '未分类';
export const PROTECTED_POST_DESCRIPTION = '这是一篇加密文章，请输入密码后阅读。';

/** A present password enables protection, including during development. */
export function isProtectedPost(post: Pick<PostSource, 'data'>): boolean {
  return post.data.password !== undefined;
}

/** Public previews never expose the protected frontmatter description. */
export function getPostDescription(post: Pick<PostSource, 'data'>): string {
  return isProtectedPost(post) ? PROTECTED_POST_DESCRIPTION : post.data.description;
}

/**
 * Shared publication policy used by the real collection reader. Drafts never
 * enter public content services; newest articles come first. Input order and
 * records are untouched, including when multiple articles share a date.
 */
export function selectPublishedPosts<T extends PostSource>(posts: readonly T[]): T[] {
  return posts.filter((post) => !post.data.draft)
    .toSorted((left, right) => right.data.pubDate.valueOf() - left.data.pubDate.valueOf());
}

/** Convert one taxonomy label into a link using the host's route policy. */
function term(label: string, kind: 'tag' | 'category'): TaxonomyTerm {
  return { id: label, label, url: urls[kind](label) };
}

/**
 * Explicit allowlist projection, not `{ ...entry.data }`. Future private
 * frontmatter fields stay private unless this function deliberately exposes them.
 * @param post Validated private record selected by the publication policy.
 * @returns Serializable public metadata, with a safe protected description.
 */
export function toPostSummary(post: PostSource): PostSummary {
  return {
    id: post.id,
    url: urls.post(post.id),
    title: post.data.title,
    description: getPostDescription(post),
    publishedAt: post.data.pubDate.toISOString(),
    tags: (post.data.tags ?? []).map((label) => term(label, 'tag')),
    category: term(post.data.category || UNCATEGORIZED, 'category'),
    ...(post.data.cover ? { cover: post.data.cover } : {}),
    protected: isProtectedPost(post),
  };
}

/** Count labels once per article and keep the existing frequency-first order. */
export function collectTaxonomy(posts: readonly PostSummary[], kind: 'tags' | 'categories'): TaxonomyCount[] {
  const counts = new Map<string, TaxonomyCount>();
  for (const post of posts) {
    const terms = kind === 'tags' ? post.tags : [post.category];
    for (const entry of new Map(terms.map((item) => [item.id, item])).values()) {
      const previous = counts.get(entry.id);
      counts.set(entry.id, { ...entry, count: (previous?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()].toSorted((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
}

/** UTC calendar groups are deterministic across Windows and Linux build hosts. */
export function collectArchives(posts: readonly PostSummary[]): ArchivePeriod[] {
  const groups = new Map<string, ArchivePeriod>();
  for (const post of posts) {
    const date = new Date(post.publishedAt);
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth() + 1;
    const id = `${year}-${String(month).padStart(2, '0')}`;
    const group = groups.get(id) ?? { id, label: `${year}年${month}月`, year, month, count: 0, posts: [] };
    group.posts.push(post);
    group.count += 1;
    groups.set(id, group);
  }
  return [...groups.values()].toSorted((left, right) => right.id.localeCompare(left.id));
}
