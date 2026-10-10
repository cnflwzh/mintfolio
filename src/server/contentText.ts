import { markdownToHast } from 'satteri';

/** Extract searchable public prose without raw HTML, script, code fences or frontmatter. */
export function contentText(markdown: string): string {
  const chunks:string[]=[];
  const visit=(node:any):void=>{
    if(node.type==='raw'||['pre','script','style'].includes(node.tagName)) return;
    if(node.type==='text') chunks.push(node.value);
    for(const child of node.children??[]) visit(child);
  };
  visit(markdownToHast(markdown));
  return chunks.join(' ').replace(/\s+/gu,' ').trim();
}

/** Han characters count individually, alphabetic/numeric runs as words; 240 words/minute. */
export function readingStats(text:string): {wordCount:number;readingMinutes:number} {
  const wordCount=(text.replace(/\p{Script=Han}/gu,character=>' '+character+' ').match(/[\p{L}\p{N}]+/gu)??[]).length;
  return {wordCount,readingMinutes:Math.max(1,Math.ceil(wordCount/240))};
}
