import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';

/**
 * Blog schema and Markdown loader owned by Core. Call from src/content.config.ts.
 * @param {{base?:string}} [options] Markdown directory relative to the site root.
 */
export function createBlogCollection({ base = './content/blog' } = {}) {
  return defineCollection({
    loader: glob({ pattern: '**/*.md', base }),
    schema: z.object({
      title: z.string(), pubDate: z.coerce.date(), description: z.string(),
      category: z.string().optional(), tags: z.array(z.string()).optional(),
      cover: z.string().optional(), draft: z.boolean().default(false),
      password: z.string().refine((value) => value.trim().length > 0, '文章密码不能为空').optional(),
    }),
  });
}
