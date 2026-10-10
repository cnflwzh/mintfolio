import type { PostSummary, PublicSite } from '@mintfolio/theme-api';
import type { SeoData } from '@mintfolio/theme-api/astro';
import { absoluteUrl } from './routing.ts';

/** Return an absolute HTTP(S) social image, omitting unsupported image schemes. */
function socialImageUrl(image: string | undefined, siteUrl: string): string | undefined {
  if (!image) return undefined;
  const url = new URL(absoluteUrl(image, siteUrl));
  return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : undefined;
}

/**
 * Core decides metadata and indexability; a theme only renders the result.
 * @param post Safe article metadata, never a raw entry or its source body.
 * @param overrides Optional independent-page SEO; article SEO takes precedence.
 * @returns Serializable head data. Protected/preview/noindex pages have no JSON-LD.
 */
export function pageSeo(
  site: PublicSite, title: string, description: string, url: string,
  post?: PostSummary, notFound = false, overrides?: PostSummary['seo'],
): SeoData {
  const metadata = post?.seo ?? overrides;
  const privatePage = !!(post?.protected || post?.preview);
  const noindex = privatePage || notFound || !!metadata?.noindex;
  const cover = typeof post?.cover === 'string' ? post.cover : post?.cover?.src;
  const image = socialImageUrl(
    (privatePage ? undefined : metadata?.image) ?? cover ?? site.seo?.defaultSocialImage, site.url,
  );
  const canonical = absoluteUrl((privatePage ? undefined : metadata?.canonical) ?? url, site.url);
  const seoTitle = (privatePage ? undefined : metadata?.title) ?? title;
  const seoDescription = post?.protected ? post.description : metadata?.description ?? description;
  const authors = post?.authors?.length
    ? post.authors.map((author) => ({ '@type': 'Person', name: author.name, ...(author.url ? { url: absoluteUrl(author.url, site.url) } : {}) }))
    : [{ '@type': 'Person', name: site.profile.name || site.title, url: absoluteUrl('/about', site.url) }];
  return {
    title: seoTitle, description: seoDescription, language: site.language, canonical,
    robots: noindex ? 'noindex,nofollow' : 'index,follow',
    type: post ? 'article' : 'website',
    siteName: site.title,
    twitterCard: image ? 'summary_large_image' : 'summary',
    ...(site.seo?.twitterSite ? { twitterSite: site.seo.twitterSite } : {}),
    ...(image ? { image, imageAlt: (privatePage ? undefined : metadata?.imageAlt) ?? post?.title ?? site.title } : {}),
    ...(!privatePage && post ? {
      publishedAt: post.publishedAt,
      modifiedAt: post.updatedAt ?? post.publishedAt,
      authors: authors.map((author) => author.name),
    } : {}),
    feeds: {
      rss: absoluteUrl('/rss.xml', site.url),
      json: absoluteUrl('/feed.json', site.url),
      atom: absoluteUrl('/atom.xml', site.url),
    },
    ...(!noindex && post ? {
      jsonLd: {
        '@context': 'https://schema.org',
        '@type': 'BlogPosting',
        '@id': canonical,
        headline: seoTitle,
        description: seoDescription,
        url: canonical,
        mainEntityOfPage: { '@type': 'WebPage', '@id': canonical },
        datePublished: post.publishedAt,
        dateModified: post.updatedAt ?? post.publishedAt,
        inLanguage: site.language,
        author: authors,
        ...(image ? { image: [image] } : {}),
        ...(post.tags.length ? { keywords: post.tags.map((tag) => tag.label).join(', ') } : {}),
        articleSection: post.category.label,
        ...(post.wordCount !== undefined ? { wordCount: post.wordCount } : {}),
      },
    } : {}),
  };
}
