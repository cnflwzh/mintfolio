import { getCollection, type CollectionEntry } from 'astro:content';
import { selectPublishedPosts } from './postModel';

export {
  UNCATEGORIZED, PROTECTED_POST_DESCRIPTION, isProtectedPost, getPostDescription,
  toPostSummary, collectTaxonomy, collectArchives, selectPublishedPosts,
} from './postModel';

/** Private collection entry. Never pass this type or its data object to a theme. */
export type InternalPost = CollectionEntry<'blog'>;

/** Reuse Astro's collection, then apply the shared publication and ordering policy. */
export async function getPublishedPosts(): Promise<InternalPost[]> {
  return selectPublishedPosts(await getCollection('blog'));
}
