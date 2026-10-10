import type { Loader } from 'astro/loaders';
import type { z } from 'astro/zod';
import type { ContentSeo } from '@mintfolio/theme-api';
/** Validated frontmatter. Password and raw content never become theme props. */
export interface PageFrontmatter {
  title:string; description:string; slug?:string; aliases:string[]; draft:boolean; updatedAt?:Date; seo?:ContentSeo;
}
export interface BlogFrontmatter extends PageFrontmatter {
  pubDate:Date; category?:string; tags?:string[]; cover?:string; password?:string;
  pinned:boolean; series?:string; seriesOrder?:number; authors?:string[];
}
/**
 * base is relative to the Astro project root (the site's _mintfolio folder).
 * Defaults read every article under the site root, skipping `_`/`.` paths and repository documents.
 */
export function createBlogCollection(options?:{base?:string;pattern?:string|string[]}):{loader:Loader;schema:z.ZodType<BlogFrontmatter>};
/** Independent static content pages, by default from _mintfolio/pages. */
export function createPageCollection(options?:{base?:string}):{loader:Loader;schema:z.ZodType<PageFrontmatter>};
