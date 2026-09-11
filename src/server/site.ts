import type { PublicImage, PublicSite } from '@mintfolio/theme-api';
import type { ImageMetadata } from 'astro';
import input from 'virtual:mintfolio/site-config';
import { defineSiteConfig } from '../../dist/public/config';

const config = defineSiteConfig(input);

/** Strip build-only image details while preserving Astro's optimization inputs. */
export function publicImage(source: string | ImageMetadata): string | PublicImage {
  if (typeof source === 'string') return source;
  return { src: source.src, width: source.width, height: source.height, format: source.format };
}

/** Shared author/site content, independent of Default's sidebar and other UI. */
export function getPublicSite(): PublicSite {
  return {
    title: config.site.title,
    description: config.site.description,
    url: config.site.url,
    language: config.site.language,
    profile: { ...config.profile, avatar: publicImage(config.profile.avatar) },
    social: config.social.map((link) => ({ ...link })),
    skills: config.skills.map((group) => ({ category: group.category, items: group.items.map((item) => ({ ...item })) })),
    projects: config.projects.map((project) => ({ ...project, tags: [...project.tags] })),
    contact: { ...config.contact, social: [...config.contact.social] },
    icp: config.icp,
  };
}
