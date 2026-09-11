import { mkdir, readdir, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import semver from 'semver';
import { initialize } from './init.mjs';
import { activeTheme, installTheme } from './themes.mjs';
import { npm } from './process.mjs';
import { exists } from './files.mjs';
import { getConfig } from './config.mjs';

/** @returns {Promise<string>} Version of the executing CLI package. */
export async function cliVersion() { return JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')).version; }

/** @param {string} root Site root. Reject theme-file editing against engines that cannot read those files. */
export async function requireThemeConfigRuntime(root) {
  const host = createRequire(path.join(root, 'package.json'));
  const core = JSON.parse(await readFile(host.resolve('@mintfolio/core/package.json'), 'utf8'));
  if (!semver.gte(core.version, '0.1.1')) throw new Error(`当前站点 Core ${core.version} 不支持独立主题配置，请先运行 mintfolio upgrade。`);
}

/**
 * Create a new site in an empty target and install Core through npm. A supplied
 * registry config applies only to @mintfolio; no global npm settings are changed.
 * @param {string} directory Explicit target directory.
 * @param {{theme?:string,registry?:string}} options Optional initial theme and scoped registry.
 * @returns {Promise<string>} Absolute created site directory.
 */
export async function createSite(directory, options = {}) {
  const target = path.resolve(directory);
  if (await exists(target) && (await readdir(target)).length) throw new Error('新站点目录必须为空；已有站点请使用 mintfolio init。');
  let registry;
  if (options.registry) {
    const url = new URL(options.registry);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('--registry 需要不带账号或查询参数的 HTTP(S) 仓库地址。');
    registry = url.href;
  }
  await mkdir(target, { recursive: true });
  const root = await realpath(target);
  const name = path.basename(root).toLowerCase().replace(/[^a-z0-9-]/g, '-') || 'mintfolio-site';
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name, private: true, version: '1.0.0', type: 'module' }, null, 2) + '\n', { flag: 'wx' });
  if (registry) await writeFile(path.join(root, '.npmrc'), `registry=https://registry.npmjs.org/\n@mintfolio:registry=${registry}\n`, { flag: 'wx' });
  await npm(['install', `@mintfolio/core@^${await cliVersion()}`, '--no-audit'], root);
  await initialize(root);
  if (options.theme && options.theme !== 'minimal') await installTheme(root, options.theme, true);
  console.log(`站点已创建：${root}\n进入目录后执行 mintfolio dev。`);
  return root;
}

/**
 * Diagnose the actual installed host and selected theme without changing files.
 * @param {string} root Site root.
 * @returns {Promise<object>} Runtime paths, versions and configuration status.
 */
export async function doctor(root) {
  if (!semver.gte(process.versions.node, '22.12.0')) throw new Error('需要 Node.js >= 22.12.0。');
  const host = createRequire(path.join(root, 'package.json'));
  const corePath = host.resolve('@mintfolio/core/package.json');
  const core = JSON.parse(await readFile(corePath, 'utf8'));
  const coreRequire = createRequire(corePath);
  const astro = JSON.parse(await readFile(coreRequire.resolve('astro/package.json'), 'utf8'));
  const active = await activeTheme(root, process.env.MINTFOLIO_THEME || undefined);
  const site = await getConfig(root, 'site');
  if (!site.site) throw new Error('site.config.ts 缺少 site 信息。');
  return { root, node: process.versions.node, cli: await cliVersion(), core: core.version, astro: astro.version, theme: active.selector, themeVersion: active.definition.manifest.version, config: active.themeConfigFile, themeConfigExists: await exists(active.themeConfigFile), status: 'ok' };
}
