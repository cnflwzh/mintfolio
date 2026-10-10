import type { ThemeContext } from '@mintfolio/theme-api';
import type { ArchivePageData, HomePageData, NotFoundPageData, StaticPageData } from '@mintfolio/theme-api/astro';
import { pageSeo } from './seo';

/** Page semantics are independent of the chosen renderer and visual structure. */
export async function homePage(theme: ThemeContext): Promise<HomePageData> {
  const { title, description } = theme.site;
  const url = theme.urls.home();
  return { kind: 'home', title, description, url, seo: pageSeo(theme.site, title, description, url), posts: (await theme.content.posts()).items };
}

/** Static list pages expose one page of articles; global search loads a public index. */
export async function archivePage(theme:ThemeContext, options:{number?:number;kind?:'tag'|'category'|'series';label?:string}={}):Promise<ArchivePageData> {
  const {kind,label}=options;
  const current=options.number??1;
  const filters={q:'',tag:kind==='tag'?label??'':'',category:kind==='category'?label??'':''};
  let posts=(await theme.content.posts(filters)).items;
  if(kind==='series') posts=posts.filter(post=>post.series?.id===label).toSorted((a,b)=>(a.series?.order??Infinity)-(b.series?.order??Infinity)||Date.parse(a.publishedAt)-Date.parse(b.publishedAt));
  const pageSize=theme.site.blog?.pageSize??10,totalPages=Math.max(1,Math.ceil(posts.length/pageSize));
  if(!Number.isSafeInteger(current)||current<1||current>totalPages) throw new Error('Unknown archive page');
  const base=kind==='series'?theme.urls.series(label!):theme.urls.archivePage(1,filters);
  const link=(number:number)=>number===1?base:base+'/page/'+number;
  const title=label?(kind==='tag'?'标签：':kind==='category'?'分类：':'系列：')+label:'全部文章';
  const description=label?'浏览 '+label+' 的全部文章。':'记录开发、设计与生活中的探索。';
  const url=link(current);
  return {kind:'archive',title,description,url,seo:pageSeo(theme.site,current>1?title+' · 第 '+current+' 页':title,description,url),
    posts:posts.slice((current-1)*pageSize,current*pageSize),filters,
    ...(kind&&label?{taxonomy:{kind,label}}:{}),
    pagination:{current,totalPages,totalItems:posts.length,pageSize,previous:current>1?link(current-1):null,next:current<totalPages?link(current+1):null,pages:Array.from({length:totalPages},(_,i)=>({number:i+1,url:link(i+1)}))},
  };
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
  const url = theme.urls.page('404.html');
  return { kind: 'notFound', title, description, url, seo: pageSeo(theme.site, title, description, url, undefined, true) };
}
