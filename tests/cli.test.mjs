import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { configSource, setSourceValue, sourceNode, sourceValue } from '../bin/lib/config-source.mjs';
import { configFilename, configSchema, getConfig, setConfig } from '../bin/lib/config.mjs';
import { createPost, listPosts, setDraft } from '../bin/lib/posts.mjs';
import { activeTheme, packageSpec, useTheme } from '../bin/lib/themes.mjs';
import { findSite, saveFile, within } from '../bin/lib/files.mjs';
import { npmEntry } from '../bin/lib/process.mjs';

const workspace = fileURLToPath(new URL('..', import.meta.url));
const cache = path.join(workspace, '.cache');
const exec = promisify(execFile);
const cli = path.join(workspace, 'bin/mintfolio.mjs');

async function fixture(t) {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(path.join(cache, 'cli-unit-'));
  t.after(async () => {
    const target = await realpath(root);
    assert.ok(target !== await realpath(cache) && within(target, await realpath(cache)));
    await rm(target, { recursive: true, force: true });
  });
  await writeFile(path.join(root, 'package.json'), '{"name":"cli-fixture","type":"module"}\n');
  await writeFile(path.join(root, 'theme.config.mjs'), 'export default {};\n');
  await writeFile(path.join(root, 'site.config.ts'), `import { defineSiteConfig } from '@mintfolio/core/config';
import avatar from './avatar.png';
export default defineSiteConfig({
  // Keep the site owner's comment.
  site: { title: 'Original', url: 'https://example.com' },
  profile: { name: 'Author', avatar },
});
`);
  return root;
}

async function localTheme(root) {
  await mkdir(path.join(root, 'custom/pages'), { recursive: true });
  await writeFile(path.join(root, 'custom/pages/home.astro'), '<main>Home</main>');
  await writeFile(path.join(root, 'custom/pages/post.astro'), '<article>Post</article>');
  const definition = {
    manifest: { id: 'custom', name: 'Custom', author: 'Tests', description: 'CLI settings fixture', version: '1.0.0', engine: '^1.0.0' },
    pages: { home: './pages/home.astro', post: './pages/post.astro' },
    settings: {
      palette: { type: 'select', label: 'Palette', default: '1', options: ['1', '2'] },
      count: { type: 'number', label: 'Count', default: 6, min: 1, max: 20 },
      panel: { type: 'object', label: 'Panel', default: {}, properties: { enabled: { type: 'boolean', label: 'Enabled', default: false }, title: { type: 'string', label: 'Title', default: 'Panel' } } },
    },
  };
  await writeFile(path.join(root, 'custom/theme.mjs'), `export default ${JSON.stringify(definition)};\n`);
}

test('article creation and draft transitions preserve content, metadata comments and exact backups', async t => {
  const root = await fixture(t);
  const filename = await createPost(root, '我的第一篇文章', { slug: 'notes/first', date: '2026-09-11', tags: '随笔,生活', description: 'A "quoted" summary' });
  const created = await readFile(filename, 'utf8');
  assert.match(created, /draft: true/);
  await assert.rejects(createPost(root, 'Overwrite', { slug: 'notes/first' }), /未覆盖/);
  assert.equal(await readFile(filename, 'utf8'), created);
  const custom = created.replace('draft: true', 'draft: true # Preserve the YAML comment') + '\nSecret body sentinel\n';
  await writeFile(filename, custom);
  const published = await setDraft(root, 'notes/first', false);
  assert.equal(await readFile(published.backup, 'utf8'), custom);
  assert.equal(await readFile(filename, 'utf8'), custom.replace('draft: true', 'draft: false'));
  assert.deepEqual(await listPosts(root), [{ slug: 'notes/first', title: '我的第一篇文章', date: '2026-09-11', draft: false }]);
  await setDraft(root, 'notes/first', true);
  assert.equal((await listPosts(root))[0].draft, true);
  await assert.rejects(createPost(root, 'Invalid', { date: '2026-02-30' }), /日期/);
});

test('CLI file writes reject escaping slugs, symlinks and stale inspected content', async t => {
  const root = await fixture(t);
  const outside = await fixture(t);
  for (const slug of ['../escape', '/absolute', 'C:\\escape', 'nested/../../escape', 'NUL', 'name.md/next']) await assert.rejects(createPost(root, 'Unsafe', { slug }));
  await mkdir(path.join(root, 'content/blog'), { recursive: true });
  await symlink(outside, path.join(root, 'content/blog/linked'), process.platform === 'win32' ? 'junction' : 'dir');
  await assert.rejects(createPost(root, 'Escape', { slug: 'linked/post' }), /符号链接/);
  const filename = path.join(root, 'theme.config.mjs');
  await assert.rejects(saveFile(root, filename, 'stale', 'changed'), /已被其他程序修改/);
  assert.equal(await readFile(filename, 'utf8'), 'export default {};\n');
});

test('config source edits retain imports, comments, TS wrappers and literal semantics', () => {
  const source = "import { defineSiteConfig as define } from '@mintfolio/core/config';\nconst config = define({\n  // Owner note\n  site: { title: 'Before', url: 'https://example.com' },\n  profile: { name: 'A' },\n} satisfies Input);\nexport default config;\n";
  const updated = setSourceValue(source, 'site.title', 'After');
  assert.equal(updated, source.replace("'Before'", '"After"'));
  const extended = setSourceValue(updated, 'profile.bio', 'A new bio');
  const parsed = configSource(extended);
  assert.equal(sourceValue(parsed, sourceNode(parsed, ['profile', 'bio'])), 'A new bio');
  assert.ok(extended.includes('// Owner note'));
  assert.throws(() => setSourceValue('export default { ...base };', 'title', 'x'), /动态/);
  assert.throws(() => setSourceValue('export default { title: 1, title: 2 };', 'title', 'x'), /动态/);
  assert.throws(() => setSourceValue('export default {};', '__proto__.polluted', true), /无效配置路径/);
});

test('typed site and theme edits validate before writing and preserve numeric string palettes', async t => {
  const root = await fixture(t);
  await localTheme(root);
  await writeFile(path.join(root, 'theme.config.mjs'), "export default { theme: './custom' };\n");
  const siteFile = path.join(root, 'site.config.ts');
  const original = await readFile(siteFile, 'utf8');
  const result = await setConfig(root, 'site', 'site.title', '新标题');
  assert.equal(await readFile(result.backup, 'utf8'), original);
  assert.equal(await readFile(siteFile, 'utf8'), original.replace("'Original'", '"新标题"'));
  assert.deepEqual(await getConfig(root, 'site', 'profile.avatar'), { $expression: 'avatar' });
  await assert.rejects(setConfig(root, 'site', 'site.url', 'javascript:alert(1)'));
  await assert.rejects(setConfig(root, 'site', 'site.typo', 'Invalid'), /未知站点配置项/);
  await setConfig(root, 'site', 'profile.bio', '简介');
  await setConfig(root, 'theme', 'palette', '2');
  await setConfig(root, 'theme', 'count', '10');
  await setConfig(root, 'theme', 'panel.enabled', 'true');
  assert.equal(await getConfig(root, 'theme', 'palette'), '2');
  assert.equal(await getConfig(root, 'theme', 'count'), 10);
  assert.equal(await getConfig(root, 'theme', 'panel.enabled'), true);
  const file = path.join(root, 'theme-custom.config.mjs');
  const beforeInvalid = await readFile(file, 'utf8');
  await assert.rejects(setConfig(root, 'theme', 'count', '100'));
  assert.equal(await readFile(file, 'utf8'), beforeInvalid);
  // A manually broken value must not prevent locating/opening its editor or schema.
  await writeFile(file, "export default { count: 'invalid' };\n");
  await assert.rejects(getConfig(root, 'theme'));
  assert.equal(await configFilename(root, 'theme'), file);
  assert.equal((await configSchema(root, 'theme')).count.type, 'number');
});

test('theme switching migrates legacy inline values and restores them when switching back', async t => {
  const root = await fixture(t);
  await localTheme(root);
  await writeFile(path.join(root, 'theme.config.mjs'), "// Keep selection note\nexport default { theme: './custom', settings: { palette: '2', panel: {enabled:true} } };\n");
  await setConfig(root, 'theme', 'palette', '1');
  assert.equal((await activeTheme(root)).settings.palette, '1');
  await useTheme(root, 'minimal');
  assert.equal((await activeTheme(root)).definition.manifest.id, 'minimal');
  assert.ok((await readFile(path.join(root, 'theme.config.mjs'), 'utf8')).includes('// Keep selection note'));
  await useTheme(root, './custom');
  const active = await activeTheme(root);
  assert.equal(active.settings.palette, '1');
  assert.equal(active.settings.panel.enabled, true);
  assert.equal(active.settings.panel.title, 'Panel');
});

test('actual CLI accepts quoted titles, subdirectories and aliases, and fails unknown commands', async t => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'content/blog'), { recursive: true });
  assert.equal(await findSite(path.join(root, 'content/blog')), await realpath(root));
  const run = args => exec(process.execPath, [cli, ...args], { cwd: path.join(root, 'content/blog'), windowsHide: true });
  await run(['post', 'new', '中文标题 with spaces', '--slug', 'real-cli']);
  const listed = JSON.parse((await run(['post', 'list', '--json'])).stdout);
  assert.equal(listed[0].title, '中文标题 with spaces');
  assert.equal(listed[0].draft, true);
  await run(['theme:check']);
  await assert.rejects(run(['post', 'unknown']), error => error.code === 1);
  await assert.rejects(run(['post', 'new', 'Typo', '--unknwon']), error => error.code === 1);
  assert.deepEqual(packageSpec('verdant@0.2.0'), { name: '@mintfolio/theme-verdant', spec: '@mintfolio/theme-verdant@0.2.0' });
  assert.deepEqual(packageSpec('@mintfolio/theme-verdant@0.2.0'), { name: '@mintfolio/theme-verdant', spec: '@mintfolio/theme-verdant@0.2.0' });
  assert.throws(() => packageSpec('--global'));
  assert.throws(() => packageSpec('@scope/theme@'));
});

test('global CLI uses the PATH-selected npm before the Node-bundled fallback', async t => {
  const root = await fixture(t);
  const directory = path.join(root, 'selected-npm');
  const entry = path.join(directory, 'node_modules/npm/bin/npm-cli.js');
  await mkdir(path.dirname(entry), { recursive: true });
  await writeFile(entry, '// test npm entry\n');
  const previousPath = process.env.PATH;
  const previousExec = process.env.npm_execpath;
  try {
    delete process.env.npm_execpath;
    process.env.PATH = directory + path.delimiter + previousPath;
    assert.equal(await npmEntry(), entry);
  } finally {
    process.env.PATH = previousPath;
    if (previousExec === undefined) delete process.env.npm_execpath;
    else process.env.npm_execpath = previousExec;
  }
});
