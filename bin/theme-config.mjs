import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTheme, isWithin } from '../src/engine/loader.mjs';
import { resolveSettings } from '../src/engine/schema.mjs';
import { objectText } from './lib/config-source.mjs';

const aliases = { verdant: '@mintfolio/theme-verdant' };

/** @param {string} name Installed npm package or built-in theme selector. @returns {string} */
export function normalizeThemeName(name) { return Object.hasOwn(aliases, name) ? aliases[name] : name; }

/** Read package metadata without importing theme code or its configuration template. */
async function packageAt(directory) {
  try { return JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/**
 * Theme packages may ship a commented settings template with mintfolio.configTemplate.
 * The path is relative to the owning package, checked after resolving symlinks.
 * @param {string} manifestPath Resolved theme.mjs path.
 * @returns {Promise<string|null>} Safe template filename, or generic schema generation.
 */
async function templateFor(manifestPath) {
  let directory = path.dirname(manifestPath);
  while (directory !== path.dirname(directory)) {
    const pkg = await packageAt(directory);
    if (pkg) {
      const relative = pkg.mintfolio?.configTemplate;
      if (relative === undefined) return null;
      if (typeof relative !== 'string' || !relative.startsWith('./') || !relative.endsWith('.mjs')) throw new Error('[theme:config] configTemplate must be a relative .mjs file');
      const filename = await realpath(path.resolve(directory, relative));
      if (!isWithin(filename, await realpath(directory)) || !(await stat(filename)).isFile()) throw new Error('[theme:config] Template escapes its package');
      return filename;
    }
    directory = path.dirname(directory);
  }
  return null;
}

/** Render all schema fields, including commented examples for initially empty arrays. */
function schemaSource(schema, values, depth=1) {
  const indent = '  '.repeat(depth);
  return Object.entries(schema).flatMap(([name, setting]) => {
    const help = [setting.label, setting.description,
      setting.type === 'select' ? `可选值：${setting.options.join(' / ')}` : null,
      setting.type === 'number' ? `范围：${setting.min ?? '不限'} 至 ${setting.max ?? '不限'}` : null,
    ].filter(Boolean).join('；').replace(/[\r\n\u2028\u2029]+/g, ' ');
    const value = Object.hasOwn(values, name) ? values[name] : setting.default;
    const key = JSON.stringify(name);
    if (setting.type === 'object') return [`${indent}// ${help}`, `${indent}${key}: {`, schemaSource(setting.properties, value, depth+1), `${indent}},`];
    if (setting.type === 'array' && value.length === 0 && setting.items.type === 'object') {
      const sample = [`${indent}  {`,schemaSource(setting.items.properties,setting.items.default,depth+2),`${indent}  },`].join('\n').split('\n').map((line)=>`${indent}  // ${line.slice(indent.length+2)}`).join('\n');
      return [`${indent}// ${help}`,`${indent}${key}: [`,sample,`${indent}],`];
    }
    return [`${indent}// ${help}`, `${indent}${key}: ${JSON.stringify(value)},`];
  }).join('\n');
}

/**
 * Commented settings for one theme, written into theme.config.mjs as `settings`.
 * A package template is validated against the same manifest that validates host
 * edits; themes without one get every schema field with its default.
 * @param {string} root Host root with installed dependencies.
 * @param {string} theme Installed package, local theme selector, or Minimal.
 * @returns {Promise<string>} Object literal source starting with `{`.
 */
export async function settingsTemplate(root, theme) {
  const active = await loadTheme({ root, theme: normalizeThemeName(theme) });
  const template = await templateFor(active.manifestPath);
  if (template) {
    resolveSettings(active.definition, (await import(pathToFileURL(template).href)).default);
    return objectText(await readFile(template, 'utf8'), template);
  }
  if (!Object.keys(active.definition.settings).length) return '{}';
  return `{\n${schemaSource(active.definition.settings, active.settings)}\n}`;
}
