// @ts-check
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { resolve as resolveImport } from 'import-meta-resolve';
import { parse as parseAstro } from '@astrojs/compiler';
import { loadTheme, isWithin } from './loader.mjs';
import { readModuleImports, assertPublicThemeSpecifier, assertPublicThemeFile } from './import-boundary.mjs';

const VIRTUAL_ID = 'virtual:mintfolio/theme';
const RESOLVED_ID = `\0${VIRTUAL_ID}`;
const SITE_ID = 'virtual:mintfolio/site-config';
const RESOLVED_SITE_ID = `\0${SITE_ID}`;

/** @param {string} id Vite module id, possibly including an Astro script query. */
function filenameFromId(id) {
  const filename = id.split('?')[0].replace(/^\/@fs\//, '');
  return filename.startsWith('file:') ? fileURLToPath(filename) : path.normalize(filename);
}

/**
 * Inspect authored frontmatter/scripts before Astro rewrites special imports.
 * Using the official parser avoids treating examples in HTML or JSON as code.
 * @param {string} filename Absolute path to an authored Astro component.
 * @returns {Promise<string[]>} Executable module fragments only.
 */
async function astroModuleSources(filename) {
  const { ast } = await parseAstro(await readFile(filename, 'utf8'));
  /** @type {string[]} */
  const modules = [];
  /** @param {import('@astrojs/compiler/types').RootNode['children'][number]} node */
  const visit = (node) => {
    if (node.type === 'frontmatter') modules.push(node.value);
    if (node.type === 'element' && node.name === 'script') {
      const type = node.attributes.find((attribute) => attribute.name === 'type')?.value;
      if (!type || ['module', 'text/javascript', 'application/javascript'].includes(type)) {
        modules.push(node.children.filter((child) => child.type === 'text').map((child) => child.value).join('\n'));
      }
    } else if ('children' in node) node.children.forEach(visit);
  };
  ast.children.forEach(visit);
  return modules;
}

/**
 * Only Core installs this integration. Themes declare page paths; they receive
 * neither Astro integration hooks nor route injection callbacks.
 * @param {import('@mintfolio/theme-api').ThemeConfiguration} selection
 * @param {{routes?:boolean,siteConfig?:string}} [engine] Only the public Core entry enables owned routes.
 * @returns {import('astro').AstroIntegration}
 */
export default function themeRuntime(selection = {}, engine = {}) {
  return {
    name: 'mintfolio:theme-runtime',
    hooks: {
      'astro:config:setup': async ({ config, updateConfig, addWatchFile, injectRoute, command, logger }) => {
        const root = fileURLToPath(config.root);
        const themeName = process.env.MINTFOLIO_THEME || selection.theme;
        const changedSelection = Boolean(process.env.MINTFOLIO_THEME) && themeName !== selection.theme;
        const active = await loadTheme({ root, theme: themeName, settings: changedSelection ? {} : selection.settings, overrides: changedSelection ? {} : selection.overrides, fresh: command === 'dev' });
        const minimal = active.definition.manifest.id === 'minimal' && !themeName ? active : await loadTheme({ root, theme: 'minimal' });
        const siteConfig = path.resolve(root, engine.siteConfig ?? './site.config.ts');
        if (engine.routes) {
          addWatchFile(siteConfig);
          for (const [pattern, source] of [
            ['/', 'index.astro'], ['/about', 'about.astro'], ['/blog', 'blog/index.astro'],
            ['/blog/[...slug]', 'blog/[...slug].astro'], ['/404', '404.astro'],
            ['/rss.xml', 'rss.xml.ts'], ['/sitemap.xml', 'sitemap.xml.ts'],
          ]) injectRoute({ pattern, entrypoint: new URL(`../routes/${source}`, import.meta.url) });
        }
        // Themes declare supported toolchains, not arbitrary engine hooks. The
        // dependencies are resolved from the selected theme, so Core stays lean.
        if (active.definition.build?.react) {
          const react = (await import(resolveImport('@astrojs/react', pathToFileURL(active.manifestPath).href))).default;
          updateConfig({ integrations: [react()] });
        }
        if (active.definition.build?.tailwind) {
          const tailwind = (await import(resolveImport('@tailwindcss/vite', pathToFileURL(active.manifestPath).href))).default;
          updateConfig({ vite: { plugins: [tailwind()] } });
        }
        // Classify explicit override modules, never their entire parent directory:
        // a valid ./custom-post.astro must not classify the host itself as a theme.
        const themeModules = new Set(active.overrideEntries);
        const manifestPath = path.join(root, 'theme.config.mjs');
        addWatchFile(manifestPath);
        for (const filename of active.manifestDependencies) addWatchFile(filename);
        logger.info(`Theme: ${active.definition.manifest.name} ${active.definition.manifest.version}`);
        if (themeName === 'happyhues' || themeName === 'default') logger.warn('Use the installed package name "@mintfolio/theme-default". Only Minimal is bundled with Core.');
        const optionalMissing = ['page', 'archive', 'notFound'].filter((kind) => !active.pages[kind]);
        if (optionalMissing.length) logger.info(`Using lightweight Minimal renderers for: ${optionalMissing.join(', ')}`);
        /** @type {Array<keyof import('@mintfolio/theme-api').ThemeCapabilities>} */
        const features = ['search', 'tags', 'categories'];
        for (const capability of features) {
          if (!active.definition.capabilities[capability]) logger.warn(`${active.definition.manifest.id} does not declare ${capability}; its UI may omit that feature.`);
        }

        /** @type {import('vite').Plugin} */
        const plugin = {
          name: 'mintfolio:theme-module',
          enforce: 'pre',
          async transform(code, id) {
            const filename = filenameFromId(id);
            if (!(isWithin(filename, active.themeRoot) || themeModules.has(filename))) return null;
            if (!/\.(?:astro|[cm]?[jt]sx?)$/.test(filename)) return null;
            // A resolveId hook alone is insufficient: Astro can resolve its own
            // virtual collection module before a user plugin sees the specifier.
            const modules = filename.endsWith('.astro') ? await astroModuleSources(filename) : [code];
            for (const source of modules) {
              for (const specifier of await readModuleImports(source, filename)) assertPublicThemeSpecifier(specifier, filename);
            }
            return null;
          },
          async resolveId(source, importer, options) {
            const importerFile = importer ? filenameFromId(importer) : '';
            const isTheme = Boolean(importer) && (isWithin(importerFile, active.themeRoot) || themeModules.has(importerFile));
            if (isTheme) assertPublicThemeSpecifier(source, importerFile);
            if (source === VIRTUAL_ID) return RESOLVED_ID;
            if (source === SITE_ID) return RESOLVED_SITE_ID;
            if (!isTheme) return null;
            const resolved = await this.resolve(source, importer, { ...options, skipSelf: true });
            if (!resolved) return null;
            const filename = filenameFromId(resolved.id);
            assertPublicThemeFile(filename, root, importerFile, source);
            // Continue the boundary through user helpers. SDK/framework packages
            // own their implementation; theme-local helpers cannot launder a Core import.
            if (!resolved.external && path.isAbsolute(filename) && !isWithin(filename, path.join(root, 'node_modules')) && !isWithin(filename, path.join(root, 'packages/theme-api'))) {
              themeModules.add(filename);
            }
            return resolved;
          },
          load(id) {
            if (id === RESOLVED_SITE_ID) return `export { default } from ${JSON.stringify(siteConfig.replaceAll('\\', '/'))};`;
            if (id !== RESOLVED_ID) return null;
            // Explicit imports preserve Astro compilation and include only the
            // chosen renderer's dependency graph, including its own CSS/assets.
            const imports = [];
            const renderers = [];
            const fallbacks = [];
            for (const [kind, filename] of Object.entries(active.pages)) {
              imports.push(`import Page_${kind} from ${JSON.stringify(filename.replaceAll('\\', '/'))};`);
              renderers.push(`${JSON.stringify(kind)}: Page_${kind}`);
            }
            // Import only missing semantic pages. A full theme does not pay for
            // Minimal's document, article components, or client-side behaviors.
            for (const kind of ['page', 'archive', 'notFound']) {
              if (active.pages[kind]) continue;
              imports.push(`import Fallback_${kind} from ${JSON.stringify(minimal.pages[kind].replaceAll('\\', '/'))};`);
              fallbacks.push(`${JSON.stringify(kind)}: Fallback_${kind}`);
            }
            return `${imports.join('\n')}
export const activeTheme = ${JSON.stringify({ definition: active.definition, settings: active.settings })};
const pages = {${renderers.join(',')}};
const fallbacks = {${fallbacks.join(',')}};
export function getRenderer(kind) {
  if (pages[kind]) return pages[kind];
  if (kind === 'home' || kind === 'post') throw new Error('Missing required theme renderer: ' + kind);
  return fallbacks[kind] || fallbacks.archive;
}`;
          },
        };
        updateConfig({ vite: { plugins: [plugin] } });
      },
    },
  };
}
