// @ts-check
import { stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

let revision = 0;

/** @param {unknown} value @returns {value is Record<string, unknown>} */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

/**
 * A theme gets one predictable settings file in the host root. Theme ids must
 * already satisfy the manifest rules; never accept directory components here.
 * @param {string} root Absolute host project root.
 * @param {string} id Validated theme manifest id.
 * @returns {string} Absolute host-owned settings filename.
 */
export function themeConfigPath(root, id) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) throw new Error('[theme:config] Invalid theme id');
  return path.join(root, `theme-${id}.config.mjs`);
}

/**
 * Merge a theme settings file with legacy inline settings. Inline values win;
 * nested objects merge recursively, while arrays are replaced as complete lists.
 * @param {unknown} fileSettings Default export of the theme-specific config.
 * @param {unknown} inlineSettings Explicit theme.config.mjs settings.
 * @returns {Record<string, unknown>} Unvalidated combined settings, without mutating either input.
 */
export function mergeThemeSettings(fileSettings, inlineSettings) {
  if (!isRecord(fileSettings) || !isRecord(inlineSettings)) throw new Error('[theme:config] Settings must be a plain object');
  return Object.fromEntries([...new Set([...Object.keys(fileSettings), ...Object.keys(inlineSettings)])].map((key) => {
    if (!Object.hasOwn(inlineSettings, key)) return [key, fileSettings[key]];
    const fromFile = fileSettings[key];
    const inline = inlineSettings[key];
    return [key, isRecord(fromFile) && isRecord(inline) ? mergeThemeSettings(fromFile, inline) : inline];
  }));
}

/**
 * Read the site's own ESM settings. Missing files preserve existing defaults;
 * syntax errors and invalid exports fail with the exact editable filename.
 * @param {string} root Absolute host root.
 * @param {string} id Validated manifest id.
 * @returns {Promise<{filename:string, settings:Record<string,unknown>}>}
 */
export async function readThemeSettings(root, id) {
  const filename = themeConfigPath(root, id);
  try { await stat(filename); }
  catch (error) {
    if (/** @type {NodeJS.ErrnoException} */ (error).code === 'ENOENT') return { filename, settings: {} };
    throw error;
  }
  try {
    // A config watcher restarts the integration; do not reuse the previous ESM value.
    const entry = pathToFileURL(filename);
    entry.searchParams.set('revision', `${Date.now()}-${++revision}`);
    const value = (await import(entry.href)).default;
    if (!isRecord(value)) throw new Error('default export must be a plain settings object');
    return { filename, settings: value };
  } catch (error) {
    throw new Error(`[theme:config] ${filename}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
  }
}
