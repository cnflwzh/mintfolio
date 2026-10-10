import type { PostQuery, PostSummary, ThemeContext, ThemeDefinition } from '@mintfolio/theme-api';
import { createSearchEntry, filterPosts, searchPosts } from '@mintfolio/theme-api/search';
import { getPublishedPosts, getVisiblePosts, summarizePost, collectTaxonomy, collectArchives, relatedPosts, getPostProse } from '../server/posts';
import { getPublicSite, config } from '../server/site';
import { urls, resolveAsset } from '../server/routing';
import { getPageEntries, summarizePage } from '../server/pagesContent';

/** Only validated manifest data and recursively validated settings cross this boundary. */
export interface ActiveTheme { definition: ThemeDefinition; settings: Record<string, unknown> }
function pageNumber(value:number|undefined,field:string,fallback:number):number {
  if(value===undefined) return fallback;
  if(!Number.isSafeInteger(value)||value<0) throw new Error('content.posts(): '+field+' must be a non-negative safe integer');
  return value;
}

/** Context is scoped to a render so local edits cannot be hidden by a global cache. */
export async function createThemeContext(active:ActiveTheme):Promise<ThemeContext> {
  const entries=await getVisiblePosts();
  const posts=entries.map(entry=>summarizePost(entry));
  const site=getPublicSite();
  if(posts.some(post=>post.protected)&&!active.definition.capabilities.encryptedPosts) throw new Error('[theme:capability] '+active.definition.manifest.id+' does not support encryptedPosts');
  // Search is always public even in preview mode. Private prose is never parsed.
  const searchIndex=async()=> (await getPublishedPosts()).filter(entry=>!entry.data.seo?.noindex).map(entry=>{
    const post=summarizePost(entry);return createSearchEntry(post,post.protected?undefined:getPostProse(entry).text);
  });
  return {site,settings:active.settings,
    navigation:config.navigation?.map(link=>({...link,url:resolveAsset(link.url)}))??[
      {id:'home',label:'首页',url:urls.home()},
      {id:'archive',label:'全部文章',url:urls.archive()},
      {id:'about',label:'关于我',url:urls.page('about')},
    ],
    content:{
      posts:async(query:PostQuery={})=>{
        let matches=filterPosts(posts,{...query,q:''});
        if(query.q?.trim()) {
          const ids=new Set(searchPosts(await searchIndex(),query).map(entry=>entry.id));
          matches=matches.filter(post=>ids.has(post.id));
        }
        const offset=pageNumber(query.offset,'offset',0),limit=pageNumber(query.limit,'limit',matches.length);
        return {items:matches.slice(offset,offset+limit),total:matches.length};
      },
      post:async(id:string)=>posts.find(post=>post.id===id)??null,
      pages:async()=> (await getPageEntries(true)).map(summarizePage),
      related:async(id:string,limit?:number)=>relatedPosts(posts,id,limit),
    },
    taxonomy:{tags:async()=>collectTaxonomy(posts,'tags'),categories:async()=>collectTaxonomy(posts,'categories'),series:async()=>collectTaxonomy(posts,'series'),archives:async()=>collectArchives(posts,site.blog?.timezone)},
    urls,search:{index:searchIndex},
  };
}
