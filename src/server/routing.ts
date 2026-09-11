import type { PostFilters, ThemeUrls } from '@mintfolio/theme-api';

/**
 * The site's route policy lives here. Themes receive this service and resolved
 * links; they never need to know how nested article ids or filters are encoded.
 * Root hosting and the existing /blog URLs are intentionally preserved.
 */
export const urls: ThemeUrls = {
  home: (): string => '/',
  archive: (filters: Partial<PostFilters> = {}): string => {
    const params = new URLSearchParams();
    for (const key of ['q', 'tag', 'category'] as const) {
      const value = filters[key]?.trim();
      if (value) params.set(key, value);
    }
    return params.size ? `/blog?${params}` : '/blog';
  },
  page: (id: string): string => {
    if (id !== 'about') throw new Error(`Unknown Core page: ${id}`);
    return '/about';
  },
  post: (id: string): string => `/blog/${id.split('/').map(encodeURIComponent).join('/')}`,
  tag: (label: string): string => urls.archive({ tag: label }),
  category: (label: string): string => urls.archive({ category: label }),
  rss: (): string => '/rss.xml',
  sitemap: (): string => '/sitemap.xml',
};

/** Resolve a Core-relative URL against the configured public origin. */
export function absoluteUrl(relative: string, siteUrl: string): string {
  return new URL(relative, siteUrl).href;
}
