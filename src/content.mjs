import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { slug as githubSlug } from 'github-slugger';
import { ARTICLE_PATTERNS, PAGES_DIR } from './shared/layout.mjs';

// The file identity stays stable when its public permalink changes.
const generateId = ({entry}) => entry.replace(/\.md$/i,'').split('/').map(segment => githubSlug(segment)).join('/').replace(/\/index$/,'');

// Require portable path segments: the same source must build on Windows and Linux.
const portableSegment = value => value && value !== '.' && value !== '..' && !/[<>:"|?*%#\\\u0000-\u001F\u007F]/u.test(value) && !/[. ]$/.test(value) && !/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(value);
const slug = z.string().trim().min(1).transform(value=>value.normalize('NFC')).refine(value => value.split('/').every(portableSegment), 'slug 必须由可移植的非空路径片段组成');
const alias = z.string().transform(value=>value.normalize('NFC')).refine(value => value.startsWith('/') && value !== '/' && value.slice(1).split('/').every(portableSegment), 'alias 必须是可移植的站内根路径，不能含查询参数');
const httpUrl = z.string().url().refine(value => /^https?:\/\//i.test(value), '需要 HTTP(S) URL');
const seo = z.object({title:z.string().optional(),description:z.string().optional(),image:z.string().optional(),imageAlt:z.string().optional(),canonical:httpUrl.optional(),noindex:z.boolean().optional()}).optional();
const shared = { title:z.string().trim().min(1), description:z.string().default(''), slug:slug.optional(), aliases:z.array(alias).default([]), draft:z.boolean().default(false), updatedAt:z.coerce.date().optional(), seo };

/**
 * Build the blog collection. base is relative to the Astro project root (the
 * site's _mintfolio folder), so the default reads articles from the site root.
 */
export function createBlogCollection({base='..',pattern=ARTICLE_PATTERNS}={}) {
  return defineCollection({loader:glob({pattern,base,generateId}),schema:z.object({
    ...shared, pubDate:z.coerce.date(), category:z.string().trim().optional(), tags:z.array(z.string().trim().min(1)).optional(),
    cover:z.string().optional(), password:z.string().refine(value=>value.trim().length>0,'文章密码不能为空').optional(),
    pinned:z.boolean().default(false), series:z.string().trim().min(1).optional(), seriesOrder:z.number().int().nonnegative().optional(),
    authors:z.array(z.string().trim().min(1)).optional(),
  })});
}

/** Independent Markdown pages, by default from _mintfolio/pages. */
export function createPageCollection({base=`./${PAGES_DIR}`}={}) {
  return defineCollection({loader:glob({pattern:'**/*.md',base,generateId}),schema:z.object({...shared,password:z.never().optional()})});
}
