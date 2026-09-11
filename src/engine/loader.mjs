// @ts-check
import { realpath, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { resolve as resolveImport } from 'import-meta-resolve';
import semver from 'semver';
import { PAGE_KINDS, validateTheme, resolveSettings } from './schema.mjs';
import { checkManifestImports } from './import-boundary.mjs';
import { mergeThemeSettings, readThemeSettings, themeConfigPath } from './theme-config.mjs';

let manifestRevision = 0;

/** @param {string} filename @param {string} directory @returns {boolean} */
export function isWithin(filename, directory) {
  const relative = path.relative(directory, filename);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Locate the explicit theme entry. Packages must export './theme'; there is no
 * implicit search through dependencies and no automatic same-name override.
 * @param {string | undefined} specifier Omitted/Minimal, directory/manifest path, or installed npm name.
 * @param {string} root Host project root.
 * @returns {Promise<string>} Real manifest filename.
 */
async function resolveManifest(specifier, root) {
  let filename;
  if (!specifier || specifier === 'minimal') {
    filename = fileURLToPath(new URL('../fallback/theme.mjs', import.meta.url));
  } else if (specifier === 'verdant') {
    return resolveManifest('@mintfolio/theme-verdant', root);
  } else if (specifier.startsWith('.') || path.isAbsolute(specifier)) {
    filename = path.resolve(root, specifier);
    if ((await stat(filename)).isDirectory()) filename = path.join(filename, 'theme.mjs');
  } else {
    const require = createRequire(path.join(root, 'package.json'));
    filename = fileURLToPath(resolveImport(`${specifier}/theme`, pathToFileURL(path.join(root, 'package.json')).href));
    // A package's renderer version is separate from its Theme API engine range.
    const manifestDirectory = path.dirname(filename);
    let directory = manifestDirectory;
    while (directory !== path.dirname(directory)) {
      try {
        const packageData = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
        if (packageData.name === specifier) {
          const astroRange = packageData.peerDependencies?.astro;
          const installedAstro = JSON.parse(await readFile(require.resolve('astro/package.json'), 'utf8')).version;
          if (astroRange && !semver.satisfies(installedAstro, astroRange)) throw new Error(`[theme:renderer] ${specifier} requires Astro ${astroRange}; installed ${installedAstro}`);
          break;
        }
      } catch (error) {
        if (error instanceof Error && error.message.startsWith('[theme:renderer]')) throw error;
      }
      directory = path.dirname(directory);
    }
  }
  return realpath(filename);
}

/**
 * Validate one renderer path after resolving symlinks. Theme declarations stay
 * within the theme; explicit user overrides stay within the host workspace.
 * @param {string} source Relative renderer filename.
 * @param {string} directory Allowed root and resolution base.
 * @param {string} kind Semantic page key for diagnostics.
 * @returns {Promise<string>}
 */
async function resolvePage(source, directory, kind) {
  const filename = await realpath(path.resolve(directory, source));
  if (!isWithin(filename, await realpath(directory)) || path.extname(filename) !== '.astro' || !(await stat(filename)).isFile()) {
    throw new Error(`[theme:page] ${kind}: renderer must be an Astro file inside ${directory}`);
  }
  return filename;
}

/**
 * Load a single theme for the current build. The caller owns routes and Vite
 * compilation; this function never runs Astro components or writes resources.
 * @param {{root:string, theme?:string, settings?:unknown, overrides?:{pages?:Record<string,string>}, fresh?:boolean, readUserConfig?:boolean}} options
 * readUserConfig is disabled only while creating configuration files; normal loads
 * always combine the host's theme-specific file with explicit inline settings.
 */
export async function loadTheme({ root, theme, settings = {}, overrides = {}, fresh = false, readUserConfig = true }) {
  const manifestPath = await resolveManifest(theme, root);
  const themeRoot = path.dirname(manifestPath);
  // Native ESM loading does not run Vite's hooks. Inspect its local dependency
  // graph first so a forbidden helper cannot execute before schema validation.
  const manifestDependencies = await checkManifestImports(manifestPath, root);
  const entryUrl = pathToFileURL(manifestPath);
  // Development restarts need a fresh manifest, not Node's old ESM module entry.
  if (fresh) entryUrl.searchParams.set('revision', `${Date.now()}-${++manifestRevision}`);
  const definition = validateTheme((await import(entryUrl.href)).default, manifestPath);
  const userConfig = readUserConfig ? await readThemeSettings(root, definition.manifest.id)
    : { filename: themeConfigPath(root, definition.manifest.id), settings: {} };
  const resolvedSettings = resolveSettings(definition, mergeThemeSettings(userConfig.settings, settings));
  /** @type {Record<string,string>} */
  const pages = {};
  for (const [kind, source] of Object.entries(definition.pages)) {
    if (source) pages[kind] = await resolvePage(source, themeRoot, kind);
  }
  const overrideRoots = [];
  const overrideEntries = [];
  if (Object.keys(overrides).some((key) => key !== 'pages')) throw new Error('[theme:overrides] Only explicit pages overrides are supported');
  for (const [kind, source] of Object.entries(overrides.pages ?? {})) {
    if (!PAGE_KINDS.includes(kind) || typeof source !== 'string') throw new Error(`[theme:overrides] Invalid page ${kind}`);
    const filename = await resolvePage(source, root, kind);
    const relative = path.relative(root, filename).replaceAll('\\', '/');
    if (relative.startsWith('src/core/') || relative.startsWith('src/pages/') || relative.startsWith('src/theme/') || relative.startsWith('packages/core/src/engine/') || relative.startsWith('packages/core/src/server/') || relative.startsWith('packages/core/src/routes/')) throw new Error(`[theme:overrides] ${kind}: Core files cannot be used as theme overrides`);
    pages[kind] = filename;
    overrideRoots.push(path.dirname(filename));
    overrideEntries.push(filename);
  }
  return { definition, settings: resolvedSettings, pages, manifestPath, manifestDependencies, themeRoot, overrideRoots, overrideEntries, themeConfigFile: userConfig.filename };
}
