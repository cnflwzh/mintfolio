import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const cacheRoot = path.join(workspace, '.cache');
const parentRoot = path.join(cacheRoot, 'theme-boundaries');
const sdkSource = path.resolve(fileURLToPath(import.meta.resolve('@mintfolio/theme-api')), '../..');
const integrationUrl = pathToFileURL(path.join(workspace, 'src/engine/integration.mjs')).href;

/** All fixture writes remain in new workspace-local directories; none are deleted. */
function assertWithin(filename, directory) {
  const relative = path.relative(directory, filename);
  assert.ok(relative && relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative), `${filename} must stay within ${directory}`);
}

/** Run the already-installed Astro CLI directly; this never installs dependencies. */
async function build(root, cli) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [cli, 'build'], {
      cwd: root, shell: false, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ASTRO_TELEMETRY_DISABLED: '1', MINTFOLIO_THEME: './theme' },
    });
    let output = '';
    child.stdout.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.stderr.setEncoding('utf8').on('data', (chunk) => { output += chunk; });
    child.on('error', reject);
    child.on('close', (code) => { resolve({ code, output }); });
  });
}

/**
 * Cases exercise the actual Astro/Vite resolver. Negative cases must fail with
 * the boundary's diagnostic, not an unrelated syntax error or missing module.
 */
const cases = [
  {
    name: 'public-core-components-and-controller', allowed: true,
    home: `---\nimport SeoHead from '@mintfolio/core/components/SeoHead.astro';\nimport { createPostListController } from '@mintfolio/core/client';\nconst list = createPostListController({items: [], index: () => {throw new Error('empty');}});\nconst seo = {title: 'CORE_PUBLIC_OK', description: '', language: 'en', canonical: 'https://fixture.example/', robots: 'index,follow' as const};\n---\n<html><head><SeoHead seo={seo} /></head><body><main>CORE_PUBLIC_OK {list.value().total}</main></body></html>`,
    expectedText: ['CORE_PUBLIC_OK'],
  },
  {
    name: 'core-host-only-content-entry', allowed: false,
    home: `---\nimport { createBlogCollection } from '@mintfolio/core/content';\n---\n<main>{typeof createBlogCollection}</main>`,
  },
  {
    name: 'installed-core-private-path', allowed: false,
    home: `---\nimport { THEME_ENGINE_VERSION } from ${JSON.stringify(path.join(workspace, 'src/engine/schema.mjs').replaceAll('\\', '/'))};\n---\n<main>{THEME_ENGINE_VERSION}</main>`,
  },
  {
    name: 'public-sdk-and-shared-helper', allowed: true,
    home: `---\nimport SeoHead from '@mintfolio/theme-api/SeoHead.astro';\nimport { emptyFilters } from '@mintfolio/theme-api/search';\nimport { message } from '../../shared/public.mjs';\nconst seo = {title: 'SDK helper fixture', description: 'Public imports', language: 'en', canonical: 'https://fixture.example/', robots: 'index,follow' as const};\n---\n<html><head><SeoHead seo={seo} /></head><body><main>{message} {emptyFilters().q === '' ? 'SDK_FILTER_OK' : 'unexpected'}</main></body></html>`,
    expectedText: ['PUBLIC_HELPER_OK', 'SDK_FILTER_OK', 'SDK helper fixture'],
  },
  {
    name: 'direct-core-import', allowed: false,
    home: `---\nimport { marker } from '../../src/core/private.mjs';\n---\n<main>{marker}</main>`,
  },
  {
    name: 'aliased-core-import', allowed: false,
    home: `---\nimport { marker } from '@fixture-private';\n---\n<main>{marker}</main>`,
  },
  {
    name: 'transitive-core-import', allowed: false,
    home: `---\nimport { marker } from '../../shared/bridge.mjs';\n---\n<main>{marker}</main>`,
  },
  {
    name: 'raw-astro-collection-import', allowed: false,
    home: `---\nimport { getCollection } from 'astro:content';\nconst posts = await getCollection('blog');\n---\n<main>{posts.length}</main>`,
  },
  {
    name: 'manifest-direct-core-import', allowed: false,
    home: '<main>Manifest boundary fixture</main>',
    manifestImport: `import { marker } from '../src/core/manifest-private.mjs';`,
  },
  {
    name: 'manifest-transitive-core-import', allowed: false,
    home: '<main>Manifest boundary fixture</main>',
    manifestImport: `import { marker } from '../shared/manifest-bridge.mjs';`,
  },
  {
    name: 'manifest-safe-shared-helper', allowed: true,
    home: `<main>SAFE_MANIFEST_HELPER_OK {Astro.props.manifestAuthor}</main>`,
    manifestImport: `import { fixtureAuthor } from './manifest-helper.mjs';`,
    manifestAuthor: true,
    expectedText: ['SAFE_MANIFEST_HELPER_OK', 'Safe fixture author'],
  },
  {
    name: 'root-override-keeps-host-independent', allowed: true,
    home: '<main>Unused theme home</main>',
    override: `---\nimport { emptyFilters } from '@mintfolio/theme-api/search';\nimport { message } from './shared/public.mjs';\nconst { hostMessage } = Astro.props;\n---\n<main>ROOT_OVERRIDE_OK {message} {hostMessage} {emptyFilters().q === '' ? 'SDK_FILTER_OK' : 'unexpected'}</main>`,
    expectedText: ['ROOT_OVERRIDE_OK', 'PUBLIC_HELPER_OK', 'HOST_CORE_VALUE', 'SDK_FILTER_OK'],
  },
  {
    name: 'root-override-cannot-import-core', allowed: false,
    home: '<main>Unused theme home</main>',
    override: `---\nimport { marker } from './src/core/private.mjs';\n---\n<main>{marker}</main>`,
  },
];

/**
 * Each host owns a genuine private Core module used by its route. Themes and
 * overrides may import public shared helpers but may not follow them into Core.
 */
async function createFixture(runRoot, entry) {
  const root = path.join(runRoot, entry.name);
  assertWithin(root, runRoot);
  for (const relative of ['src/pages', 'src/core', 'theme/pages', 'shared', 'node_modules/@mintfolio/theme-api/src']) {
    await mkdir(path.join(root, relative), { recursive: true });
  }
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: `boundary-${entry.name}`, private: true, type: 'module' }));
  // Only the tiny SDK package is copied. Existing Astro tooling is resolved from
  // the repository's ancestor node_modules; no network or full-site build occurs.
  const sdkRoot = path.join(root, 'node_modules', '@mintfolio', 'theme-api');
  await cp(path.join(sdkSource, 'package.json'), path.join(sdkRoot, 'package.json'));
  await cp(path.join(sdkSource, 'dist'), path.join(sdkRoot, 'dist'), { recursive: true });
  await cp(path.join(sdkSource, 'src', 'SeoHead.astro'), path.join(sdkRoot, 'src', 'SeoHead.astro'));
  const corePackage = path.join(root, 'node_modules/@mintfolio/core');
  await mkdir(corePackage, {recursive:true});
  for (const entry of ['package.json','dist','src']) await cp(path.join(workspace, entry), path.join(corePackage, entry), {recursive:true});

  const selection = { theme: './theme', settings: {}, ...(entry.override ? { overrides: { pages: { home: './custom-home.astro' } } } : {}) };
  await writeFile(path.join(root, 'theme.config.mjs'), `export default ${JSON.stringify(selection)};\n`);
  await writeFile(path.join(root, 'astro.config.mjs'), `import { defineConfig } from 'astro/config';\nimport themeRuntime from ${JSON.stringify(integrationUrl)};\nimport selection from './theme.config.mjs';\nexport default defineConfig({ integrations: [themeRuntime(selection)], vite: { resolve: { alias: { '@fixture-private': ${JSON.stringify(path.join(root, 'src/core/private.mjs').replaceAll('\\', '/'))} } } } });\n`);
  await writeFile(path.join(root, 'theme', 'theme.mjs'), `${entry.manifestImport ?? ''}\nimport { defineTheme } from '@mintfolio/theme-api';\nconst definition = ${JSON.stringify({
    manifest: { id: 'boundary-fixture', name: 'Boundary fixture', version: '1.0.0', author: 'Test authors', description: 'Real resolver boundary regression', engine: '^1.0.0' },
    capabilities: {}, pages: { home: './pages/home.astro', post: './pages/post.astro' }, settings: {},
  })};\n${entry.manifestAuthor ? 'definition.manifest.author = fixtureAuthor;' : ''}\nexport default defineTheme(definition);\n`);
  await writeFile(path.join(root, 'theme', 'manifest-helper.mjs'), `export { fixtureAuthor } from '../shared/manifest-public.mjs';\n`);
  await writeFile(path.join(root, 'theme', 'pages', 'home.astro'), entry.home);
  await writeFile(path.join(root, 'theme', 'pages', 'post.astro'), '<article>Required post renderer</article>');
  if (entry.override) await writeFile(path.join(root, 'custom-home.astro'), entry.override);
  await writeFile(path.join(root, 'src', 'core', 'private.mjs'), `export const marker = 'HOST_CORE_VALUE';\n`);
  // Manifest failures must occur before native import evaluates a private module.
  // If preflight is bypassed, this distinct error cannot satisfy our boundary assertion.
  await writeFile(path.join(root, 'src', 'core', 'manifest-private.mjs'), `throw new Error('MANIFEST_PRIVATE_MODULE_EXECUTED');\nexport const marker = 'private';\n`);
  await writeFile(path.join(root, 'shared', 'public.mjs'), `import { emptyFilters } from '@mintfolio/theme-api/search';\nexport const message = emptyFilters().q === '' ? 'PUBLIC_HELPER_OK' : 'unexpected';\n`);
  await writeFile(path.join(root, 'shared', 'bridge.mjs'), `export { marker } from '../src/core/private.mjs';\n`);
  await writeFile(path.join(root, 'shared', 'manifest-bridge.mjs'), `export { marker } from '../src/core/manifest-private.mjs';\n`);
  await writeFile(path.join(root, 'shared', 'manifest-public.mjs'), `export const fixtureAuthor = 'Safe fixture author';\n`);
  // This import is legitimate host work. A root-level override must not cause
  // the Core route itself to be misclassified as part of the theme dependency graph.
  await writeFile(path.join(root, 'src', 'pages', 'index.astro'), `---\nimport { activeTheme, getRenderer } from 'virtual:mintfolio/theme';\nimport { marker } from '../core/private.mjs';\nconst Page = getRenderer('home');\n---\n<Page hostMessage={marker} manifestAuthor={activeTheme.definition.manifest.author} />\n`);
  return root;
}

async function main() {
  await mkdir(cacheRoot, { recursive: true });
  assertWithin(await realpath(cacheRoot), await realpath(workspace));
  await mkdir(parentRoot, { recursive: true });
  assertWithin(await realpath(parentRoot), await realpath(cacheRoot));
  const runRoot = await mkdtemp(path.join(parentRoot, 'run-'));
  const astroPackage = JSON.parse(await readFile(path.join(workspace, 'node_modules', 'astro', 'package.json'), 'utf8'));
  const bin = typeof astroPackage.bin === 'string' ? astroPackage.bin : astroPackage.bin.astro;
  const cli = path.join(workspace, 'node_modules', 'astro', bin);
  const results = [];
  const requested = new Set(process.argv.slice(2));
  for (const name of requested) assert.ok(cases.some((entry) => entry.name === name), `Unknown boundary case: ${name}`);
  const selected = requested.size ? cases.filter((entry) => requested.has(entry.name)) : cases;

  for (const entry of selected) {
    const root = await createFixture(runRoot, entry);
    const started = Date.now();
    const result = await build(root, cli);
    await writeFile(path.join(root, 'build.log'), result.output);
    if (entry.allowed) {
      assert.equal(result.code, 0, `${entry.name} should build using only public imports:\n${result.output}`);
      const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
      for (const text of entry.expectedText) assert.ok(html.includes(text), `${entry.name} did not render ${text}`);
    } else {
      assert.notEqual(result.code, 0, `${entry.name} improperly allowed a private Core dependency`);
      assert.match(result.output, /\[theme:boundary\]/, `${entry.name} failed for an unrelated reason:\n${result.output}`);
    }
    results.push({ name: entry.name, expected: entry.allowed ? 'build' : 'boundary error', passed: true, elapsedMs: Date.now() - started, root });
    console.log(`[theme-boundaries] ${entry.name}: passed`);
  }
  await writeFile(path.join(runRoot, 'verification.json'), `${JSON.stringify({ version: 1, verifiedAt: new Date().toISOString(), results }, null, 2)}\n`);
  console.log(`[theme-boundaries] ${results.length} real Astro/Vite boundary checks passed. Fixtures retained at ${runRoot}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
