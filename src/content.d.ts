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
/** Markdown location is relative to the consuming site's project root. */
export function createBlogCollection(options?:{base?:string}):{loader:Loader;schema:z.ZodType<BlogFrontmatter>};
/** Register under collections.pages for independent static content pages. */
export function createPageCollection(options?:{base?:string}):{loader:Loader;schema:z.ZodType<PageFrontmatter>};
