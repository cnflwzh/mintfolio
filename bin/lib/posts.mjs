import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isMap, isScalar, parseDocument } from 'yaml';
import { checkedPath, exists, saveFile } from './files.mjs';

/** @param {Date} [date] Local calendar date for article frontmatter. @returns {string} YYYY-MM-DD. */
export function today(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

/** @param {string} title Unicode title. @returns {string} Human-readable slug; no path is inferred from the title. */
export function slugFromTitle(title) { return title.normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, ''); }

/** @param {string} slug Relative article ID, optionally ending in .md. @returns {string} Checked relative Markdown path. */
export function postPath(slug) {
  const id = slug.replace(/\.md$/i, '');
  const pieces = id.split('/');
  if (!id || pieces.some(piece => !/^[\p{L}\p{N}][\p{L}\p{N}_-]*$/u.test(piece) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(piece))) throw new Error('文章 ID 仅支持文字、数字、下划线、连字符和目录分隔符 /；请用 --slug 指定有效路径。');
  return pieces.join(path.sep) + '.md';
}

function checkedDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('日期必须是有效的 YYYY-MM-DD。');
  return value;
}

/**
 * Create a Markdown article exclusively; existing articles are never overwritten.
 * @param {string} root Site root.
 * @param {string} title Required article title.
 * @param {{slug?:string,description?:string,category?:string,tags?:string,date?:string,publish?:boolean}} options Frontmatter inputs; new articles default to drafts.
 * @returns {Promise<string>} Absolute created filename.
 */
export async function createPost(root, title, options = {}) {
  if (!title.trim()) throw new Error('文章标题不能为空。');
  const filename = path.join(root, 'content/blog', postPath(options.slug || slugFromTitle(title)));
  await checkedPath(root, filename);
  const fields = {
    title,
    pubDate: checkedDate(options.date || today()),
    description: options.description || '',
    category: options.category || '',
    tags: (options.tags || '').split(',').map(tag => tag.trim()).filter(Boolean),
    draft: !options.publish,
  };
  const frontmatter = Object.entries(fields).map(([key, value]) => `${key}: ${JSON.stringify(value)}`).join('\n');
  await mkdir(path.dirname(filename), { recursive: true });
  await checkedPath(root, filename);
  try { await writeFile(filename, `---\n${frontmatter}\n---\n\n## ${title.replace(/[\r\n]+/g, ' ')}\n\n开始写作吧。\n`, { flag: 'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error(`文章已存在，未覆盖：${filename}`); throw error; }
  return filename;
}

/** @param {string} source Markdown source. @param {string} filename Diagnostic path. @returns {{document:object,start:number,end:number}} YAML document and exact source offsets. */
function frontmatter(source, filename) {
  const opening = /^(?:\uFEFF)?---[^\S\r\n]*\r?\n/.exec(source);
  if (!opening) throw new Error(`${filename} 缺少 YAML frontmatter。`);
  const remaining = source.slice(opening[0].length);
  const closing = /^---[^\S\r\n]*(?:\r?\n|$)/m.exec(remaining);
  if (!closing) throw new Error(`${filename} 的 YAML frontmatter 未结束。`);
  const start = opening[0].length;
  const end = start + closing.index;
  const document = parseDocument(source.slice(start, end), { uniqueKeys: true });
  if (document.errors.length || !isMap(document.contents)) throw new Error(`${filename} 的 YAML frontmatter 无效：${document.errors[0]?.message || '需要键值对象'}`);
  return { document, start, end };
}

/**
 * Toggle draft status while retaining Markdown and all unrelated YAML bytes.
 * @param {string} root Site root. @param {string} slug Article ID.
 * @param {boolean} draft true saves as draft, false makes it eligible for the next build.
 * @returns {Promise<{filename:string,backup:string|null}>} Updated article and exact backup.
 */
export async function setDraft(root, slug, draft) {
  const filename = await checkedPath(root, path.join(root, 'content/blog', postPath(slug)));
  const original = await readFile(filename, 'utf8');
  const { document, start, end } = frontmatter(original, filename);
  const node = document.get('draft', true);
  let source;
  if (node !== undefined) {
    if (!isScalar(node) || typeof node.value !== 'boolean') throw new Error('draft 必须是布尔值，请先修正文章 frontmatter。');
    source = original.slice(0, start + node.range[0]) + String(draft) + original.slice(start + node.range[1]);
  } else {
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    source = original.slice(0, end) + `draft: ${draft}${eol}` + original.slice(end);
  }
  return { filename, backup: await saveFile(root, filename, original, source) };
}

/**
 * List public metadata only; passwords and article bodies are never printed.
 * @param {string} root Site root.
 * @returns {Promise<Array<{slug:string,title:string,date:string,draft:boolean}>>} Date-sorted article metadata.
 */
export async function listPosts(root) {
  const base = path.join(root, 'content/blog');
  if (!await exists(base)) return [];
  await checkedPath(root, base);
  const posts = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(filename);
      else if (entry.isFile() && entry.name.endsWith('.md')) {
        const { document } = frontmatter(await readFile(filename, 'utf8'), filename);
        const title = document.get('title');
        if (typeof title !== 'string') throw new Error(`${filename} 的 title 必须是字符串。`);
        posts.push({ slug: path.relative(base, filename).replace(/\\/g, '/').replace(/\.md$/, ''), title, date: String(document.get('pubDate') || '').slice(0, 10), draft: document.get('draft') === true });
      }
    }
  }
  await visit(base);
  return posts.sort((a, b) => b.date.localeCompare(a.date) || a.slug.localeCompare(b.slug));
}
