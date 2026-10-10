import type { PostSummary, PublicImage, TaxonomyTerm, TaxonomyCount, ArchivePeriod, PublicAuthor, ContentSeo } from '@mintfolio/theme-api';
import { urls } from './routing.ts';
import { publicationState } from '../shared/publication.mjs';

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
    slug?: string; aliases?: string[]; updatedAt?: Date; pinned?: boolean;
    series?: string; seriesOrder?: number; authors?: string[]; seo?: ContentSeo;
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
 * @param posts Validated content records; source data is never changed.
 * @param options Optional cutoff captured once per selection and explicit local preview flag.
 * @returns Pinned-first, newest-first records eligible at the cutoff; preview includes all states.
 */
export function selectPublishedPosts<T extends PostSource>(posts: readonly T[], options: { now?: Date; preview?: boolean } = {}): T[] {
  const now = options.now ?? new Date();
  return posts.filter(post => options.preview || publicationState(post.data, now) === 'publishable')
    .toSorted((left, right) => Number(Boolean(right.data.pinned)) - Number(Boolean(left.data.pinned)) || right.data.pubDate.valueOf() - left.data.pubDate.valueOf());
}

/** Convert one taxonomy label into a link using the host's route policy. */
function term(label: string, kind: 'tag' | 'category'): TaxonomyTerm {
  return { id: label, label, url: urls[kind](label) };
}

/**
 * Explicit allowlist projection, not `{ ...entry.data }`. Future private
 * frontmatter fields stay private unless this function deliberately exposes them.
 * @param post Validated private record selected by the publication policy.
 * @param options Public author registry, explicit local preview flag and optional selection cutoff.
 * @returns Serializable public metadata, with a safe protected description.
 */
export function toPostSummary(post: PostSource, options: { authors?: PublicAuthor[]; preview?: boolean; now?: Date } = {}): PostSummary {
  return {
    id: post.id,
    url: urls.post(post.data.slug || post.id),
    title: post.data.title,
    description: getPostDescription(post),
    publishedAt: post.data.pubDate.toISOString(),
    tags: (post.data.tags ?? []).map((label) => term(label, 'tag')),
    category: term(post.data.category || UNCATEGORIZED, 'category'),
    ...(post.data.cover ? { cover: post.data.cover } : {}),
    protected: isProtectedPost(post),
    ...(post.data.updatedAt ? { updatedAt: post.data.updatedAt.toISOString() } : {}),
    ...(post.data.pinned ? { pinned: true } : {}),
    ...(post.data.series ? { series: { id: post.data.series, label: post.data.series, url: urls.series(post.data.series), ...(post.data.seriesOrder !== undefined ? { order: post.data.seriesOrder } : {}) } } : {}),
    ...(post.data.authors?.length ? { authors: post.data.authors.map(id => {
      const author = options.authors?.find(item => item.id === id);
      if (!author) throw new Error('[mintfolio:content] Unknown author id: '+id+' in '+post.id);
      return { ...author };
    }) } : {}),
    // Protected SEO must not restore a private description through an override.
    ...(post.data.seo ? { seo: isProtectedPost(post) ? { noindex: post.data.seo.noindex, canonical: post.data.seo.canonical } : { ...post.data.seo } } : {}),
    ...(options.preview && publicationState(post.data, options.now ?? new Date()) !== 'publishable' ? { preview: true } : {}),
  };
}

/** Count labels once per article and keep the existing frequency-first order. */
export function collectTaxonomy(posts: readonly PostSummary[], kind: 'tags' | 'categories' | 'series'): TaxonomyCount[] {
  const counts = new Map<string, TaxonomyCount>();
  for (const post of posts) {
    const terms = kind === 'tags' ? post.tags : kind === 'series' ? (post.series ? [post.series] : []) : [post.category];
    for (const entry of new Map(terms.map((item) => [item.id, item])).values()) {
      const previous = counts.get(entry.id);
      counts.set(entry.id, { ...entry, count: (previous?.count ?? 0) + 1 });
    }
  }
  return [...counts.values()].toSorted((left, right) => right.count - left.count || left.label.localeCompare(right.label, 'zh-CN'));
}

/** UTC calendar groups are deterministic across Windows and Linux build hosts. */
export function collectArchives(posts: readonly PostSummary[], timezone = 'UTC'): ArchivePeriod[] {
  const groups = new Map<string, ArchivePeriod>();
  for (const post of posts) {
    const date = new Date(post.publishedAt);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: 'numeric' }).formatToParts(date);
    const year = Number(parts.find(part => part.type === 'year')!.value);
    const month = Number(parts.find(part => part.type === 'month')!.value);
    const id = `${year}-${String(month).padStart(2, '0')}`;
    const group = groups.get(id) ?? { id, label: `${year}年${month}月`, year, month, count: 0, posts: [] };
    group.posts.push(post);
    group.count += 1;
    groups.set(id, group);
  }
  return [...groups.values()].toSorted((left, right) => right.id.localeCompare(left.id));
}

/** Related public summaries rank by same series, shared tags, then category/date. */
export function relatedPosts(posts: readonly PostSummary[], id: string, limit = 3): PostSummary[] {
  if(!Number.isSafeInteger(limit)||limit<0) throw new Error('related limit must be non-negative');
  const current=posts.find(post=>post.id===id); if(!current) return [];
  const score=(post:PostSummary)=> (current.series && current.series.id===post.series?.id ? 10 : 0)
    + post.tags.filter(tag=>current.tags.some(item=>item.id===tag.id)).length*3
    + (post.category.id===current.category.id ? 1 : 0);
  return posts.filter(post=>post.id!==id && !post.preview && score(post)>0)
    .toSorted((a,b)=>score(b)-score(a)||Date.parse(b.publishedAt)-Date.parse(a.publishedAt)).slice(0,limit);
}
