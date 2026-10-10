import { ELEMENT_NODE, h, parse, renderSync, walkSync, type ElementNode } from 'ultrahtml';
import { withBase } from '../shared/deployment.mjs';
import { deploymentBase } from './routing.ts';

/** Rewrite only URL tokens; data-URL commas stay part of the image source. */
function resolveSrcset(value:string, base:string):string {
  let index=0,cursor=0,result='';
  while(index<value.length) {
    while(index<value.length && /[\t\n\f\r ,]/.test(value[index]!)) index++;
    const start=index;
    while(index<value.length && !/[\t\n\f\r ]/.test(value[index]!)) index++;
    let end=index;
    while(end>start && value[end-1]===',') end--;
    result+=value.slice(cursor,start)+withBase(value.slice(start,end),base);cursor=end;
    if(end<index) continue;
    // Descriptors may contain parenthesized commas; only a top-level comma ends a candidate.
    let depth=0;
    while(index<value.length) {
      const char=value[index++];
      if(char==='(') depth++;
      else if(char===')') depth=Math.max(0,depth-1);
      else if(char===',' && depth===0) break;
    }
  }
  return result+value.slice(cursor);
}
/**
 * Adapt Astro-rendered HTML for deployment and progressive reading, before encryption.
 * @param html Compiled article/page markup, including custom Markdown processor output.
 * @param base Astro deployment prefix; external URLs and escaped code are untouched.
 * @returns HTML with portable root URLs and keyboard-accessible static table scroll areas.
 */
export function prepareContentHtml(html:string, base=deploymentBase):string {
  const tree=parse(html);
  const tables:ElementNode[]=[];
  walkSync(tree, node=>{
    if(node.type!==ELEMENT_NODE) return;
    for(const name of ['href','src','poster','action','cite','xlink:href']) {
      if(typeof node.attributes[name]==='string') node.attributes[name]=withBase(node.attributes[name],base);
    }
    if(node.attributes.srcset) node.attributes.srcset=resolveSrcset(node.attributes.srcset,base);
    // ultrahtml retains existing entities but serializes every attribute in double quotes.
    for(const name of Object.keys(node.attributes)) node.attributes[name]=node.attributes[name]!.replaceAll('"','&quot;');
    if(node.name==='table') tables.push(node);
  });
  for(const table of tables) {
    const parent=table.parent;
    if(!parent || !('children' in parent) || (parent.type===ELEMENT_NODE && 'data-mintfolio-table-scroll' in parent.attributes)) continue;
    const index=parent.children.indexOf(table);
    const wrapper=h('div',{'data-mintfolio-table-scroll':'',tabindex:'0',role:'region','aria-label':'表格，可横向滚动'},table);
    wrapper.parent=parent; table.parent=wrapper; parent.children[index]=wrapper;
  }
  return renderSync(tree);
}
