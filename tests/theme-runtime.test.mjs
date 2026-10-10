import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import test from 'node:test';
import { loadTheme } from '../src/engine/loader.mjs';
import { resolveSettings, validateTheme } from '../src/engine/schema.mjs';
import { settingsTemplate } from '../bin/theme-config.mjs';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const cacheRoot = path.join(workspace, '.cache');

function definition(overrides = {}) {
  return {
    manifest: { id: 'fixture', name: 'Fixture', version: '1.2.3', author: 'Test authors', description: 'Core contract fixture', engine: '^1.0.0' },
    capabilities: { search: true, encryptedPosts: true },
    pages: { home: './pages/home.astro', post: './pages/post.astro' },
    settings: {
      heading: { type: 'string', label: 'Heading', default: 'Notes' },
      compact: { type: 'boolean', label: 'Compact', default: false },
      width: { type: 'number', label: 'Width', default: 760, min: 480, max: 1200 },
      tone: { type: 'select', label: 'Tone', default: 'quiet', options: ['quiet', 'bright'] },
      accent: { type: 'color', label: 'Accent', default: '#2255aa' },
    },
    ...overrides,
  };
}

/** Each test gets an isolated project under the allowed workspace cache directory. */
async function projectFixture(t) {
  await mkdir(cacheRoot, { recursive: true });
  const root = await mkdtemp(path.join(cacheRoot, 'theme-unit-'));
  t.after(async () => {
    // Verify the resolved deletion target stays under our dedicated fixture parent.
    const relative = path.relative(await realpath(cacheRoot), await realpath(root));
    assert.ok(relative && !relative.startsWith('..') && !path.isAbsolute(relative));
    await rm(root, { recursive: true, force: true });
  });
  await writeFile(path.join(root, 'package.json'), JSON.stringify({ name: 'theme-unit-host', type: 'module' }));
  return root;
}

async function writeTheme(directory, value = definition()) {
  await mkdir(path.join(directory, 'pages'), { recursive: true });
  await writeFile(path.join(directory, 'theme.mjs'), `export default ${JSON.stringify(value)};\n`);
  await writeFile(path.join(directory, 'pages', 'home.astro'), '<main>Home renderer</main>');
  await writeFile(path.join(directory, 'pages', 'post.astro'), '<article>Post renderer</article>');
}

test('manifest validation enforces required renderers, known capabilities, and real semver ranges', () => {
  const valid = validateTheme(definition(), 'fixture/theme.mjs');
  assert.equal(valid.capabilities.toc, false);
  assert.equal(valid.pages.archive, undefined);
  assert.throws(() => validateTheme(definition({ pages: { home: './pages/home.astro' } }), 'fixture/theme.mjs'), /pages\.post/);
  assert.throws(() => validateTheme(definition({ capabilities: { serach: true } }), 'fixture/theme.mjs'), /capabilities/);
  assert.throws(() => validateTheme({ ...definition(), extends: 'parent' }, 'fixture/theme.mjs'), /extends/);
  for (const engine of ['^2.0.0', '>=1.0.0 <1.1.0', 'not-a-version']) {
    assert.throws(() => validateTheme(definition({ manifest: { ...definition().manifest, engine } }), 'fixture/theme.mjs'), /engine/);
  }
  assert.equal(validateTheme(definition({ manifest: { ...definition().manifest, engine: '>=1.1.0 <2.0.0' } }), 'fixture/theme.mjs').manifest.id, 'fixture');
});

test('settings apply typed defaults and reject misspellings, invalid values, and invalid schemas', () => {
  const valid = validateTheme(definition(), 'fixture/theme.mjs');
  assert.deepEqual(resolveSettings(valid, { compact: true, width: 900 }), {
    heading: 'Notes', compact: true, width: 900, tone: 'quiet', accent: '#2255aa',
  });
  for (const input of [
    { widht: 900 }, { width: '900' }, { width: 479 }, { width: Infinity },
    { compact: 'false' }, { tone: 'missing' }, { accent: 'red' },
  ]) assert.throws(() => resolveSettings(valid, input), /theme:settings/);
  for (const setting of [
    { type: 'number', label: 'Width', default: 100, min: 200, max: 400 },
    { type: 'select', label: 'Tone', default: 'missing', options: ['quiet'] },
    { type: 'select', label: 'Tone', default: 'quiet', options: ['quiet', 'quiet'] },
    { type: 'color', label: 'Accent', default: 'invalid' },
  ]) assert.throws(() => validateTheme(definition({ settings: { sample: setting } }), 'fixture/theme.mjs'), /settings\.sample/);
});

test('local themes, npm aliases and bundled Minimal resolve with explicit overrides', async (t) => {
  const root = await projectFixture(t);
  const themeRoot = path.join(root, 'src', 'themes', 'verdant');
  await writeTheme(themeRoot);
  await mkdir(path.join(root, 'overrides'));
  await writeFile(path.join(root, 'overrides', 'home.astro'), '<main>User home</main>');
  const fallback = await loadTheme({ root });
  assert.equal(fallback.definition.manifest.id, 'minimal');
  assert.equal(fallback.manifestPath, await realpath(path.join(workspace, 'src/fallback/theme.mjs')));
  await assert.rejects(loadTheme({ root, theme: '@fixture/missing' }), /Cannot find package '@fixture\/missing'/);
  const aliasPackage = path.join(root, 'node_modules/@mintfolio/theme-verdant');
  await writeTheme(aliasPackage);
  await writeFile(path.join(aliasPackage, 'package.json'), JSON.stringify({name:'@mintfolio/theme-verdant',type:'module',exports:{'./theme':'./theme.mjs'}}));
  const builtin = await loadTheme({ root, theme: 'verdant' });
  const named = await loadTheme({ root, theme: '@mintfolio/theme-verdant' });
  assert.equal(builtin.manifestPath, named.manifestPath);
  const local = await loadTheme({ root, theme: './src/themes/verdant', settings: { width: 800 }, overrides: { pages: { home: './overrides/home.astro' } } });
  assert.equal(local.settings.width, 800);
  assert.equal(local.pages.home, await realpath(path.join(root, 'overrides', 'home.astro')));
  assert.equal(local.pages.post, await realpath(path.join(themeRoot, 'pages', 'post.astro')));
  assert.equal(local.pages.archive, undefined);
  assert.deepEqual(local.overrideRoots, [await realpath(path.join(root, 'overrides'))]);
});

test('renderers cannot escape their theme directory and overrides cannot claim Core files', async (t) => {
  const root = await projectFixture(t);
  const themeRoot = path.join(root, 'theme');
  await writeFile(path.join(root, 'outside.astro'), '<main>Outside theme</main>');
  await writeTheme(themeRoot, definition({ pages: { home: './../outside.astro', post: './pages/post.astro' } }));
  await assert.rejects(loadTheme({ root, theme: './theme' }), /theme:page/);
  await writeTheme(themeRoot);
  await mkdir(path.join(root, 'src', 'core'), { recursive: true });
  await writeFile(path.join(root, 'src', 'core', 'private.astro'), '<main>Core</main>');
  await assert.rejects(loadTheme({ root, theme: './theme', fresh: true, overrides: { pages: { home: './src/core/private.astro' } } }), /theme:overrides/);
  await assert.rejects(loadTheme({ root, theme: './theme', fresh: true, overrides: { pages: { router: './outside.astro' } } }), /theme:overrides/);
});

test('installed npm themes resolve through their public export and enforce Astro peer compatibility', async (t) => {
  const root = await projectFixture(t);
  const packageRoot = path.join(root, 'node_modules', '@fixture', 'theme');
  await writeTheme(packageRoot);
  await writeFile(path.join(packageRoot, 'package.json'), JSON.stringify({
    name: '@fixture/theme', type: 'module', exports: { './theme': { import: './theme.mjs' } },
    peerDependencies: { astro: '^7.0.0' },
  }));
  const loaded = await loadTheme({ root, theme: '@fixture/theme' });
  assert.equal(loaded.manifestPath, await realpath(path.join(packageRoot, 'theme.mjs')));
  assert.equal(loaded.pages.home, await realpath(path.join(packageRoot, 'pages', 'home.astro')));

  const incompatibleRoot = path.join(root, 'node_modules', '@fixture', 'incompatible');
  await writeTheme(incompatibleRoot);
  await writeFile(path.join(incompatibleRoot, 'package.json'), JSON.stringify({
    name: '@fixture/incompatible', type: 'module', exports: { './theme': './theme.mjs' },
    peerDependencies: { astro: '^6.0.0' },
  }));
  await assert.rejects(loadTheme({ root, theme: '@fixture/incompatible' }), /theme:renderer/);
});


test('nested settings merge defaults and validate every array item and unknown key', () => {
  const settings = {
    sidebar: { type: 'object', label: 'Sidebar', default: { enabled: false }, properties: {
      enabled: { type: 'boolean', label: 'Enabled', default: true },
      links: { type: 'array', label: 'Links', default: [], items: {
        type: 'object', label: 'Link', default: {}, properties: {
          label: { type: 'string', label: 'Label', default: 'Read' },
          url: { type: 'string', label: 'URL', default: '/' },
        },
      } },
    } },
  };
  const valid = validateTheme(definition({ settings }), 'nested/theme.mjs');
  const resolved = resolveSettings(valid, { sidebar: { links: [{ url: '/blog' }] } });
  assert.deepEqual(resolved, { sidebar: { enabled: false, links: [{ label: 'Read', url: '/blog' }] } });
  assert.deepEqual(resolveSettings(valid, {}), { sidebar: { enabled: false, links: [] } });
  assert.throws(() => resolveSettings(valid, { sidebar: { enabld: true } }), /sidebar.enabld/);
  assert.throws(() => resolveSettings(valid, { sidebar: { links: [{ url: false }] } }), /links\[0\].url/);
  assert.throws(() => validateTheme(definition({ pages: { ...definition().pages, search: './search.astro' } }), 'unused-slot'), /pages/);
});

test('theme settings come only from theme.config.mjs and merge nested defaults', async (t) => {
  const root = await projectFixture(t);
  const themeRoot = path.join(root, 'theme');
  const settings = {
    heading: definition().settings.heading,
    sidebar: {type:'object',label:'Sidebar',default:{},properties:{
      enabled:{type:'boolean',label:'Enabled',default:true},
      links:{type:'array',label:'Links',default:[],items:{type:'string',label:'Link',default:'/'}},
    }},
  };
  await writeTheme(themeRoot, definition({settings}));
  // A leftover per-theme file from the old layout is never read by the engine.
  await writeFile(path.join(root, 'theme-fixture.config.mjs'), "export default { heading: 'Ignored title' };\n");
  const active = await loadTheme({root,theme:'./theme',settings:{sidebar:{links:['/blog']}}});
  assert.deepEqual(active.settings,{heading:'Notes',sidebar:{enabled:true,links:['/blog']}});
  assert.equal('themeConfigFile' in active,false);
  await assert.rejects(loadTheme({root,theme:'./theme',settings:{sidebar:{enabld:true}}}), /sidebar.enabld/);
});

/** Evaluate a settings template exactly as it will appear inside theme.config.mjs. */
async function evaluateTemplate(root, text, name) {
  const filename = path.join(root, `${name}.mjs`);
  await writeFile(filename, `export default ${text};\n`);
  return (await import(pathToFileURL(filename).href)).default;
}

test('settings templates list every schema default when a theme ships no template', async (t) => {
  const root = await projectFixture(t);
  await writeTheme(path.join(root,'theme'));
  const text = await settingsTemplate(root,'./theme');
  assert.match(text, /\/\/ Heading/);
  assert.deepEqual(await evaluateTemplate(root, text, 'generated'), resolveSettings(definition(),{}));
});

test('a package settings template keeps its comments and cannot escape its package', async (t) => {
  const root = await projectFixture(t);
  await writeFile(path.join(root,'package.json'),JSON.stringify({name:'site',type:'module',dependencies:{'@fixture/theme':'1.2.3'}}));
  const themeRoot = path.join(root,'node_modules/@fixture/theme');
  await writeTheme(themeRoot);
  const pkg = {name:'@fixture/theme',type:'module',exports:{'./theme':'./theme.mjs'},mintfolio:{configTemplate:'./config.mjs'}};
  await writeFile(path.join(themeRoot,'package.json'),JSON.stringify(pkg));
  const defaults = resolveSettings(definition(),{});
  await writeFile(path.join(themeRoot,'config.mjs'),`/** File note, not copied. */\nexport default {\n  // Author-provided instructions\n  heading: 'Notes',\n};\n`);
  const text = await settingsTemplate(root,'@fixture/theme');
  assert.ok(text.startsWith('{') && text.includes('// Author-provided instructions') && !text.includes('File note'));
  assert.deepEqual(resolveSettings(definition(), await evaluateTemplate(root, text, 'packaged')), defaults);
  await writeFile(path.join(root,'outside.mjs'),'export default {};\n');
  pkg.mintfolio.configTemplate = './../../../outside.mjs';
  await writeFile(path.join(themeRoot,'package.json'),JSON.stringify(pkg));
  await assert.rejects(settingsTemplate(root,'@fixture/theme'), /Template escapes/);
});
