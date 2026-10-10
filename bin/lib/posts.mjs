import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isMap, isScalar, parseDocument } from 'yaml';
import { checkedPath, exists, saveFile } from './files.mjs';
import { publicationState } from '../../src/shared/publication.mjs';
import { isArticleDirectory, isArticlePath, siteRootOf } from '../../src/shared/layout.mjs';

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
  if (!isArticlePath(id + '.md')) throw new Error(`${id}.md 是仓库说明文件的名称，不会作为文章发布；请换一个文章 ID。`);
  return pieces.join(path.sep) + '.md';
}

function checkedDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) throw new Error('日期必须是有效的 YYYY-MM-DD。');
  return value;
}

/**
 * Create a Markdown article exclusively; existing articles are never overwritten.
 * @param {string} root Project folder (_mintfolio); the article goes to the site root above it.
 * @param {string} title Required article title.
 * @param {{slug?:string,description?:string,category?:string,tags?:string,date?:string,publish?:boolean}} options Frontmatter inputs; new articles default to drafts.
 * @returns {Promise<string>} Absolute created filename.
 */
export async function createPost(root, title, options = {}) {
  if (!title.trim()) throw new Error('文章标题不能为空。');
  const site = siteRootOf(root);
  const filename = path.join(site, postPath(options.slug || slugFromTitle(title)));
  await checkedPath(site, filename);
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
  await checkedPath(site, filename);
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
 * @param {string} root Project folder (_mintfolio). @param {string} slug Article ID relative to the site root.
 * @param {boolean} draft true saves as draft; false permits building once pubDate is reached.
 * @param {{now?:Date}} [options] Optional fixed cutoff; otherwise captured once on entry.
 * @returns {Promise<{filename:string,backup:string|null,status:import('../../src/shared/publication.mjs').PublicationState,publishedAt:string}>}
 *   Updated article, exact backup, eligibility at the cutoff and full UTC publication time.
 * @throws {Error} Invalid metadata or an unsafe/concurrently changed file; no write occurs.
 */
export async function setDraft(root, slug, draft, options = {}) {
  const now = options.now ?? new Date();
  const site = siteRootOf(root);
  const filename = await checkedPath(site, path.join(site, postPath(slug)));
  const original = await readFile(filename, 'utf8');
  const { document, start, end } = frontmatter(original, filename);
  const pubDate = document.get('pubDate');
  const status = publicationState({ draft, pubDate }, now);
  const node = document.get('draft', true);
  let source;
  if (node !== undefined) {
    if (!isScalar(node) || typeof node.value !== 'boolean') throw new Error('draft 必须是布尔值，请先修正文章 frontmatter。');
    source = original.slice(0, start + node.range[0]) + String(draft) + original.slice(start + node.range[1]);
  } else {
    const eol = original.includes('\r\n') ? '\r\n' : '\n';
    source = original.slice(0, end) + `draft: ${draft}${eol}` + original.slice(end);
  }
  return { filename, backup: await saveFile(site, filename, original, source, root), status, publishedAt: new Date(pubDate).toISOString() };
}

/**
 * List public metadata only; passwords and article bodies are never printed.
 * @param {string} root Project folder (_mintfolio); articles are read from the site root above it.
 * @param {{now?:Date}} [options] Optional fixed cutoff; otherwise captured once for the whole list.
 * @returns {Promise<Array<{slug:string,title:string,date:string,draft:boolean,status:import('../../src/shared/publication.mjs').PublicationState,publishedAt:string}>>}
 *   Date-sorted safe metadata. date retains the original calendar date; publishedAt is full UTC.
 * @throws {Error} Invalid frontmatter/publication metadata or an unsafe content directory.
 */
export async function listPosts(root, options = {}) {
  const now = options.now ?? new Date();
  const base = siteRootOf(root);
  const posts = [];
  for (const { filename, document } of await articleDocuments(base)) {
    const title = document.get('title');
    if (typeof title !== 'string') throw new Error(`${filename} 的 title 必须是字符串。`);
    const pubDate = document.get('pubDate');
    const draft = document.get('draft');
    const status = publicationState({ draft, pubDate }, now);
    const publishedAt = new Date(pubDate).toISOString();
    posts.push({ slug: path.relative(base, filename).replace(/\\/g, '/').replace(/\.md$/, ''), title, date: String(pubDate).slice(0, 10), draft: draft ?? false, status, publishedAt });
  }
  return posts.sort((a, b) => b.publishedAt.localeCompare(a.publishedAt) || a.slug.localeCompare(b.slug));
}

/**
 * Categories and tags already used by articles, for suggestions while writing.
 * @param {string} root Project folder (_mintfolio).
 * @returns {Promise<{categories:string[],tags:string[]}>} Distinct values ordered by frequency, then name.
 */
export async function postTaxonomy(root) {
  const categories = new Map();
  const tags = new Map();
  const count = (map, value) => { if (typeof value === 'string' && value.trim()) map.set(value.trim(), (map.get(value.trim()) || 0) + 1); };
  for (const { document } of await articleDocuments(siteRootOf(root))) {
    count(categories, document.get('category'));
    const list = document.toJS().tags;
    if (Array.isArray(list)) for (const tag of list) count(tags, tag);
  }
  const sorted = map => [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).map(([value]) => value);
  return { categories: sorted(categories), tags: sorted(tags) };
}

/** @param {string} base Site root. @returns {Promise<Array<{filename:string,document:object}>>} Parsed frontmatter of every article file. */
async function articleDocuments(base) {
  if (!await exists(base)) return [];
  const documents = [];
  async function visit(directory) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      // Same rule as the content collection: skip _mintfolio, dot folders and repository documents.
      if (entry.isDirectory()) { if (isArticleDirectory(entry.name)) await visit(filename); }
      else if (entry.isFile() && isArticlePath(path.relative(base, filename))) {
        documents.push({ filename, document: frontmatter(await readFile(filename, 'utf8'), filename).document });
      }
    }
  }
  await visit(base);
  return documents;
}
