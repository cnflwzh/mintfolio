import { mkdir, readFile, realpath, rename, stat, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { PROJECT_DIR } from '../../src/shared/layout.mjs';

/** Backups live in the project folder (or the article root for articles) and ignore themselves in Git. */
export const BACKUP_DIR = '.backups';

/** @param {string} filename @returns {Promise<boolean>} Whether a filesystem entry exists. */
export async function exists(filename) {
  try { await stat(filename); return true; }
  catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}

/** @param {string} directory @returns {Promise<boolean>} Whether directory holds Mintfolio's package and theme selection. */
async function isProject(directory) {
  return await exists(path.join(directory, 'package.json')) && await exists(path.join(directory, 'theme.config.mjs'));
}

/**
 * Find the site's project folder (_mintfolio) from the article root, an article
 * subdirectory or anywhere inside the project folder itself.
 * @param {string} start Working directory.
 * @returns {Promise<string>} Real _mintfolio path; CLI commands use it as their root.
 */
export async function findSite(start) {
  let directory = await realpath(start);
  while (true) {
    if (await isProject(path.join(directory, PROJECT_DIR))) return realpath(path.join(directory, PROJECT_DIR));
    if (path.basename(directory) === PROJECT_DIR && await isProject(directory)) return directory;
    if (await isProject(directory)) throw new Error(`${directory} 使用旧的站点布局：配置文件需要移到 ${PROJECT_DIR}/ 中，文章放在站点根目录。步骤见 Core 文档 docs/cli.md 的「从旧布局升级」。`);
    const parent = path.dirname(directory);
    if (parent === directory) throw new Error(`当前目录不在 Mintfolio 站点中（没有找到 ${PROJECT_DIR}/）。请进入站点，或运行 mintfolio init 把当前目录变成站点。`);
    directory = parent;
  }
}

/** @param {string} filename @param {string} root @returns {boolean} True when the path is contained by root. */
export function within(filename, root) {
  const relative = path.relative(root, filename);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Check both lexical and real ancestors before reading or writing host files.
 * @param {string} root Allowed site/content root.
 * @param {string} filename Absolute target, which may not exist yet.
 * @returns {Promise<string>} Checked absolute filename; escaping symlinks fail.
 */
export async function checkedPath(root, filename) {
  const base = await realpath(root);
  const target = path.resolve(filename);
  if (!within(target, base)) throw new Error('文件路径必须位于站点目录内。');
  let ancestor = target;
  while (!await exists(ancestor)) ancestor = path.dirname(ancestor);
  if (!within(await realpath(ancestor), base)) throw new Error('文件路径通过符号链接离开了站点目录。');
  return target;
}

/**
 * Replace one file only if it still matches the inspected version. Keep an exact
 * backup, then rename a complete sibling file so readers never see partial text.
 * @param {string} root Directory that must contain filename.
 * @param {string} filename Existing editable file within root.
 * @param {string} original Expected UTF-8 content.
 * @param {string} source Replacement UTF-8 content.
 * @param {string} [backupRoot] Folder whose .backups receives the copy; articles pass the project folder.
 * @returns {Promise<string|null>} Backup path, or null when unchanged.
 */
export async function saveFile(root, filename, original, source, backupRoot = root) {
  if (source === original) return null;
  await checkedPath(root, filename);
  if (await readFile(filename, 'utf8') !== original) throw new Error(`文件已被其他程序修改，请重试：${filename}`);
  const backup = path.join(backupRoot, BACKUP_DIR, `${Date.now()}-${randomUUID()}`, path.relative(root, filename));
  await checkedPath(backupRoot, backup);
  await mkdir(path.dirname(backup), { recursive: true });
  await writeFile(path.join(backupRoot, BACKUP_DIR, '.gitignore'), '# Mintfolio 修改文件前的备份，不需要提交。\n*\n', { flag: 'wx' }).catch(error => { if (error.code !== 'EEXIST') throw error; });
  await writeFile(backup, original, { flag: 'wx' });
  const temporary = path.join(path.dirname(filename), `.${path.basename(filename)}.${randomUUID()}.tmp`);
  try {
    await writeFile(temporary, source, { flag: 'wx', mode: (await stat(filename)).mode });
    if (await readFile(filename, 'utf8') !== original) throw new Error(`文件在保存前发生变化，请重试：${filename}`);
    await rename(temporary, filename);
  } finally {
    await unlink(temporary).catch(error => { if (error.code !== 'ENOENT') throw error; });
  }
  return backup;
}

/** @param {unknown} value @returns {string} Human-readable values or JSON for structured CLI output. */
export function display(value) { return typeof value === 'string' ? value : JSON.stringify(value, null, 2); }

/** @param {string} key Dotted field path. @returns {string[]} Safe property segments, including array indices. */
export function keyPath(key) {
  const keys = key.split('.');
  if (!key || keys.some(part => !/^(?:[A-Za-z_$][\w$-]*|0|[1-9]\d*)$/.test(part) || ['__proto__', 'prototype', 'constructor'].includes(part))) throw new Error(`无效配置路径：${key}`);
  return keys;
}

/** @param {unknown} object @param {string[]} keys @returns {unknown} Own-property lookup without executing expressions. */
export function getIn(object, keys) {
  let current = object;
  for (const key of keys) {
    if (!current || typeof current !== 'object' || !Object.hasOwn(current, key)) return undefined;
    current = current[key];
  }
  return current;
}

/** @param {Record<string,unknown>} object JSON-compatible settings clone. @param {string[]} keys @param {unknown} value */
export function setIn(object, keys, value) {
  let current = object;
  for (const key of keys.slice(0, -1)) {
    if (current[key] === undefined) current[key] = {};
    if (!current[key] || typeof current[key] !== 'object') throw new Error(`不能在非对象字段下添加设置：${key}`);
    current = current[key];
  }
  const last = keys.at(-1);
  if (Array.isArray(current) && (!/^(0|[1-9]\d*)$/.test(last) || Number(last) >= current.length)) throw new Error('数组下标超出范围；请用 JSON 设置完整数组。');
  current[last] = value;
}
