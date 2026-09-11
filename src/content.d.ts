import type { Loader } from 'astro/loaders';
import type { z } from 'astro/zod';
/** The validated frontmatter shape; raw records remain accessible only to the host. */
export interface BlogFrontmatter {
  title: string;
  pubDate: Date;
  description: string;
  category?: string;
  tags?: string[];
  cover?: string;
  draft: boolean;
  password?: string;
}
/** Markdown location is relative to the consuming site's project root. */
export function createBlogCollection(options?: { base?: string }): { loader: Loader; schema: z.ZodType<BlogFrontmatter> };
