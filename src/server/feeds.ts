import type { PostSummary, PublicSite } from '@mintfolio/theme-api';
import sanitizeHtml from 'sanitize-html';
import { absoluteUrl } from './routing.ts';
import { xmlEscape } from './xml.ts';

/** Safe published metadata with optional rendered public body, owned by Core. */
export interface FeedPost extends PostSummary {
  contentHtml?: string;
}

/** Per-feed overrides. Tag/category labels are exact; filters combine with AND. */
export interface FeedOptions {
  limit?: number;
  content?: 'summary' | 'full';
  tag?: string;
  category?: string;
  title?: string;
  description?: string;
  /** Site-relative address of this particular feed, including taxonomy feeds. */
  path?: string;
}

type FeedSite = Pick<PublicSite, 'title' | 'description' | 'url' | 'language' | 'profile' | 'feed'>;

/**
 * Filter before applying the feed limit and use chronology, ignoring list pins.
 * @param posts Public projections selected by Core's publication policy.
 * @returns A new array with no protected, preview or explicitly noindex posts.
 */
export function selectFeedPosts<T extends FeedPost>(site: FeedSite, posts: readonly T[], options: FeedOptions = {}): T[] {
  const limit = options.limit ?? site.feed?.limit ?? 50;
  if (!Number.isSafeInteger(limit) || limit < 1) throw new Error('Feed limit must be a positive integer.');
  return posts.filter((post) => !post.protected && !post.preview && !post.seo?.noindex
    && (!options.tag || post.tags.some((tag) => tag.label === options.tag))
    && (!options.category || post.category.label === options.category))
    .toSorted((left, right) => Date.parse(right.publishedAt) - Date.parse(left.publishedAt))
    .slice(0, limit);
}

/**
 * Prepare website HTML for standalone readers. Relative links become absolute;
 * scripts, interactive embeds and event attributes are removed by an HTML parser.
 * @param html Public HTML already rendered by Astro, including resolved images.
 * @param articleUrl Canonical absolute article URL, used to resolve local links.
 */
export function prepareFeedHtml(html: string, articleUrl: string): string {
  return sanitizeHtml(html, {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, 'img', 'picture', 'figure', 'figcaption', 'video', 'audio', 'source'],
    allowedAttributes: {
      a: ['href', 'name', 'title'],
      img: ['src', 'alt', 'title', 'width', 'height'],
      source: ['src', 'type'],
      video: ['src', 'poster', 'controls'],
      audio: ['src', 'controls'],
      th: ['colspan', 'rowspan', 'scope'],
      td: ['colspan', 'rowspan'],
      '*': ['id', 'lang', 'dir'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesAppliedToAttributes: ['href', 'src', 'poster'],
    allowedSchemesByTag: { img: ['http', 'https'], source: ['http', 'https'], video: ['http', 'https'], audio: ['http', 'https'] },
    transformTags: {
      '*': (tagName, attributes) => {
        const attribs = { ...attributes };
        for (const name of ['href', 'src', 'poster']) {
          const value = attribs[name];
          if (!value) continue;
          try { attribs[name] = new URL(value, articleUrl).href; }
          catch { delete attribs[name]; }
        }
        return { tagName, attribs };
      },
    },
  });
}

function feedAuthors(site: FeedSite, post?: FeedPost): Array<{ name: string; url?: string; avatar?: string }> {
  const profileAvatar = typeof site.profile.avatar === 'string' ? site.profile.avatar : site.profile.avatar.src;
  const sources: Array<{ name: string; url?: string; avatar?: string }> = post?.authors?.length
    ? post.authors : [{ name: site.profile.name || site.title, url: '/about', avatar: profileAvatar }];
  return sources.map((author) => {
    const avatar = author.avatar;
    return {
      name: author.name,
      ...(author.url ? { url: absoluteUrl(author.url, site.url) } : {}),
      ...(avatar ? { avatar: absoluteUrl(avatar, site.url) } : {}),
    };
  });
}

function fullContent(site: FeedSite, post: FeedPost, options: FeedOptions): string | undefined {
  if ((options.content ?? site.feed?.content ?? 'summary') !== 'full') return undefined;
  // A requested full feed must not silently degrade into an excerpt.
  if (post.contentHtml === undefined) throw new Error(`Full feed is missing rendered public HTML for article "${post.id}".`);
  return prepareFeedHtml(post.contentHtml, absoluteUrl(post.url, site.url));
}

function lastUpdated(posts: readonly FeedPost[]): string | undefined {
  return posts.length ? new Date(Math.max(...posts.map((post) => Date.parse(post.updatedAt ?? post.publishedAt)))).toISOString() : undefined;
}

/** Generate RSS 2.0 from public metadata; source collection access stays outside. */
export function generateRss(site: FeedSite, posts: readonly FeedPost[], options: FeedOptions = {}): string {
  const selected = selectFeedPosts(site, posts, options);
  const items = selected.map((post) => {
    const link = xmlEscape(absoluteUrl(post.url, site.url));
    const html = fullContent(site, post, options);
    const categories = [...new Set([post.category.label, ...post.tags.map((tag) => tag.label)])]
      .map((label) => `<category>${xmlEscape(label)}</category>`).join('');
    const creators = feedAuthors(site, post).map((author) => `<dc:creator>${xmlEscape(author.name)}</dc:creator>`).join('');
    return `<item><title>${xmlEscape(post.title)}</title><link>${link}</link><guid isPermaLink="true">${link}</guid><description>${xmlEscape(post.description)}</description><pubDate>${new Date(post.publishedAt).toUTCString()}</pubDate>${creators}${categories}${html !== undefined ? `<content:encoded>${xmlEscape(html)}</content:encoded>` : ''}</item>`;
  }).join('');
  const modified = lastUpdated(selected);
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:dc="http://purl.org/dc/elements/1.1/"><channel><title>${xmlEscape(options.title ?? site.title)}</title><link>${xmlEscape(site.url)}</link><description>${xmlEscape(options.description ?? site.description)}</description><language>${xmlEscape(site.language)}</language><atom:link href="${xmlEscape(absoluteUrl(options.path ?? '/rss.xml', site.url))}" rel="self" type="application/rss+xml"/>${modified ? `<lastBuildDate>${new Date(modified).toUTCString()}</lastBuildDate>` : ''}${items}</channel></rss>`;
}

/** Generate JSON Feed 1.1, with content_text for summaries or sanitized content_html. */
export function generateJsonFeed(site: FeedSite, posts: readonly FeedPost[], options: FeedOptions = {}): string {
  const items = selectFeedPosts(site, posts, options).map((post) => {
    const link = absoluteUrl(post.url, site.url);
    const html = fullContent(site, post, options);
    const image = typeof post.cover === 'string' ? post.cover : post.cover?.src;
    return {
      id: link, url: link, title: post.title, summary: post.description,
      ...(html === undefined ? { content_text: post.description } : { content_html: html }),
      date_published: post.publishedAt,
      ...(post.updatedAt ? { date_modified: post.updatedAt } : {}),
      authors: feedAuthors(site, post),
      tags: [...new Set([post.category.label, ...post.tags.map((tag) => tag.label)])],
      ...(image ? { image: absoluteUrl(image, site.url) } : {}),
      language: site.language,
    };
  });
  return JSON.stringify({
    version: 'https://jsonfeed.org/version/1.1',
    title: options.title ?? site.title,
    home_page_url: site.url,
    feed_url: absoluteUrl(options.path ?? '/feed.json', site.url),
    description: options.description ?? site.description,
    language: site.language,
    authors: feedAuthors(site),
    items,
  });
}

/** Generate Atom 1.0 using actual publication/modification dates and stable URL ids. */
export function generateAtom(site: FeedSite, posts: readonly FeedPost[], options: FeedOptions = {}): string {
  const selected = selectFeedPosts(site, posts, options);
  const self = xmlEscape(absoluteUrl(options.path ?? '/atom.xml', site.url));
  const authors = feedAuthors(site).map((author) => `<author><name>${xmlEscape(author.name)}</name>${author.url ? `<uri>${xmlEscape(author.url)}</uri>` : ''}</author>`).join('');
  const items = selected.map((post) => {
    const link = xmlEscape(absoluteUrl(post.url, site.url));
    const html = fullContent(site, post, options);
    const authors = feedAuthors(site, post).map((author) => `<author><name>${xmlEscape(author.name)}</name>${author.url ? `<uri>${xmlEscape(author.url)}</uri>` : ''}</author>`).join('');
    const categories = [...new Set([post.category.label, ...post.tags.map((tag) => tag.label)])]
      .map((label) => `<category term="${xmlEscape(label)}"/>`).join('');
    return `<entry><id>${link}</id><title type="text">${xmlEscape(post.title)}</title><link href="${link}"/><published>${post.publishedAt}</published><updated>${post.updatedAt ?? post.publishedAt}</updated><summary type="text">${xmlEscape(post.description)}</summary>${html !== undefined ? `<content type="html">${xmlEscape(html)}</content>` : ''}${authors}${categories}</entry>`;
  }).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xml:lang="${xmlEscape(site.language)}"><id>${self}</id><title type="text">${xmlEscape(options.title ?? site.title)}</title><subtitle type="text">${xmlEscape(options.description ?? site.description)}</subtitle><link href="${xmlEscape(site.url)}"/><link href="${self}" rel="self" type="application/atom+xml"/><updated>${lastUpdated(selected) ?? '1970-01-01T00:00:00.000Z'}</updated>${authors}${items}</feed>`;
}
