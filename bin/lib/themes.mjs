import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { normalizeThemeName, settingsTemplate } from '../theme-config.mjs';
import { loadTheme } from '../../src/engine/loader.mjs';
import { setSourceText, setSourceValue } from './config-source.mjs';
import { checkedPath, exists, saveFile } from './files.mjs';
import { npm } from './process.mjs';

let revision = 0;

/** @param {string} root Site root. @returns {Promise<object>} Persistent theme selection, independent of a temporary environment override. */
export async function readSelection(root) {
  const filename = await checkedPath(root, path.join(root, 'theme.config.mjs'));
  const url = pathToFileURL(filename);
  url.searchParams.set('cli', `${Date.now()}-${++revision}`);
  const selection = (await import(url.href)).default;
  if (!selection || typeof selection !== 'object' || Array.isArray(selection)) throw new Error('theme.config.mjs 必须导出配置对象。');
  return selection;
}

/** @param {string} root @param {string} [selector] Explicit package, local theme or Minimal. @returns {Promise<object>} Validated selected theme and persistent selection. */
export async function activeTheme(root, selector) {
  const selection = await readSelection(root);
  const theme = normalizeThemeName(selector || selection.theme || 'minimal');
  const same = theme === normalizeThemeName(selection.theme || 'minimal');
  const active = await loadTheme({ root, theme, settings: same ? selection.settings : {}, overrides: same ? selection.overrides : {} });
  return { ...active, selection, selector: theme, same };
}

/** @param {string} spec npm package with optional version/range/tag; verdant is the official theme alias. @returns {{name:string,spec:string}} Validated package identity and install spec. */
export function packageSpec(spec) {
  const separator = spec.lastIndexOf('@');
  const split = separator > spec.indexOf('/') && separator > 0;
  const name = normalizeThemeName(split ? spec.slice(0, separator) : spec);
  const version = split ? spec.slice(separator + 1) : '';
  if (typeof name !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) || name === 'minimal' || (split && !version) || (version && !semver.validRange(version) && !/^[a-z][a-z0-9._-]*$/i.test(version))) throw new Error('请提供 npm 主题包名，可附加 @版本；例如 verdant 或 @mintfolio/theme-verdant@0.1.1。');
  return { name, spec: name + (version ? `@${version}` : '') };
}

/** @param {string} root @returns {Promise<Array<{name:string,version:string,selected:boolean}>>} Built-in Minimal and directly installed themes. */
export async function listThemes(root) {
  const selection = await readSelection(root);
  const selected = normalizeThemeName(selection.theme || 'minimal');
  const pkg = JSON.parse(await readFile(path.join(root, 'package.json'), 'utf8'));
  const themes = [{ name: 'minimal', version: 'built-in', selected: selected === 'minimal' }];
  const dependencies = { ...pkg.dependencies, ...pkg.devDependencies, ...pkg.optionalDependencies };
  for (const name of Object.keys(dependencies)) {
    const filename = path.join(root, 'node_modules', name, 'package.json');
    if (!await exists(filename)) continue;
    const installed = JSON.parse(await readFile(filename, 'utf8'));
    if (installed.exports?.['./theme'] && name !== '@mintfolio/core') themes.push({ name, version: installed.version, selected: selected === name });
  }
  if (!themes.some(theme => theme.name === selected)) themes.push({ name: selected, version: 'local', selected: true });
  return themes;
}

/** @param {string} root @param {string} spec npm theme spec. @param {boolean} use Select after a successful install. */
export async function installTheme(root, spec, use = false) {
  const pkg = packageSpec(spec);
  await npm(['install', pkg.spec, '--no-audit'], root);
  if (use) await useTheme(root, pkg.name);
  else console.log(`启用主题：mintfolio theme use ${pkg.name}`);
}

/** @param {object} selection @returns {boolean} Whether theme.config.mjs already holds any settings. */
function hasSettings(selection) {
  return Boolean(selection.settings && typeof selection.settings === 'object' && Object.keys(selection.settings).length);
}

/**
 * Select a theme and replace settings with its commented template. Settings
 * belong to one theme, so the previous values stay only in the backup.
 * @param {string} root Site root. @param {string} selector Installed theme/package or local directory.
 * @returns {Promise<void>} The new theme is validated before the file changes.
 */
export async function useTheme(root, selector) {
  const theme = normalizeThemeName(selector);
  const selection = await readSelection(root);
  const previous = normalizeThemeName(selection.theme || 'minimal');
  if (theme === previous) { await activeTheme(root, theme); console.log(`当前已使用 ${theme}`); return; }
  // Page overrides are intentional host choices; keep them and validate them with the new theme.
  await loadTheme({ root, theme, overrides: selection.overrides });
  const filename = path.join(root, 'theme.config.mjs');
  const original = await readFile(filename, 'utf8');
  let source = setSourceValue(original, 'theme', theme, filename);
  source = setSourceText(source, 'settings', await settingsTemplate(root, theme), filename);
  const backup = await saveFile(root, filename, original, source);
  console.log(`已启用 ${theme}，主题设置已写入 theme.config.mjs 的 settings。`);
  if (backup) console.log(`${hasSettings(selection) ? '原主题设置已备份到' : '备份'}：${backup}`);
}

/**
 * Write the active theme's commented settings template when settings are empty,
 * so every option is visible in theme.config.mjs. Existing settings are kept.
 * @param {string} root Site root.
 * @returns {Promise<{filename:string,created:boolean}>}
 */
export async function initThemeSettings(root) {
  const selection = await readSelection(root);
  const filename = path.join(root, 'theme.config.mjs');
  if (hasSettings(selection)) return { filename, created: false };
  const original = await readFile(filename, 'utf8');
  const source = setSourceText(original, 'settings', await settingsTemplate(root, selection.theme || 'minimal'), filename);
  await saveFile(root, filename, original, source);
  return { filename, created: true };
}
