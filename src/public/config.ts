import type { ContactInfo, Project, PublicProfile, SkillCategory, SocialLink } from '@mintfolio/theme-api';

/** Host-owned content. Theme-specific display settings belong in theme.config.mjs. */
export interface SiteConfig {
  site: { title: string; url: string; description: string; language: string };
  profile: PublicProfile;
  social: SocialLink[];
  skills: SkillCategory[];
  projects: Project[];
  contact: ContactInfo;
  icp?: string;
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
}

/**
 * Complete optional author fields without exposing any theme-specific defaults.
 * @param input Public site content, including the deployment URL.
 * @returns Fully populated content suitable for Core's explicit public projection.
 */
export function defineSiteConfig(input: SiteConfigInput): SiteConfig {
  const url = new URL(input.site.url);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('[mintfolio:config] site.url must use HTTP or HTTPS');
  if (!input.site.title.trim()) throw new Error('[mintfolio:config] site.title must not be empty');
  return {
    site: { description: '', language: 'zh-CN', ...input.site },
    profile: { name: input.site.title, avatar: '', bio: '', location: '', signature: '', ...input.profile },
    social: input.social ?? [],
    skills: input.skills ?? [],
    projects: input.projects ?? [],
    contact: { email: '', social: [], ...input.contact },
    ...(input.icp ? { icp: input.icp } : {}),
  };
}
