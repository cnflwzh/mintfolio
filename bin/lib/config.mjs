import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'astro/zod';
import { activeTheme, readSelection } from './themes.mjs';
import { createThemeConfig } from '../theme-config.mjs';
import { loadTheme } from '../../src/engine/loader.mjs';
import { resolveSettings } from '../../src/engine/schema.mjs';
import { configSource, setSourceValue, sourceNode, sourceValue } from './config-source.mjs';
import { checkedPath, getIn, keyPath, saveFile, setIn } from './files.mjs';

const string = z.string();
const image = z.union([string, z.object({ src: string, width: z.number(), height: z.number(), format: string.optional() })]);
/** CLI input validation mirrors the public SiteConfigInput, without evaluating site imports. */
const siteSchema = z.object({
  site: z.object({
    title: string.refine(value => value.trim().length > 0, '标题不能为空'),
    url: string.url().refine(value => ['http:', 'https:'].includes(new URL(value).protocol), '域名须使用 HTTP 或 HTTPS'),
    description: string.optional(), language: string.optional(),
  }).strict(),
  profile: z.object({ name: string.optional(), avatar: image.optional(), bio: string.optional(), location: string.optional(), signature: string.optional() }).strict(),
  social: z.array(z.object({ platform: string, url: string, icon: string }).strict()),
  skills: z.array(z.object({ category: string, items: z.array(z.object({ name: string, level: z.number().min(0).max(100) }).strict()) }).strict()),
  projects: z.array(z.object({ title: string, description: string, link: string.optional(), repo: string.optional(), tags: z.array(string), image: string.optional() }).strict()),
  contact: z.object({ email: string.optional(), social: z.array(string).optional() }).strict(),
  icp: string,
}).strict();

function siteField(keys) {
  let field = siteSchema;
  for (const key of keys) {
    while (field instanceof z.ZodOptional) field = field.unwrap();
    if (field instanceof z.ZodObject) field = field.shape[key];
    else if (field instanceof z.ZodArray && /^(0|[1-9]\d*)$/.test(key)) field = field.element;
    else field = undefined;
    if (!field) throw new Error(`未知站点配置项：${keys.join('.')}`);
  }
  return field;
}

/**
 * Parse values against the target field. String fields keep numeric-looking text;
 * booleans/numbers/arrays/objects use JSON. --json forces explicit JSON parsing.
 * @param {string} raw Literal argument. @param {(value:unknown)=>unknown} validate Target validator.
 * @param {boolean} json Force JSON, including JSON strings.
 * @returns {unknown} Validated replacement value.
 */
export function inputValue(raw, validate, json = false) {
  if (!json) {
    try { return validate(raw); } catch {}
  }
  let parsed;
  try { parsed = JSON.parse(raw); }
  catch { throw new Error('值的类型不正确：布尔值使用 true/false，数字直接填写，数组和对象使用 JSON。'); }
  return validate(parsed);
}

/** @param {string} root @param {'site'|'theme'} scope @param {string} [selector] Theme selector for inactive settings. @returns {Promise<string>} Checked editable config path. */
export async function configFilename(root, scope, selector) {
  if (scope === 'site') {
    const selection = await readSelection(root);
    return checkedPath(root, path.resolve(root, selection.siteConfig || 'site.config.ts'));
  }
  if (scope === 'theme') {
    // Opening an editor must still work when the editable settings are invalid.
    const theme = selector || (await readSelection(root)).theme || 'minimal';
    return (await loadTheme({ root, theme, readUserConfig: false })).themeConfigFile;
  }
  throw new Error('配置范围为 site 或 theme。');
}

/** @param {string} root @param {'site'|'theme'} scope @param {string} [key] Optional dotted field. @param {string} [selector] @returns {Promise<unknown>} Literal site values or effective theme settings. */
export async function getConfig(root, scope, key, selector) {
  const keys = key ? keyPath(key) : [];
  let value;
  if (scope === 'theme') value = getIn((await activeTheme(root, selector)).settings, keys);
  else {
    const filename = await configFilename(root, scope, selector);
    const document = configSource(await readFile(filename, 'utf8'), filename);
    const node = sourceNode(document, keys);
    value = node ? sourceValue(document, node) : undefined;
  }
  if (value === undefined) throw new Error(`配置项未填写或不存在：${key}`);
  return value;
}

/**
 * Validate and edit one site/theme field, with source-preserving backup writes.
 * Existing legacy inline overrides remain authoritative, so edits target that
 * override when it owns the field; otherwise they target the theme-specific file.
 * @param {string} root Site root.
 * @param {'site'|'theme'} scope Which config family to change.
 * @param {string} key Dotted field path.
 * @param {string} raw Literal argument or JSON text.
 * @param {{theme?:string,json?:boolean}} [options] Optional inactive theme and forced JSON.
 * @returns {Promise<{filename:string,value:unknown,backup:string|null}>} Actual file, validated value and backup.
 */
export async function setConfig(root, scope, key, raw, options = {}) {
  const keys = keyPath(key);
  let filename;
  let value;
  let sourceKey = key;
  if (scope === 'site') {
    const field = siteField(keys);
    value = inputValue(raw, candidate => field.parse(candidate), options.json);
    filename = await configFilename(root, scope);
  } else if (scope === 'theme') {
    const active = await activeTheme(root, options.theme);
    const validate = candidate => {
      const settings = structuredClone(active.settings);
      setIn(settings, keys, candidate);
      resolveSettings(active.definition, settings);
      return candidate;
    };
    value = inputValue(raw, validate, options.json);
    if (active.same && getIn(active.selection.settings, keys) !== undefined) {
      filename = path.join(root, 'theme.config.mjs');
      sourceKey = `settings.${key}`;
    } else {
      filename = (await createThemeConfig(root, active.selector)).filename;
    }
  } else throw new Error('配置范围为 site 或 theme。');
  await checkedPath(root, filename);
  const original = await readFile(filename, 'utf8');
  const source = setSourceValue(original, sourceKey, value, filename);
  return { filename, value, backup: await saveFile(root, filename, original, source) };
}

/** @param {string} root @param {'site'|'theme'} scope @param {string} [selector] @returns {Promise<unknown>} Available setting names and constraints. */
export async function configSchema(root, scope, selector) {
  if (scope === 'theme') {
    const theme = selector || (await readSelection(root)).theme || 'minimal';
    return (await loadTheme({ root, theme, readUserConfig: false })).definition.settings;
  }
  if (scope !== 'site') throw new Error('配置范围为 site 或 theme。');
  return {
    site: ['title', 'url', 'description', 'language'],
    profile: ['name', 'avatar', 'bio', 'location', 'signature'],
    social: 'JSON 数组：{ platform, url, icon }',
    skills: 'JSON 数组：{ category, items: [{ name, level: 0–100 }] }',
    projects: 'JSON 数组：{ title, description, tags, link?, repo?, image? }',
    contact: { email: '字符串', social: '平台名字符串数组' },
    icp: '字符串',
  };
}
