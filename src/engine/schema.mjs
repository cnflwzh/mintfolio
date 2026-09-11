// @ts-check
import { z } from 'astro/zod';
import semver from 'semver';

/** Theme contract version; independent of the application and Astro versions. */
export const THEME_ENGINE_VERSION = '1.0.0';
export const PAGE_KINDS = ['home', 'post', 'page', 'archive', 'notFound'];

const label = { label: z.string().min(1), description: z.string().optional() };
const color = z.string().regex(/^#(?:[\da-f]{3}|[\da-f]{4}|[\da-f]{6}|[\da-f]{8})$/i, 'Expected a hexadecimal CSS color');
/** @type {import('astro/zod').z.ZodType<import('@mintfolio/theme-api').SettingDefinition>} */
const settingSchema = z.lazy(() => z.discriminatedUnion('type', [
  z.object({ ...label, type: z.literal('string'), default: z.string() }).strict(),
  z.object({ ...label, type: z.literal('boolean'), default: z.boolean() }).strict(),
  z.object({ ...label, type: z.literal('number'), default: z.number(), min: z.number().optional(), max: z.number().optional() }).strict(),
  z.object({ ...label, type: z.literal('select'), default: z.string(), options: z.array(z.string()).min(1) }).strict(),
  z.object({ ...label, type: z.literal('color'), default: color }).strict(),
  z.object({ ...label, type: z.literal('object'), default: z.record(z.string(), z.unknown()), properties: z.record(z.string(), settingSchema) }).strict(),
  z.object({ ...label, type: z.literal('array'), default: z.array(z.unknown()), items: settingSchema }).strict(),
]).superRefine((setting, context) => {
  if (setting.type === 'number') {
    if ((setting.min !== undefined && setting.default < setting.min) || (setting.max !== undefined && setting.default > setting.max) || (setting.min !== undefined && setting.max !== undefined && setting.min > setting.max)) {
      context.addIssue({ code: 'custom', message: 'The default and bounds must describe a valid number interval' });
    }
  }
  if (setting.type === 'select' && (!setting.options.includes(setting.default) || new Set(setting.options).size !== setting.options.length)) {
    context.addIssue({ code: 'custom', message: 'Select options must be unique and include the default' });
  }
}));

const pagePath = z.string().startsWith('./').endsWith('.astro');
const pagesSchema = z.object({
  home: pagePath, post: pagePath,
  page: pagePath.optional(), archive: pagePath.optional(), notFound: pagePath.optional(),
}).strict();

const definitionSchema = z.object({
  manifest: z.object({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    name: z.string().min(1), version: z.string().refine((value) => semver.valid(value) !== null, 'Invalid semantic version'),
    author: z.string().min(1), description: z.string().min(1),
    engine: z.string().refine((value) => semver.validRange(value) !== null, 'Invalid engine range'),
  }).strict(),
  capabilities: z.object({
    search: z.boolean().default(false), tags: z.boolean().default(false), categories: z.boolean().default(false),
    toc: z.boolean().default(false), darkMode: z.boolean().default(false), encryptedPosts: z.boolean().default(false),
    comments: z.boolean().default(false), i18n: z.boolean().default(false),
  }).strict().default({ search: false, tags: false, categories: false, toc: false, darkMode: false, encryptedPosts: false, comments: false, i18n: false }),
  pages: pagesSchema,
  settings: z.record(z.string(), settingSchema).default({}),
  build: z.object({ react: z.boolean().optional(), tailwind: z.boolean().optional() }).strict().optional(),
}).strict();

/**
 * Parse untrusted theme metadata before any renderer is imported.
 * Errors include the field path and source so both CLI and build logs are useful.
 * @param {unknown} input Module default export.
 * @param {string} source Manifest path used in diagnostics.
 * @returns {import('@mintfolio/theme-api').ThemeDefinition}
 */
export function validateTheme(input, source) {
  const result = definitionSchema.safeParse(input);
  if (!result.success) {
    const details = result.error.issues.map((issue) => `${issue.path.join('.') || 'theme'}: ${issue.message}`).join('\n');
    throw new Error(`[theme:manifest] ${source}\n${details}`);
  }
  if (!semver.satisfies(THEME_ENGINE_VERSION, result.data.manifest.engine)) {
    throw new Error(`[theme:engine] ${result.data.manifest.id} requires ${result.data.manifest.engine}; runtime is ${THEME_ENGINE_VERSION}`);
  }
  // Validate nested defaults through the same path used for user overrides.
  resolveSettings(result.data, {});
  return result.data;
}

/**
 * Resolve declarative visual settings. Unknown keys and invalid values fail early
 * instead of silently producing a partially configured theme.
 * @param {import('@mintfolio/theme-api').ThemeDefinition} definition Validated theme.
 * @param {unknown} input User overrides; defaults are applied when absent.
 * @returns {Record<string, unknown>}
 */
export function resolveSettings(definition, input = {}) {
  const user = z.record(z.string(), z.unknown()).parse(input);
  return resolveObject(definition.settings, user, definition.manifest.id);
}

/**
 * Recursively merge validated object defaults, preserving explicit array order.
 * @param {import('@mintfolio/theme-api').SettingsSchema} schema
 * @param {Record<string, unknown>} user
 * @param {string} field
 * @returns {Record<string, unknown>}
 */
function resolveObject(schema, user, field) {
  /** @type {Record<string, unknown>} */
  const values = {};
  for (const key of Object.keys(user)) {
    if (!Object.hasOwn(schema, key)) throw new Error(`[theme:settings] ${field}.${key}: unknown setting`);
  }
  for (const [key, setting] of Object.entries(schema)) {
    const value = resolveValue(setting, Object.hasOwn(user, key) ? user[key] : setting.default, `${field}.${key}`);
    Object.defineProperty(values, key, { value, enumerable: true });
  }
  return values;
}

/** @param {import('@mintfolio/theme-api').SettingDefinition} setting @param {unknown} value @param {string} field @returns {unknown} */
function resolveValue(setting, value, field) {
  let valid = false;
  switch (setting.type) {
    case 'boolean': valid = typeof value === 'boolean'; break;
    case 'number': valid = typeof value === 'number' && Number.isFinite(value) && (setting.min === undefined || value >= setting.min) && (setting.max === undefined || value <= setting.max); break;
    case 'select': valid = typeof value === 'string' && setting.options.includes(value); break;
    case 'color': valid = color.safeParse(value).success; break;
    case 'string': valid = typeof value === 'string'; break;
    case 'array':
      if (Array.isArray(value)) return value.map((item, index) => resolveValue(setting.items, item, `${field}[${index}]`));
      break;
    case 'object':
      if (value && typeof value === 'object' && !Array.isArray(value)) return resolveObject(setting.properties, { ...setting.default, ...value }, field);
      break;
  }
  if (!valid) throw new Error(`[theme:settings] ${field}: invalid ${setting.type} value`);
  return value;
}
