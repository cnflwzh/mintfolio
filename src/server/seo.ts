import type { PostSummary, PublicSite } from '@mintfolio/theme-api';
import type { SeoData } from '@mintfolio/theme-api/astro';
import { absoluteUrl } from './routing';

/** Core decides indexability; themes can render this data without copying policy. */
export function pageSeo(site: PublicSite, title: string, description: string, url: string, post?: PostSummary, notFound = false): SeoData {
  const image = typeof post?.cover === 'string' ? post.cover : post?.cover?.src;
  return {
    title, description, language: site.language,
    canonical: absoluteUrl(url, site.url),
    robots: post?.protected || notFound ? 'noindex,nofollow' : 'index,follow',
    ...(image ? { image: absoluteUrl(image, site.url) } : {}),
  };
}
