import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { checkedPath, exists } from './files.mjs';
import { PAGES_DIR, PROJECT_DIR, siteRootOf } from '../../src/shared/layout.mjs';

/** Core-owned Astro files inside the project folder; the directory ignores itself in Git. */
export const RUNTIME_DIR = '.generated';
/** Relative to the project folder, the form Astro's --config flag expects. */
export const RUNTIME_CONFIG = `${RUNTIME_DIR}/astro.config.mjs`;

const USER_ASTRO_CONFIGS = ['astro.config.mjs', 'astro.config.js', 'astro.config.ts', 'astro.config.mts'];
const LEGACY_COLLECTIONS = ['content.config.ts', 'content.config.mjs', 'content.config.js', 'content.config.mts'];

/**
 * Find the optional host Astro config. It may add Astro options, but Core owns
 * the Mintfolio integration, content collections and srcDir.
 * @param {string} root Project folder (_mintfolio).
 * @returns {Promise<string|null>} Project-relative filename, or null when absent.
 */
export async function userAstroConfig(root) {
  for (const name of USER_ASTRO_CONFIGS) if (await exists(path.join(root, name))) return name;
  return null;
}

/**
 * Reject files from older layouts instead of silently ignoring them, so a site
 * never builds without content or settings the author believes are applied.
 * @param {string} root Project folder (_mintfolio).
 * @returns {Promise<void>} Throws one message listing every required change.
 */
export async function assertCurrentLayout(root) {
  const problems = [];
  for (const name of LEGACY_COLLECTIONS) {
    if (await exists(path.join(root, 'src', name))) problems.push(`删除 ${PROJECT_DIR}/src/${name}：内容集合已由 Core 管理。`);
  }
  for (const name of (await readdir(root)).filter((entry) => /^theme-[a-z0-9-]+\.config\.mjs$/.test(entry)).sort()) {
    problems.push(`把 ${PROJECT_DIR}/${name} 中的设置移到 theme.config.mjs 的 settings（只保留当前主题的设置），然后删除该文件。`);
  }
  const astroConfig = await userAstroConfig(root);
  // Only an actual import of the integration counts; comments may mention the package.
  const importsCore = /(?:\bfrom|\bimport\s*\(?|\brequire\s*\()\s*['"]@mintfolio\/core['"]/;
  if (astroConfig && importsCore.test(await readFile(path.join(root, astroConfig), 'utf8'))) {
    problems.push(`${PROJECT_DIR}/${astroConfig} 不再需要引入 @mintfolio/core：只保留额外的 Astro 设置，没有的话直接删除该文件。`);
  }
  for (const base of [root, siteRootOf(root)]) {
    const where = base === root ? `${PROJECT_DIR}/` : '';
    if (await exists(path.join(base, 'content', 'blog'))) problems.push(`把 ${where}content/blog/ 中的文章移到站点根目录（与 ${PROJECT_DIR}/ 同级），然后删除该目录。`);
    if (await exists(path.join(base, 'content', 'pages'))) problems.push(`把 ${where}content/pages/ 中的页面移到 ${PROJECT_DIR}/${PAGES_DIR}/。`);
  }
  if (problems.length) {
    throw new Error(`站点仍在使用旧的文件布局，请先完成以下调整：\n${problems.map((item) => `  - ${item}`).join('\n')}\n详见 Core 文档 docs/cli.md 的「从旧布局升级」一节。`);
  }
}

/** @param {string} filename @param {string} source Write only real changes, so watchers do not restart dev needlessly. */
async function writeIfChanged(filename, source) {
  const current = await readFile(filename, 'utf8').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  if (current !== source) await writeFile(filename, source);
}

/**
 * Generate the Astro entry and content collections Core needs before every
 * Astro command. Both files are owned by Core and rewritten on each run.
 * @param {string} root Project folder (_mintfolio), which is also Astro's root.
 * @returns {Promise<string>} Project-relative Astro config path for --config.
 */
export async function prepareRuntime(root) {
  await assertCurrentLayout(root);
  const directory = await checkedPath(root, path.join(root, RUNTIME_DIR));
  await mkdir(path.join(directory, 'src'), { recursive: true });
  await writeIfChanged(path.join(directory, '.gitignore'), '# 由 Mintfolio 在每次运行时生成，不需要提交。\n*\n');
  const astroConfig = await userAstroConfig(root);
  const header = '// 由 Mintfolio 在每次运行时生成，请勿修改。\n// 站点资料写在 site.config.ts，主题与主题设置写在 theme.config.mjs。\n';
  // Articles live in the parent folder; Vite must be allowed to serve their images in dev.
  const articles = JSON.stringify(siteRootOf(root).replaceAll('\\', '/'));
  await writeIfChanged(path.join(directory, 'astro.config.mjs'), `${header}${astroConfig ? '// 额外的 Astro 设置来自 ' + PROJECT_DIR + '/' + astroConfig + '。\n' : '// 需要额外的 Astro 设置时，可在 ' + PROJECT_DIR + '/ 中添加 astro.config.mjs。\n'}import { defineConfig${astroConfig ? ', mergeConfig' : ''} } from 'astro/config';
import mintfolio from '@mintfolio/core';
import theme from '../theme.config.mjs';
${astroConfig ? `import site from '../${astroConfig}';\n` : ''}
const core = defineConfig({
  srcDir: './${RUNTIME_DIR}/src',
  vite: { server: { fs: { allow: [${articles}] } } },
  integrations: [mintfolio(theme)],
});
export default ${astroConfig ? 'mergeConfig(site, core)' : 'core'};
`);
  await writeIfChanged(path.join(directory, 'src', 'content.config.mjs'), `${header}// 文章放在站点根目录（${PROJECT_DIR}/ 之外），独立页面放在 ${PROJECT_DIR}/${PAGES_DIR}/。
import { createBlogCollection, createPageCollection } from '@mintfolio/core/content';
export const collections = { blog: createBlogCollection(), pages: createPageCollection() };
`);
  return RUNTIME_CONFIG;
}

/**
 * Astro arguments for one command. Core supplies the config file and root, so
 * passing either would load a different project than the CLI prepared.
 * @param {string} command Astro command.
 * @param {string[]} args User arguments forwarded to Astro.
 * @param {string} config Project-relative runtime config.
 * @returns {string[]} Argument vector after the Astro entry.
 */
export function astroArgs(command, args, config) {
  if (args.some((arg) => /^--(?:config|root)(?:=|$)/.test(arg))) throw new Error(`mintfolio 会自动指定 Astro 的 --config 和 --root；额外的 Astro 设置请写在 ${PROJECT_DIR}/astro.config.mjs。`);
  return [command, '--config', config, ...args];
}
