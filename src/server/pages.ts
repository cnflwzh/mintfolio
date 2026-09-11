import type { ThemeContext } from '@mintfolio/theme-api';
import type { ArchivePageData, HomePageData, NotFoundPageData, StaticPageData } from '@mintfolio/theme-api/astro';
import { pageSeo } from './seo';

/** Page semantics are independent of the chosen renderer and visual structure. */
export async function homePage(theme: ThemeContext): Promise<HomePageData> {
  const { title, description } = theme.site;
  const url = theme.urls.home();
  return { kind: 'home', title, description, url, seo: pageSeo(theme.site, title, description, url), posts: (await theme.content.posts()).items };
}

/** Query parameters are applied by the browser because this is a static route. */
export async function archivePage(theme: ThemeContext): Promise<ArchivePageData> {
  const title = '全部文章';
  const description = '记录开发、设计与生活中的探索。';
  const url = theme.urls.archive();
  return { kind: 'archive', title, description, url, seo: pageSeo(theme.site, title, description, url), posts: (await theme.content.posts()).items, filters: { q: '', tag: '', category: '' } };
}

/** The first standalone page is derived from existing author configuration. */
export function aboutPage(theme: ThemeContext): StaticPageData {
  const title = `关于我 - ${theme.site.title}`;
  const description = theme.site.description;
  const url = theme.urls.page('about');
  return { kind: 'page', id: 'about', title, description, url, seo: pageSeo(theme.site, title, description, url), profile: theme.site.profile };
}

/** Static hosting must serve this artifact with an actual 404 status. */
export function notFoundPage(theme: ThemeContext): NotFoundPageData {
  const title = '页面未找到';
  const description = '这个地址没有对应的页面。';
  const url = '/404.html';
  return { kind: 'notFound', title, description, url, seo: pageSeo(theme.site, title, description, url, undefined, true) };
}
