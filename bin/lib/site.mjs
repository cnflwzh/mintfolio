import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import semver from 'semver';
import { initialize } from './init.mjs';
import { activeTheme, installTheme } from './themes.mjs';
import { npm } from './process.mjs';
import { exists } from './files.mjs';
import { getConfig } from './config.mjs';
import { assertCurrentLayout } from './runtime.mjs';
import { PROJECT_DIR } from '../../src/shared/layout.mjs';

/** @returns {Promise<string>} Version of the executing CLI package. */
export async function cliVersion() { return JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version; }

/** @param {string} root Site root. Reject theme-file editing against engines that cannot read those files. */
export async function requireThemeConfigRuntime(root) {
  const host = createRequire(path.join(root, 'package.json'));
  const core = JSON.parse(await readFile(host.resolve('@mintfolio/core/package.json'), 'utf8'));
  if (!semver.gte(core.version, '0.1.1')) throw new Error(`当前站点 Core ${core.version} 不支持独立主题配置，请先运行 mintfolio upgrade。`);
}

/** @param {string} root Project folder. @returns {boolean} Whether Core is installed for this site. */
function hasCore(root) {
  try { createRequire(path.join(root, 'package.json')).resolve('@mintfolio/core/package.json'); return true; }
  catch { return false; }
}

/**
 * Turn a directory into a site: articles stay at its root, and _mintfolio receives
 * package.json, Core and the scaffold. Existing files are never replaced. A supplied
 * registry config applies only to @mintfolio; no global npm settings are changed.
 * @param {string} directory Site root (the folder that holds, or will hold, the articles).
 * @param {{theme?:string,registry?:string,requireEmpty?:boolean}} options Optional initial theme,
 *   scoped registry, and whether the directory must be empty (mintfolio create).
 * @returns {Promise<string>} Absolute project folder.
 */
export async function setupSite(directory, options = {}) {
  let target = path.resolve(directory);
  if (path.basename(target) === PROJECT_DIR) target = path.dirname(target);
  if (options.requireEmpty && await exists(target) && (await readdir(target)).length) throw new Error('新站点目录必须为空；已有文章的目录请在其中运行 mintfolio init。');
  let registry;
  if (options.registry) {
    const url = new URL(options.registry);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('--registry 需要不带账号或查询参数的 HTTP(S) 仓库地址。');
    registry = url.href;
  }
  await mkdir(path.join(target, PROJECT_DIR), { recursive: true });
  const site = await realpath(target);
  const root = path.join(site, PROJECT_DIR);
  const name = path.basename(site).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/^-+|-+$/g, '') || 'mintfolio-site';
  if (!await exists(path.join(root, 'package.json'))) await writeFile(path.join(root, 'package.json'), JSON.stringify({ name, private: true, version: '1.0.0', type: 'module' }, null, 2) + '\n', { flag: 'wx' });
  if (registry) await writeFile(path.join(root, '.npmrc'), `registry=https://registry.npmjs.org/\n@mintfolio:registry=${registry}\n`, { flag: 'wx' });
  if (!hasCore(root)) await npm(['install', `@mintfolio/core@^${await cliVersion()}`, '--no-audit'], root);
  await initialize(root);
  if (options.theme && options.theme !== 'minimal') await installTheme(root, options.theme, true);
  return root;
}

/**
 * Create a new site in an empty directory.
 * @param {string} directory Explicit target directory.
 * @param {{theme?:string,registry?:string}} options Optional initial theme and scoped registry.
 * @returns {Promise<string>} Absolute project folder.
 */
export async function createSite(directory, options = {}) {
  const root = await setupSite(directory, { ...options, requireEmpty: true });
  console.log(`站点已创建：${path.dirname(root)}\n进入目录后运行 mintfolio 打开菜单，或执行 mintfolio dev。`);
  return root;
}

/**
 * Diagnose the actual installed host and selected theme without changing files.
 * @param {string} root Site root.
 * @returns {Promise<object>} Runtime paths, versions and configuration status.
 */
export async function doctor(root) {
  if (!semver.gte(process.versions.node, '22.12.0')) throw new Error('需要 Node.js >= 22.12.0。');
  await assertCurrentLayout(root);
  const host = createRequire(path.join(root, 'package.json'));
  const corePath = host.resolve('@mintfolio/core/package.json');
  const core = JSON.parse(await readFile(corePath, 'utf8'));
  const coreRequire = createRequire(corePath);
  const astro = JSON.parse(await readFile(coreRequire.resolve('astro/package.json'), 'utf8'));
  const active = await activeTheme(root, process.env.MINTFOLIO_THEME || undefined);
  const site = await getConfig(root, 'site');
  if (!site.site) throw new Error('site.config.ts 缺少 site 信息。');
  return { root, node: process.versions.node, cli: await cliVersion(), core: core.version, astro: astro.version, theme: active.selector, themeVersion: active.definition.manifest.version, config: path.join(root, 'theme.config.mjs'), status: 'ok' };
}
