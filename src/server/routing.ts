import type { PostFilters, ThemeUrls } from '@mintfolio/theme-api';
import { normalizeBase, prefixRoute, withBase, withoutBase } from '../shared/deployment.mjs';

export const deploymentBase = import.meta.env?.BASE_URL ?? '/';
/** Root-relative author assets are resolved once at the Core boundary. */
export const resolveAsset = (value:string):string => withBase(value, deploymentBase);
/** Astro getStaticPaths params never include config.base. */
export const routePath = (value:string):string => withoutBase(value, deploymentBase);

/** Encode each logical path segment once. Canonical ids cannot contain traversal. */
export function encodePath(id: string): string { return id.normalize('NFC').split('/').map(encodeURIComponent).join('/'); }

/** Escape path delimiters before URL encoding so static hosts never decode a slash inside a label. */
export function taxonomySegment(label:string):string {
  const escape=(character:string)=>'~'+character.codePointAt(0)!.toString(16).toUpperCase();
  let safe=label.normalize('NFC').replace(/[~\/\\?#%<>:"|*\u0000-\u001F\u007F]/gu,escape)
    .replace(/[. ]+$/u,suffix=>[...suffix].map(escape).join(''));
  if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe=escape(safe[0]!)+safe.slice(1);
  return encodeURIComponent(safe);
}

/** Core owns stable route policy; archive query URLs remain backwards compatible. */
export function createUrls(deployment = '/'): ThemeUrls {
 const route = (path:string) => prefixRoute(path, deployment);
 const urls: ThemeUrls = {
  home: () => route('/'),
  archive: (filters: Partial<PostFilters> = {}) => {
    const params = new URLSearchParams();
    for (const key of ['q','tag','category'] as const) {
      const value=filters[key]?.trim(); if(value) params.set(key,value);
    }
    return route(params.size ? '/blog?'+params : '/blog');
  },
  archivePage: (page: number, filters: Partial<PostFilters> = {}) => {
    if(!Number.isSafeInteger(page)||page<1) throw new Error('Archive page must be a positive integer');
    const base=filters.tag ? urls.tag(filters.tag) : filters.category ? urls.category(filters.category) : route('/blog');
    const params=new URLSearchParams();
    if(filters.q?.trim()) params.set('q',filters.q.trim());
    if(filters.tag && filters.category?.trim()) params.set('category',filters.category.trim());
    const url=page===1?base:base+'/page/'+page;
    return params.size?url+'?'+params:url;
  },
  page: (id: string) => route('/'+encodePath(id)),
  post: (id: string) => route('/blog/'+encodePath(id)),
  tag: (label: string) => route('/tags/'+taxonomySegment(label)),
  category: (label: string) => route('/categories/'+taxonomySegment(label)),
  series: (label: string) => route('/series/'+taxonomySegment(label)),
  rss: () => route('/rss.xml'), sitemap: () => route('/sitemap.xml'),
  jsonFeed: () => route('/feed.json'), atom: () => route('/atom.xml'),
 };
 return urls;
}
export const urls = createUrls(deploymentBase);

/** Resolve a Core-relative URL against the configured public origin. */
export function absoluteUrl(relative: string, siteUrl: string): string { const site = new URL(siteUrl); return new URL(withBase(relative, site.pathname), site.origin + normalizeBase(site.pathname)).href; }
