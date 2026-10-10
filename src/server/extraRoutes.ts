import type { PostSummary } from '@mintfolio/theme-api';
import { getVisiblePosts, getPublishedPosts, summarizePost, collectTaxonomy } from './posts';
import { getPageEntries, summarizePage, type InternalPage } from './pagesContent';
import { getPublicSite } from './site';
import { urls, routePath, deploymentBase } from './routing';
import { prefixRoute } from '../shared/deployment.mjs';

export type ExtraRoute =
  | {kind:'archive';url:string;number:number;taxonomy?:'tag'|'category'|'series';label?:string}
  | {kind:'page';url:string;entry:InternalPage}
  | {kind:'redirect';url:string;target:string};

/** Deterministic archive routes from public summaries; no build-time timestamps. */
function archiveRoutes(posts:PostSummary[]):Extract<ExtraRoute,{kind:'archive'}>[] {
  const result:Extract<ExtraRoute,{kind:'archive'}>[]=[];
  const pageSize=getPublicSite().blog?.pageSize??10;
  const add=(base:string,count:number,taxonomy?:'tag'|'category'|'series',label?:string)=>{
    const total=Math.max(1,Math.ceil(count/pageSize));
    for(let number=taxonomy?1:2;number<=total;number++) result.push({kind:'archive',url:base+(number===1?'':'/page/'+number),number,...(taxonomy?{taxonomy,label}:{})});
  };
  add(urls.archive(),posts.length);
  for(const [field,kind] of [['tags','tag'],['categories','category'],['series','series']] as const) {
    for(const term of collectTaxonomy(posts,field)) add(term.url,term.count,kind,term.label);
  }
  return result;
}
/** Public archive locations can also be included in the sitemap. */
export async function getArchiveRoutes() { return archiveRoutes((await getPublishedPosts()).map(entry=>summarizePost(entry))).map(route=>({url:route.url,title:route.label??'全部文章'})); }

/** Resolve all optional routes and fail before ambiguous output overwrites any file. */
export async function getExtraRoutes():Promise<ExtraRoute[]> {
  const [entries,pages]=await Promise.all([getVisiblePosts(),getPageEntries(true)]);
  const posts=entries.map(entry=>summarizePost(entry));
  const result:ExtraRoute[]=archiveRoutes(posts);
  const used=new Set(['/', '/blog','/about','/404','/404.html','/rss.xml','/feed.json','/atom.xml','/sitemap.xml','/robots.txt','/search-index.json']);
  const key=(url:string)=>decodeURIComponent(routePath(url)).normalize('NFC').replace(/\/$/,'').toLowerCase();
  const claim=(url:string)=>{const value=key(url);if(used.has(value)) throw new Error('[mintfolio:routes] Duplicate or reserved path: '+url);used.add(value);};
  posts.forEach(post=>claim(post.url));
  result.forEach(route=>claim(route.url));
  for(const entry of pages) {const page=summarizePage(entry);claim(page.url);result.push({kind:'page',url:page.url,entry});}
  for(const [entry,target] of [...entries.map((entry,index)=>[entry,posts[index]!.url] as const),...pages.map(entry=>[entry,summarizePage(entry).url] as const)]) {
    for(const alias of entry.data.aliases??[]) {const url=prefixRoute(alias,deploymentBase);claim(url);result.push({kind:'redirect',url,target});}
  }
  return result;
}
