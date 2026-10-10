import { getCollection, type CollectionEntry } from 'astro:content';
import type { PageSummary } from '@mintfolio/theme-api';
import { previewDrafts } from 'virtual:mintfolio/runtime';
import { urls } from './routing';
export type InternalPage = CollectionEntry<'pages'>;

/** Optional pages collection. Missing collections are treated as an empty set by Astro. */
export async function getPageEntries(preview = false): Promise<InternalPage[]> {
  return (await getCollection('pages')).filter(page => !page.data.draft || (preview && import.meta.env.DEV && previewDrafts));
}
/** Build a safe page summary, with no raw content or arbitrary frontmatter. */
export function summarizePage(page: InternalPage):PageSummary {
  return {id:page.id,url:urls.page(page.data.slug||page.id),title:page.data.title,description:page.data.description,
    ...(page.data.updatedAt?{updatedAt:page.data.updatedAt.toISOString()}:{}),
    ...(page.data.seo?{seo:{...page.data.seo}}:{}),
    ...(page.data.draft?{preview:true}:{}),
  };
}
/** Public sitemap pages never include local drafts. */
export async function getStaticPages():Promise<PageSummary[]> { return (await getPageEntries()).map(summarizePage); }
