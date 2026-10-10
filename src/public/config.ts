// Sites have no tsconfig.json; this gives site.config.ts the types for image imports.
/// <reference types="astro/client" preserve="true" />
import type { ContactInfo, Project, PublicProfile, SkillCategory, SocialLink, PublicAuthor, NavigationLink, AnalyticsConfig } from '@mintfolio/theme-api';

/** Host-owned content. Theme-specific display settings belong in theme.config.mjs. */
export interface SiteConfig {
  site: { title: string; url: string; description: string; language: string };
  profile: PublicProfile;
  social: SocialLink[];
  skills: SkillCategory[];
  projects: Project[];
  contact: ContactInfo;
  icp?: string;
  blog?: { pageSize?: number; timezone?: string };
  seo?: { defaultSocialImage?: string; twitterSite?: string };
  feed?: { limit?: number; content?: 'summary' | 'full' };
  authors?: PublicAuthor[];
  navigation?: NavigationLink[];
  /** Core-owned analytics; only production builds may inject tracking. */
  analytics?: AnalyticsConfig;
}

/** Only a title and absolute HTTP(S) site URL are required to create a blog. */
export interface SiteConfigInput {
  site: Pick<SiteConfig['site'], 'title' | 'url'> & Partial<Omit<SiteConfig['site'], 'title' | 'url'>>;
  profile?: Partial<PublicProfile>;
  social?: SocialLink[];
  skills?: SkillCategory[];
  projects?: Project[];
  contact?: Partial<ContactInfo>;
  icp?: string;
  blog?: { pageSize?: number; timezone?: string };
  seo?: { defaultSocialImage?: string; twitterSite?: string };
  feed?: { limit?: number; content?: 'summary' | 'full' };
  authors?: PublicAuthor[];
  navigation?: NavigationLink[];
  /** Core-owned analytics; only production builds may inject tracking. */
  analytics?: AnalyticsConfig;
}

/**
 * Complete optional author fields without exposing any theme-specific defaults.
 * @param input Public site content, including the deployment URL.
 * @returns Fully populated content suitable for Core's explicit public projection.
 * @throws On invalid site URLs, content options or Google Analytics settings.
 */
export function defineSiteConfig(input: SiteConfigInput): SiteConfig {
  const url = new URL(input.site.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('[mintfolio:config] site.url must use HTTP or HTTPS');
  if (!input.site.title.trim()) throw new Error('[mintfolio:config] site.title must not be empty');
  const google = input.analytics?.google;
  let analytics: AnalyticsConfig | undefined;
  if (google !== undefined) {
    if (!google || typeof google.measurementId !== 'string'
      || !/^G-[A-Z0-9]+$/.test(google.measurementId.trim())) {
      throw new Error('[mintfolio:config] analytics.google.measurementId must be a GA4 ID such as G-XXXXXXXXXX');
    }
    if (google.enabled !== undefined && typeof google.enabled !== 'boolean') {
      throw new Error('[mintfolio:config] analytics.google.enabled must be a boolean');
    }
    analytics = { google: { measurementId: google.measurementId.trim(), enabled: google.enabled ?? true } };
  }
  const pageSize = input.blog?.pageSize ?? 10;
  const limit = input.feed?.limit ?? 50;
  const timezone = input.blog?.timezone ?? 'UTC';
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) throw new Error('[mintfolio:config] blog.pageSize must be 1-100');
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 1000) throw new Error('[mintfolio:config] feed.limit must be 1-1000');
  new Intl.DateTimeFormat('en', { timeZone: timezone });
  if (input.feed?.content && !['summary','full'].includes(input.feed.content)) throw new Error('[mintfolio:config] feed.content must be summary or full');
  const ids = new Set<string>();
  for (const author of input.authors ?? []) {
    if (!author.id?.trim() || !author.name?.trim() || ids.has(author.id)) throw new Error('[mintfolio:config] authors need unique ids and non-empty names');
    ids.add(author.id);
    if (author.url && !/^https?:\/\//i.test(author.url)) throw new Error('[mintfolio:config] author.url must use HTTP(S)');
  }
  for (const link of input.navigation ?? []) {
    if (!link.id?.trim() || !link.label?.trim() || !/^(?:\/(?!\/)|https?:\/\/)/i.test(link.url)) throw new Error('[mintfolio:config] navigation needs id, label and a safe URL');
  }
  return {
    ...(analytics ? { analytics } : {}),
    blog: { pageSize, timezone },
    feed: { limit, content: input.feed?.content ?? 'summary' },
    seo: input.seo ?? {}, authors: input.authors ?? [],
    ...(input.navigation ? { navigation: input.navigation } : {}),
    site: { description: '', language: 'zh-CN', ...input.site },
    profile: { name: input.site.title, avatar: '', bio: '', location: '', signature: '', ...input.profile },
    social: input.social ?? [],
    skills: input.skills ?? [],
    projects: input.projects ?? [],
    contact: { email: '', social: [], ...input.contact },
    ...(input.icp ? { icp: input.icp } : {}),
  };
}
