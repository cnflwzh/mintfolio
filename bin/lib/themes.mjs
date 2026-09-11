import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import semver from 'semver';
import { createThemeConfig, normalizeThemeName } from '../theme-config.mjs';
import { loadTheme } from '../../src/engine/loader.mjs';
import { mergeThemeSettings } from '../../src/engine/theme-config.mjs';
import { resolveSettings } from '../../src/engine/schema.mjs';
import { configSource, setSourceValue, sourceNode, sourceValue } from './config-source.mjs';
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

/** @param {string} spec npm package with optional version/range/tag; default and happyhues are aliases. @returns {{name:string,spec:string}} Validated package identity and install spec. */
export function packageSpec(spec) {
  const separator = spec.lastIndexOf('@');
  const split = separator > spec.indexOf('/') && separator > 0;
  const name = normalizeThemeName(split ? spec.slice(0, separator) : spec);
  const version = split ? spec.slice(separator + 1) : '';
  if (typeof name !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name) || name === 'minimal' || (split && !version) || (version && !semver.validRange(version) && !/^[a-z][a-z0-9._-]*$/i.test(version))) throw new Error('请提供 npm 主题包名，可附加 @版本；例如 default 或 @mintfolio/theme-default@0.1.1。');
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
  const result = await createThemeConfig(root, pkg.name);
  console.log(`${result.created ? '已生成' : '已保留'} ${result.filename}`);
  if (use) await useTheme(root, pkg.name);
  else console.log(`启用主题：mintfolio theme use ${pkg.name}`);
}

/** Apply an object as individual source edits so unrelated comments remain intact. */
function mergeSource(source, value, prefix = []) {
  for (const [key, child] of Object.entries(value)) {
    const keys = [...prefix, key];
    if (child && typeof child === 'object' && !Array.isArray(child) && Object.keys(child).length) source = mergeSource(source, child, keys);
    else source = setSourceValue(source, keys.join('.'), child);
  }
  return source;
}

/**
 * Select an installed theme. Legacy inline settings are retained in the previous
 * theme's own file before clearing the inline override; both changes get backups.
 * @param {string} root Site root. @param {string} selector Installed theme/package or local directory.
 * @returns {Promise<void>} New selection is validated before persistent changes.
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
  const inline = selection.settings;
  let migration;
  if (inline && Object.keys(inline).length) {
    const current = await activeTheme(root);
    const doc = configSource(original, filename);
    const literal = sourceValue(doc, sourceNode(doc, ['settings']));
    if (JSON.stringify(literal) !== JSON.stringify(inline)) throw new Error('旧的内联 settings 包含动态表达式，请先移到对应主题配置文件再切换。');
    const result = await createThemeConfig(root, previous);
    const before = await readFile(result.filename, 'utf8');
    const after = mergeSource(before, inline);
    resolveSettings(current.definition, mergeThemeSettings(sourceValue(configSource(after)), {}));
    migration = { filename: result.filename, before, after };
    source = setSourceValue(source, 'settings', {}, filename);
  }
  await createThemeConfig(root, theme);
  // Check the selection again before the first mutation to avoid stale writes.
  if (await readFile(filename, 'utf8') !== original) throw new Error('主题选择已被其他程序修改，请重试。');
  if (migration) await saveFile(root, migration.filename, migration.before, migration.after);
  const backup = await saveFile(root, filename, original, source);
  console.log(`已启用 ${theme}`);
  if (migration) console.log(`旧主题设置已保留在 ${migration.filename}`);
  if (backup) console.log(`备份：${backup}`);
}
