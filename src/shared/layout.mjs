import path from 'node:path';

/**
 * Site layout shared by the CLI, content checks and the content collections.
 * The site root holds only articles; everything else lives in PROJECT_DIR,
 * which is also the npm package and Astro project root.
 */
export const PROJECT_DIR = '_mintfolio';
/** Independent Markdown pages, relative to PROJECT_DIR. */
export const PAGES_DIR = 'pages';
/** Static files copied as-is, relative to PROJECT_DIR. */
export const PUBLIC_DIR = 'public';

/** Repository documents that may sit beside articles without being published. */
const REPOSITORY_DOCS = ['readme', 'agents', 'claude', 'changelog', 'license', 'licence', 'contributing', 'security', 'code_of_conduct'];

/**
 * Glob patterns, relative to the site root, for the article collection.
 * Folders or files starting with `_` or `.` (including PROJECT_DIR and `.github`)
 * are never articles; neither are the repository documents at the top level.
 */
export const ARTICLE_PATTERNS = [
  '**/*.md',
  '!**/_*/**', '!**/_*.md',
  '!**/.*/**', '!**/.*.md',
  '!**/node_modules/**',
  ...REPOSITORY_DOCS.flatMap((name) => [name, name.toUpperCase(), name[0].toUpperCase() + name.slice(1)]).map((name) => `!${name}.md`),
];

/**
 * The same rule as ARTICLE_PATTERNS for code that walks the filesystem itself.
 * @param {string} relative Path relative to the site root, with / or \ separators.
 * @returns {boolean} Whether the file is published as an article.
 */
export function isArticlePath(relative) {
  const segments = relative.split(/[\\/]/).filter(Boolean);
  if (!segments.length || !/\.md$/i.test(segments.at(-1))) return false;
  if (segments.some((segment) => segment.startsWith('_') || segment.startsWith('.') || segment === 'node_modules')) return false;
  return !(segments.length === 1 && REPOSITORY_DOCS.includes(segments[0].replace(/\.md$/i, '').toLowerCase()));
}

/**
 * Whether a directory may contain articles; used to prune filesystem walks.
 * @param {string} name Directory basename.
 * @returns {boolean}
 */
export function isArticleDirectory(name) {
  return !name.startsWith('_') && !name.startsWith('.') && name !== 'node_modules';
}

/** @param {string} projectRoot Absolute PROJECT_DIR path. @returns {string} Absolute site root holding the articles. */
export function siteRootOf(projectRoot) { return path.dirname(projectRoot); }
