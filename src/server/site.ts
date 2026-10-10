import type { PublicImage, PublicSite } from '@mintfolio/theme-api';
import type { ImageMetadata } from 'astro';
import input from 'virtual:mintfolio/site-config';
import { deploymentBase, resolveAsset } from './routing';
import { deploymentUrl } from '../shared/deployment.mjs';
import { defineSiteConfig } from '../../dist/public/config';

export const config = defineSiteConfig(input);

/** Strip build-only image details while preserving Astro's optimization inputs. */
export function publicImage(source: string | ImageMetadata): string | PublicImage {
  if (typeof source === 'string') return resolveAsset(source);
  return { src: source.src, width: source.width, height: source.height, format: source.format };
}

/** Shared author/site content, independent of Verdant's sidebar and other UI. */
export function getPublicSite(): PublicSite {
  return {
    title: config.site.title,
    description: config.site.description,
    url: deploymentUrl(config.site.url, deploymentBase),
    language: config.site.language,
    profile: { ...config.profile, avatar: publicImage(config.profile.avatar) },
    social: config.social.map((link) => ({ ...link, url: resolveAsset(link.url) })),
    skills: config.skills.map((group) => ({ category: group.category, items: group.items.map((item) => ({ ...item })) })),
    projects: config.projects.map((project) => ({ ...project, tags: [...project.tags], ...(project.image ? {image: resolveAsset(project.image)} : {}), ...(project.link ? {link: resolveAsset(project.link)} : {}) })),
    contact: { ...config.contact, social: [...config.contact.social] },
    icp: config.icp,
    ...(config.analytics?.google ? { analytics: { google: { ...config.analytics.google } } } : {}),
    blog: { pageSize: config.blog?.pageSize ?? 10, timezone: config.blog?.timezone ?? 'UTC' },
    feed: { limit: config.feed?.limit ?? 50, content: config.feed?.content ?? 'summary' },
    seo: { ...config.seo }, authors: config.authors?.map(author => ({ ...author, ...(author.avatar ? {avatar: typeof author.avatar === 'string' ? resolveAsset(author.avatar) : author.avatar} : {}) })),
  };
}
