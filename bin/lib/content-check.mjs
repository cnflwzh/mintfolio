import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import Slugger, { slug as githubSlug } from 'github-slugger';
import { htmlToHast, markdownToHast } from 'satteri';
import { isMap, LineCounter, parseDocument } from 'yaml';
import { checkedPath, within } from './files.mjs';
import { isArticleDirectory, isArticlePath, PAGES_DIR, PROJECT_DIR, PUBLIC_DIR } from '../../src/shared/layout.mjs';

const posix = value => value.replace(/\\/g, '/');
const external = value => /^[a-z][a-z\d+.-]*:/i.test(value) || value.startsWith('//');
const builtinRoutes = new Set(['/', '/blog', '/about', '/404', '/404.html', '/rss.xml', '/feed.json', '/atom.xml', '/sitemap.xml', '/robots.txt', '/search-index.json']);

function walk(node, visit) {
  visit(node);
  for (const child of node.children || []) walk(child, visit);
}

function textContent(node) {
  return node.type === 'text' ? node.value : (node.children || []).map(textContent).join('');
}

function normalizeRoute(value) {
  try {
    const decoded = value.split('/').map(decodeURIComponent).join('/');
    if (decoded.includes('\\') || decoded.includes('\0') || decoded.includes('?') || decoded.includes('#')) return null;
    if (decoded.split('/').some(segment => segment === '.' || segment === '..')) return null;
    return decoded.replace(/\/+$/, '') || '/';
  } catch { return null; }
}

function splitLink(value) {
  const hashAt = value.indexOf('#');
  const withoutHash = hashAt < 0 ? value : value.slice(0, hashAt);
  const queryAt = withoutHash.indexOf('?');
  let hash;
  try { hash = hashAt < 0 ? '' : decodeURIComponent(value.slice(hashAt + 1)); }
  catch { return null; }
  return { pathname: queryAt < 0 ? withoutHash : withoutHash.slice(0, queryAt), hash };
}

/** Read only literal YAML; parser error text can contain secrets, so never return it. */
function readFrontmatter(source) {
  const start = /^(?:\uFEFF)?---[^\S\r\n]*\r?\n/.exec(source);
  if (!start) return { data: {}, locations: {} };
  const remainder = source.slice(start[0].length);
  const end = /^(?:---|\.\.\.)[^\S\r\n]*(?:\r?\n|$)/m.exec(remainder);
  if (!end) return { invalid: { line: 1, column: 1 } };
  const lineCounter = new LineCounter();
  const document = parseDocument(remainder.slice(0, end.index), { uniqueKeys: true, lineCounter });
  if (document.errors.length || !isMap(document.contents)) {
    const location = lineCounter.linePos(document.errors[0]?.pos?.[0] || 0);
    return { invalid: { line: location.line + 1, column: location.col } };
  }
  try {
    const data = document.toJS({ maxAliasCount: 100 });
    const locations = {};
    for (const key of ['slug', 'aliases', 'cover']) {
      const node = document.get(key, true);
      if (node?.range) {
        const location = lineCounter.linePos(node.range[0]);
        locations[key] = { line: location.line + 1, column: location.col };
      }
    }
    return { data, locations };
  } catch { return { invalid: { line: 1, column: 1 } }; }
}

/**
 * Inspect static Markdown source without importing site/theme code or using the network.
 * Draft, future-dated and password-protected content is included. Diagnostics expose
 * only relative filenames, positions and generic messages, never body/frontmatter values.
 * Unknown theme routes are ignored; Markdown-source URLs and unconfirmed heading
 * anchors produce warnings because Astro plugins can rewrite those during rendering.
 * @param {string} root Existing site root holding the articles (the parent of _mintfolio).
 * @param {{blogDir?:string,pagesDir?:string|false,publicDir?:string}} [options]
 *   Optional directories inside root; pagesDir:false disables pages. Articles skip
 *   `_`/`.` paths and repository documents, matching the content collection.
 * @returns {Promise<{errors:Array<{code:string,file:string,line:number,column:number,message:string}>,warnings:Array<{code:string,file:string,line:number,column:number,message:string}>,counts:{files:number,posts:number,pages:number,links:number,images:number}}>}
 *   Deterministically ordered diagnostics and inspected document/reference counts.
 * @throws {Error} Invalid root/options or an unexpected filesystem access failure.
 */
export async function checkContent(root, options = {}) {
  const base = await realpath(root);
  const errors = [];
  const warnings = [];
  const counts = { files: 0, posts: 0, pages: 0, links: 0, images: 0 };
  const documents = [];
  const byFile = new Map();
  const byRoute = new Map();
  const publicDir = await checkedPath(base, path.resolve(base, options.publicDir || `${PROJECT_DIR}/${PUBLIC_DIR}`));

  function report(list, doc, code, message, position = {}) {
    const point = position.start || position;
    list.push({ code, file: doc.file, line: point.line || 1, column: point.column || 1, message });
  }

  async function collect(directory, collection, collectionBase = directory) {
    let entries;
    try { entries = await readdir(directory, { withFileTypes: true }); }
    catch (error) { if (error.code === 'ENOENT') return; throw error; }
    entries.sort((a, b) => a.name.localeCompare(b.name, 'en'));
    for (const entry of entries) {
      const filename = path.join(directory, entry.name);
      const file = posix(path.relative(base, filename));
      // The article collection shares the site root with the project folder and repository files.
      if (collection === 'blog' && (entry.isDirectory() ? !isArticleDirectory(entry.name) : !isArticlePath(path.relative(collectionBase, filename)))) continue;
      if (entry.isSymbolicLink()) {
        report(warnings, { file }, 'SKIPPED_SYMLINK', '未读取符号链接；请将需要检查的内容放在站点目录中。');
      } else if (entry.isDirectory()) {
        await collect(filename, collection, collectionBase);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const source = await readFile(filename, 'utf8');
        const frontmatter = readFrontmatter(source);
        counts.files++;
        counts[collection === 'blog' ? 'posts' : 'pages']++;
        if (frontmatter.invalid) {
          report(errors, { file }, 'INVALID_FRONTMATTER', 'YAML frontmatter 无效或未结束。', frontmatter.invalid);
          continue;
        }
        const { data, locations } = frontmatter;
        const fileId = posix(path.relative(collectionBase, filename)).replace(/\.md$/, '').split('/').map(segment => githubSlug(segment)).join('/').replace(/\/index$/, '');
        const id = typeof data.slug === 'string' && data.slug.trim() ? data.slug : fileId;
        const route = normalizeRoute(`${collection === 'blog' ? '/blog/' : '/'}${id}`);
        const doc = { filename, file, collection, data, locations, route, anchors: new Set(), references: [] };
        documents.push(doc);
        byFile.set(filename, doc);
        if (!route || id.startsWith('/') || id.includes('//')) {
          report(errors, doc, 'INVALID_SLUG', 'slug 必须是有效的相对内容路径，不含查询参数或片段。', locations.slug);
        }
        let tree;
        try { tree = markdownToHast(source); }
        catch {
          report(errors, doc, 'INVALID_MARKDOWN', '无法解析 Markdown 内容。');
          continue;
        }
        const slugger = new Slugger();
        function inspect(node, fallbackPosition) {
          if (node.type !== 'element') return;
          const properties = node.properties || {};
          if (typeof properties.id === 'string') doc.anchors.add(properties.id);
          if (node.tagName === 'a' && typeof properties.name === 'string') doc.anchors.add(properties.name);
          if (typeof properties.href === 'string' && node.tagName === 'a') doc.references.push({ kind: 'link', url: properties.href, position: node.position || fallbackPosition });
          if (typeof properties.src === 'string' && node.tagName === 'img') doc.references.push({ kind: 'image', url: properties.src, position: node.position || fallbackPosition });
        }
        walk(tree, node => {
          inspect(node);
          if (node.type === 'element' && /^h[1-6]$/.test(node.tagName)) {
            doc.anchors.add(typeof node.properties?.id === 'string' ? node.properties.id : slugger.slug(textContent(node)));
          } else if (node.type === 'raw') {
            // HTML is parsed, never evaluated. Keep the original raw-block position;
            // the HTML parser does not retain Markdown source locations.
            try { walk(htmlToHast(node.value, { fragment: true }), child => inspect(child, node.position)); }
            catch { /* Opaque HTML/custom syntax is outside static diagnostics. */ }
          }
        });
        if (typeof data.cover === 'string' && data.cover) doc.references.push({ kind: 'image', url: data.cover, position: locations.cover });
      }
    }
  }

  await collect(await checkedPath(base, path.resolve(base, options.blogDir || '.')), 'blog');
  if (options.pagesDir !== false) await collect(await checkedPath(base, path.resolve(base, options.pagesDir || `${PROJECT_DIR}/${PAGES_DIR}`)), 'pages');

  function register(doc, route, position) {
    if (!route) return;
    if (builtinRoutes.has(route.toLowerCase())) {
      report(errors, doc, 'RESERVED_ROUTE', '内容地址与 Core 保留路由冲突。', position);
      return;
    }
    const previous = byRoute.get(route);
    if (previous) {
      report(errors, doc, 'DUPLICATE_ROUTE', `内容地址重复，已被 ${previous.file} 使用。`, position);
    } else byRoute.set(route, doc);
  }

  for (const doc of documents) register(doc, doc.route, doc.locations.slug);
  for (const doc of documents) {
    if (doc.data.aliases === undefined) continue;
    if (!Array.isArray(doc.data.aliases)) {
      report(errors, doc, 'INVALID_ALIASES', 'aliases 必须是站内根路径组成的数组。', doc.locations.aliases);
      continue;
    }
    for (const alias of doc.data.aliases) {
      const route = typeof alias === 'string' && alias.startsWith('/') && !external(alias) && !/[?#]/.test(alias) ? normalizeRoute(alias) : null;
      if (!route) report(errors, doc, 'INVALID_ALIAS', 'alias 必须是以 / 开头的站内路径，不能包含查询参数或片段。', doc.locations.aliases);
      else register(doc, route, doc.locations.aliases);
    }
  }

  const pagePrefixes = new Set(documents.filter(doc => doc.collection === 'pages' && doc.route).map(doc => path.posix.dirname(doc.route)).filter(prefix => prefix !== '/'));

  async function localFile(filename) {
    if (!within(filename, base)) return 'outside';
    try {
      if (!within(await realpath(filename), base)) return 'outside';
      return (await stat(filename)).isFile() ? 'exists' : 'missing';
    } catch (error) {
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') return 'missing';
      throw error;
    }
  }

  for (const doc of documents) {
    for (const reference of doc.references) {
      counts[reference.kind === 'image' ? 'images' : 'links']++;
      const { url, position } = reference;
      if (!url || external(url) || /[{}]/.test(url)) continue;
      const link = splitLink(url);
      if (!link) {
        report(warnings, doc, 'INVALID_LINK_ENCODING', '链接包含无效的 URL 编码。', position);
        continue;
      }
      let pathname;
      try { pathname = link.pathname.split('/').map(decodeURIComponent).join('/'); }
      catch {
        report(warnings, doc, 'INVALID_LINK_ENCODING', '链接包含无效的 URL 编码。', position);
        continue;
      }
      if (pathname.includes('\0') || pathname.includes('\\')) continue;
      if (reference.kind === 'image') {
        if (!pathname || pathname.startsWith('/_astro/') || pathname.startsWith('/@')) continue;
        const filename = pathname.startsWith('/') ? path.resolve(publicDir, `.${pathname}`) : path.resolve(path.dirname(doc.filename), pathname);
        const state = pathname.startsWith('/') && !within(filename, publicDir) ? 'outside' : await localFile(filename);
        if (state !== 'exists') report(errors, doc, state === 'outside' ? 'OUTSIDE_SITE' : 'MISSING_IMAGE', state === 'outside' ? '图片路径超出了站点目录，未读取该位置。' : '找不到图片文件。', position);
        continue;
      }
      let target;
      if (!pathname) target = doc;
      else if (/\.md$/i.test(pathname)) {
        const filename = pathname.startsWith('/') ? path.resolve(base, `.${pathname}`) : path.resolve(path.dirname(doc.filename), pathname);
        target = byFile.get(filename);
        if (!target) report(errors, doc, 'MISSING_CONTENT', '找不到链接指向的 Markdown 内容。', position);
        else report(warnings, doc, 'MARKDOWN_SOURCE_LINK', '链接指向 Markdown 源文件；默认静态输出应使用该内容的页面地址。', position);
      } else {
        let route;
        try {
          // Resolve relative browser URLs exactly as the default no-trailing-slash
          // Core URL does. Source-relative .md links are handled above separately.
          route = normalizeRoute(new URL(url, `https://mintfolio.invalid${doc.route || '/'}`).pathname);
        } catch { continue; }
        target = byRoute.get(route);
        if (!target && route?.startsWith('/blog/') && !/\.[^/]+$/.test(route) && !/^\/blog\/page\/\d+$/.test(route)) {
          report(errors, doc, 'MISSING_CONTENT', '找不到站内文章或页面。', position);
        }
        if (!target && route && [...pagePrefixes].some(prefix => route.startsWith(prefix + '/'))) {
          report(warnings, doc, 'UNKNOWN_PAGE', '已有页面目录中未找到该地址；若没有宿主自定义路由，请修正链接。', position);
        }
        // Unknown root paths may be provided by host Astro pages or a theme;
        // only known content routes and the blog namespace are authoritative.
      }
      if (target && link.hash && !target.anchors.has(link.hash) && !link.hash.startsWith(':~:text=')) {
        report(warnings, doc, 'MISSING_ANCHOR', '目标内容中未找到该锚点；若没有插件生成此锚点，请修正链接。', position);
      }
    }
  }
  const compare = (a, b) => a.file.localeCompare(b.file, 'en') || a.line - b.line || a.column - b.column || a.code.localeCompare(b.code, 'en');
  errors.sort(compare);
  warnings.sort(compare);
  return { errors, warnings, counts };
}
