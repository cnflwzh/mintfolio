import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'astro/zod';
import { activeTheme, readSelection } from './themes.mjs';
import { normalizeThemeName } from '../theme-config.mjs';
import { loadTheme } from '../../src/engine/loader.mjs';
import { resolveSettings } from '../../src/engine/schema.mjs';
import { configSource, setSourceValue, sourceNode, sourceValue } from './config-source.mjs';
import { checkedPath, getIn, keyPath, saveFile, setIn } from './files.mjs';

const string = z.string();
const nonempty = string.refine(value => value.trim().length > 0, '字段不能为空');
const httpUrl = string.url().refine(value => /^https?:\/\//i.test(value), '需要 HTTP(S) URL');
const timezone = string.refine(value => {
  try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; }
  catch { return false; }
}, '需要有效的 IANA 时区，例如 Asia/Hong_Kong');
const navigationUrl = string.refine(value => {
  if (/^\/(?!\/)/.test(value)) return !/[\\\u0000-\u0020]/.test(value);
  try { return ['http:', 'https:'].includes(new URL(value).protocol); }
  catch { return false; }
}, '导航地址必须是站内根路径或 HTTP(S) URL');
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
  analytics: z.object({ google: z.object({ measurementId: string.trim().regex(/^G-[A-Z0-9]+$/, '需要 GA4 测量 ID，例如 G-XXXXXXXXXX'), enabled: z.boolean().optional() }).strict().optional() }).strict().optional(),
  blog: z.object({ pageSize: z.number().int().min(1).max(100).optional(), timezone: timezone.optional() }).strict().optional(),
  seo: z.object({ defaultSocialImage: string.optional(), twitterSite: string.optional() }).strict().optional(),
  feed: z.object({ limit: z.number().int().min(1).max(1000).optional(), content: z.enum(['summary', 'full']).optional() }).strict().optional(),
  authors: z.array(z.object({ id: nonempty, name: nonempty, url: httpUrl.optional(), avatar: string.optional(), bio: string.optional() }).strict()).refine(authors => new Set(authors.map(author => author.id)).size === authors.length, '作者 ID 不能重复').optional(),
  navigation: z.array(z.object({ id: nonempty, label: nonempty, url: navigationUrl }).strict()).optional(),
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
    // Settings live beside the selection; opening the file must work even when they are invalid.
    if (selector) await requireActive(root, selector);
    return checkedPath(root, path.join(root, 'theme.config.mjs'));
  }
  throw new Error('配置范围为 site 或 theme。');
}

/** @param {string} root @param {string} selector @returns {Promise<void>} Settings are only stored for the selected theme. */
async function requireActive(root, selector) {
  const current = normalizeThemeName((await readSelection(root)).theme || 'minimal');
  if (normalizeThemeName(selector) !== current) throw new Error(`theme.config.mjs 只保存当前主题（${current}）的设置。请先运行 mintfolio theme use ${selector}。`);
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
 * Theme fields are written under settings in theme.config.mjs.
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
    if (options.theme) await requireActive(root, options.theme);
    const active = await activeTheme(root);
    const validate = candidate => {
      const settings = structuredClone(active.settings);
      setIn(settings, keys, candidate);
      resolveSettings(active.definition, settings);
      return candidate;
    };
    value = inputValue(raw, validate, options.json);
    filename = path.join(root, 'theme.config.mjs');
    sourceKey = `settings.${key}`;
  } else throw new Error('配置范围为 site 或 theme。');
  await checkedPath(root, filename);
  const original = await readFile(filename, 'utf8');
  const source = setSourceValue(original, sourceKey, value, filename);
  if (scope === 'site' && ['authors', 'navigation'].includes(keys[0])) {
    // Validate the resulting registry as a unit so editing authors.1.id cannot
    // introduce a duplicate ID even when the edited scalar is individually valid.
    const document = configSource(source, filename);
    siteSchema.shape[keys[0]].parse(sourceValue(document, sourceNode(document, [keys[0]])));
  }
  return { filename, value, backup: await saveFile(root, filename, original, source) };
}

/** @param {string} root @param {'site'|'theme'} scope @param {string} [selector] @returns {Promise<unknown>} Available setting names and constraints. */
export async function configSchema(root, scope, selector) {
  if (scope === 'theme') {
    const theme = selector || (await readSelection(root)).theme || 'minimal';
    return (await loadTheme({ root, theme: normalizeThemeName(theme) })).definition.settings;
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
    analytics: { google: { measurementId: 'GA4 测量 ID，例如 G-XXXXXXXXXX', enabled: '布尔值，默认 true；仅生产构建启用' } },
    blog: { pageSize: '1–100 的整数，默认 10', timezone: 'IANA 时区，默认 UTC，例如 Asia/Hong_Kong' },
    seo: { defaultSocialImage: '默认分享图片地址', twitterSite: 'Twitter/X 账号，例如 @example' },
    feed: { limit: '1–1000 的整数，默认 50', content: 'summary 或 full' },
    authors: 'JSON 数组：{ id, name, url?, avatar?, bio? }，id 不重复，url 使用 HTTP(S)',
    navigation: 'JSON 数组：{ id, label, url }，url 使用站内根路径或 HTTP(S)',
  };
}
