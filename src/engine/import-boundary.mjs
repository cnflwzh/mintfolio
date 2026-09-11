// @ts-check
import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { init, parse } from 'es-module-lexer';
import { resolve as resolveImport } from 'import-meta-resolve';

const PRIVATE_SPECIFIERS = new Set(['astro:content', 'astro/loaders', 'node:fs', 'node:fs/promises', 'fs', 'fs/promises']);
const PRIVATE_DIRECTORIES = ['src/core', 'src/theme', 'src/lib', 'src/utils', 'src/scripts', 'src/pages', 'content', 'src/content'];
const PRIVATE_CONFIGS = ['site.config.ts', 'theme.config.mjs', 'astro.config.mjs', 'src/content.config.ts'];
const CORE_ROOT = fileURLToPath(new URL('../../', import.meta.url));

/** @param {string} filename @param {string} directory @returns {boolean} */
function isWithin(filename, directory) {
  const relative = path.relative(directory, filename);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}

/**
 * Read static imports, re-exports, and literal dynamic imports without executing
 * the module. Vite callers may ignore computed imports that Vite expands later;
 * native manifest loading rejects them because it has no such expansion step.
 * This inspects module dependencies, not arbitrary JavaScript execution.
 * @param {string} source JavaScript module source (Astro callers extract scripts first).
 * @param {string} importer Filename used in actionable diagnostics.
 * @param {{rejectComputedImports?:boolean}} options
 * @returns {Promise<string[]>} Decoded import specifiers, excluding import.meta.
 */
export async function readModuleImports(source, importer, { rejectComputedImports = false } = {}) {
  await init;
  let imports;
  try {
    [imports] = parse(source, importer);
  } catch {
    throw new Error(`[theme:boundary] Cannot inspect module imports in ${importer}; use valid ES module syntax`);
  }
  const specifiers = [];
  for (const entry of imports) {
    if (entry.d === -2) continue; // import.meta is metadata, not a dependency.
    if (entry.n !== undefined) specifiers.push(entry.n);
    else if (rejectComputedImports) {
      throw new Error(`[theme:boundary] ${importer} uses a computed import; manifest helpers must use literal module specifiers`);
    }
  }
  return specifiers;
}

/**
 * Reject private entry points before resolver plugins consume them.
 * @param {string} specifier Module identifier from the theme source.
 * @param {string} importer Filename used in diagnostics.
 */
export function assertPublicThemeSpecifier(specifier, importer) {
  if ((specifier === '@mintfolio/core' || specifier.startsWith('@mintfolio/core/')) &&
    !['@mintfolio/core/theme', '@mintfolio/core/astro', '@mintfolio/core/client', '@mintfolio/core/search'].includes(specifier) &&
    !specifier.startsWith('@mintfolio/core/components/')) {
    throw new Error(`[theme:boundary] ${importer} cannot import host-only Core entry ${specifier}; use its public theme API`);
  }
  if (PRIVATE_SPECIFIERS.has(specifier) || specifier.startsWith('virtual:mintfolio/')) {
    throw new Error(`[theme:boundary] ${importer} cannot import ${specifier}; consume the public SDK and page props`);
  }
}

/**
 * Apply the same host-private path policy to native manifests and Vite modules.
 * Resolvers must supply a real absolute path, with Vite queries already removed.
 * path.relative also treats equivalent casing consistently on Windows.
 * @param {string} filename Resolved dependency filename.
 * @param {string} root Host project root.
 * @param {string} importer Theme module that requested the dependency.
 * @param {string} specifier Original import text for diagnostics.
 */
export function assertPublicThemeFile(filename, root, importer, specifier = filename) {
  const privateDirectory = PRIVATE_DIRECTORIES.some((directory) => isWithin(filename, path.join(root, directory)));
  const privateConfig = PRIVATE_CONFIGS.some((config) => path.relative(path.join(root, config), filename) === '');
  const corePrivate = ['src/server', 'src/engine', 'src/routes'].some((directory) => isWithin(filename, path.join(CORE_ROOT, directory)));
  if (privateDirectory || privateConfig || corePrivate) {
    throw new Error(`[theme:boundary] ${importer} imports private host module ${specifier}`);
  }
}

/**
 * .js/.ts helpers need an explicit ESM package scope; CommonJS require() is not
 * part of this static import contract. Explicit .mjs/.mts helpers need no scope.
 * @param {string} filename Real helper filename.
 * @returns {Promise<boolean>}
 */
async function isEsmHelper(filename) {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.mjs' || extension === '.mts') return true;
  if (extension !== '.js' && extension !== '.ts') return false;
  let directory = path.dirname(filename);
  while (true) {
    const packageSource = await readFile(path.join(directory, 'package.json'), 'utf8').catch(() => null);
    if (packageSource !== null) {
      try { return JSON.parse(packageSource).type === 'module'; }
      catch { return false; }
    }
    const parent = path.dirname(directory);
    if (parent === directory) return false;
    directory = parent;
  }
}

/**
 * Check the manifest's local ESM graph before native import evaluates any of it.
 * Literal package imports use their public exports; local helpers, including
 * helpers outside the theme directory, are followed after realpath resolution.
 * Package implementations remain dependencies rather than host/theme internals.
 * This is a development contract check, not a sandbox for untrusted JavaScript.
 * @param {string} manifestPath Real filename of the selected theme.mjs.
 * @param {string} root Host project root used for private-path checks.
 * @returns {Promise<string[]>} Inspected source files, for diagnostics/dev tooling.
 */
export async function checkManifestImports(manifestPath, root) {
  /** @type {Set<string>} */
  const visited = new Set();

  /** @param {string} filename */
  async function inspect(filename) {
    if (visited.has(filename)) return;
    visited.add(filename);
    const source = await readFile(filename, 'utf8');
    for (const specifier of await readModuleImports(source, filename, { rejectComputedImports: true })) {
      assertPublicThemeSpecifier(specifier, filename);
      let resolved;
      try {
        resolved = resolveImport(specifier, pathToFileURL(filename).href);
      } catch {
        throw new Error(`[theme:boundary] Cannot resolve ${specifier} imported by ${filename}`);
      }
      if (resolved.startsWith('node:')) continue;
      if (!resolved.startsWith('file:')) {
        throw new Error(`[theme:boundary] ${filename} must import local modules or installed packages, received ${specifier}`);
      }
      const dependency = await realpath(fileURLToPath(resolved));
      assertPublicThemeFile(dependency, root, filename, specifier);

      const packageImport = !specifier.startsWith('.') && !specifier.startsWith('/') && !specifier.startsWith('file:') && !specifier.startsWith('#') && !path.isAbsolute(specifier);
      // Resolving a package's public export is sufficient here. Following the
      // SDK's or a framework's internals would incorrectly classify them as themes.
      if (packageImport) continue;
      const extension = path.extname(dependency).toLowerCase();
      if (extension === '.json') continue; // Data cannot import another module.
      if (!await isEsmHelper(dependency)) {
        throw new Error(`[theme:boundary] ${filename} imports ${specifier}; local manifest helpers must use .mjs/.mts or a package with type: "module"`);
      }
      await inspect(dependency);
    }
  }

  await inspect(manifestPath);
  return [...visited];
}
