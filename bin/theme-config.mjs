import { readFile, writeFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTheme, isWithin } from '../src/engine/loader.mjs';
import { resolveSettings } from '../src/engine/schema.mjs';
import { themeConfigPath } from '../src/engine/theme-config.mjs';

const aliases = { default: '@mintfolio/theme-default', happyhues: '@mintfolio/theme-default' };

/** @param {string} name Installed npm package or built-in theme selector. @returns {string} */
export function normalizeThemeName(name) { return Object.hasOwn(aliases, name) ? aliases[name] : name; }

/** Read package metadata without importing theme code or its configuration template. */
async function packageAt(directory) {
  try { return JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

/**
 * Theme packages opt into automatic discovery with mintfolio.configTemplate.
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
 * Create one editable host config from a theme-owned template or its full schema.
 * Existing files are never changed, including invalid or manually edited files.
 * @param {string} root Host root with installed dependencies.
 * @param {string} theme Installed package, local theme selector, or Minimal.
 * @returns {Promise<{filename:string,created:boolean}>} The host file and whether it was created.
 */
export async function createThemeConfig(root, theme) {
  const active = await loadTheme({root,theme:normalizeThemeName(theme),readUserConfig:false});
  const filename = themeConfigPath(root, active.definition.manifest.id);
  const template = await templateFor(active.manifestPath);
  let source;
  if (template) {
    // Templates are plain ESM settings owned by the installed package. Validate
    // their defaults with the same manifest that will validate host edits.
    resolveSettings(active.definition, (await import(pathToFileURL(template).href)).default);
    source = await readFile(template, 'utf8');
  } else {
    source = `/** ${active.definition.manifest.name.replace(/\*\//g,'')} 的设置。仅在选择此主题时生效；重复生成不会覆盖本文件。 */\nexport default {\n${schemaSource(active.definition.settings,active.settings)}\n};\n`;
  }
  try { await writeFile(filename, source, {flag:'wx'}); return {filename,created:true}; }
  catch (error) { if (error.code === 'EEXIST') return {filename,created:false}; throw error; }
}

/**
 * Find theme packages declared by this site, not arbitrary transitive packages.
 * Used by init/dev/build and the explicit sync command, independently of npm
 * dependency lifecycle permissions. It never changes the selected layout.
 * @param {string} root Host root.
 * @returns {Promise<Array<{filename:string,created:boolean}>>}
 */
export async function syncThemeConfigs(root) {
  try { await stat(path.join(root,'site.config.ts')); }
  catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  const pkg = await packageAt(root);
  if (!pkg) return [];
  const results = [await createThemeConfig(root,'minimal')];
  const dependencies = {...pkg.dependencies,...pkg.devDependencies,...pkg.optionalDependencies};
  for (const name of Object.keys(dependencies)) {
    const directory = path.resolve(root,'node_modules',name);
    if (!isWithin(directory,path.join(root,'node_modules'))) continue;
    const installed = await packageAt(directory);
    if (installed?.mintfolio?.configTemplate) results.push(await createThemeConfig(root,name));
  }
  return results;
}

/** @param {Array<{filename:string,created:boolean}>} results Report only new files during automatic sync. */
export function reportThemeConfigs(results) {
  for (const result of results) if (result.created) process.stdout.write(`Created ${path.basename(result.filename)}\n`);
}
