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
import { initialize } from '../bin/lib/init.mjs';

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
  const now = new Date('2026-09-12T00:00:00Z');
  const published = await setDraft(root, 'notes/first', false, { now });
  assert.equal(published.status, 'publishable');
  assert.equal(await readFile(published.backup, 'utf8'), custom);
  assert.equal(await readFile(filename, 'utf8'), custom.replace('draft: true', 'draft: false'));
  assert.deepEqual(await listPosts(root, { now }), [{ slug: 'notes/first', title: '我的第一篇文章', date: '2026-09-11', draft: false, status: 'publishable', publishedAt: '2026-09-11T00:00:00.000Z' }]);
  const drafted = await setDraft(root, 'notes/first', true, { now });
  assert.equal(drafted.status, 'draft');
  assert.equal((await listPosts(root, { now }))[0].status, 'draft');
  await assert.rejects(createPost(root, 'Invalid', { date: '2026-02-30' }), /日期/);
});

test('article listing and draft transitions preserve the full publication timestamp at one cutoff', async t => {
  const root = await fixture(t);
  const filename = await createPost(root, 'Boundary', { slug: 'boundary', date: '2026-10-01' });
  const source = (await readFile(filename, 'utf8')).replace('pubDate: "2026-10-01"', 'pubDate: "2026-10-01T09:00:00+08:00"');
  await writeFile(filename, source);
  const before = new Date('2026-10-01T00:59:59.999Z');
  const result = await setDraft(root, 'boundary', false, { now: before });
  assert.equal(result.status, 'scheduled');
  assert.equal(result.publishedAt, '2026-10-01T01:00:00.000Z');
  assert.equal(await readFile(filename, 'utf8'), source.replace('draft: true', 'draft: false'));
  assert.equal((await listPosts(root, { now: before }))[0].status, 'scheduled');
  const [atBoundary] = await listPosts(root, { now: new Date(result.publishedAt) });
  assert.equal(atBoundary.status, 'publishable');
  assert.equal(atBoundary.date, '2026-10-01');
  assert.equal(atBoundary.publishedAt, result.publishedAt);
});

test('actual CLI separates scheduled and publishable articles, retains the published alias and never claims deployment', async t => {
  const root = await fixture(t);
  const run = args => exec(process.execPath, [cli, 'post', ...args], { cwd: root, windowsHide: true });
  await createPost(root, 'Ready', { slug: 'ready', date: '2000-01-01', publish: true });
  await createPost(root, 'Draft', { slug: 'draft', date: '2000-01-01' });
  const futureFile = await createPost(root, 'Future', { slug: 'future', date: '2999-01-01' });
  const privateSource = (await readFile(futureFile, 'utf8'))
    .replace('pubDate: "2999-01-01"', 'pubDate: "2999-01-01T09:30:00+08:00"')
    .replace('draft: true', 'draft: true\npassword: "CLI_PRIVATE_PASSWORD_SENTINEL"') + '\nCLI_PRIVATE_BODY_SENTINEL\n';
  await writeFile(futureFile, privateSource);
  const publishFuture = (await run(['publish', 'future'])).stdout;
  assert.match(publishFuture, /发布日期尚未到达/);
  assert.match(publishFuture, /2999-01-01T01:30:00\.000Z/);
  assert.match(publishFuture, /到期后需重新构建/);
  assert.equal(await readFile(futureFile, 'utf8'), privateSource.replace('draft: true', 'draft: false'));
  const allOutput = (await run(['list', '--json'])).stdout;
  const all = JSON.parse(allOutput);
  assert.deepEqual(Object.fromEntries(all.map(post => [post.slug, post.status])), { future: 'scheduled', draft: 'draft', ready: 'publishable' });
  assert.doesNotMatch(allOutput, /CLI_PRIVATE_PASSWORD_SENTINEL|CLI_PRIVATE_BODY_SENTINEL/);
  for (const [flag, id] of [['--draft', 'draft'], ['--scheduled', 'future'], ['--publishable', 'ready'], ['--published', 'ready']]) {
    assert.deepEqual(JSON.parse((await run(['list', flag, '--json'])).stdout).map(post => post.slug), [id]);
  }
  assert.deepEqual(JSON.parse((await run(['list', '--published', '--publishable', '--json'])).stdout).map(post => post.slug), ['ready']);
  for (const flags of [['--draft', '--scheduled'], ['--draft', '--published'], ['--scheduled', '--publishable']]) {
    await assert.rejects(run(['list', ...flags]), error => error.code === 1 && error.stderr.includes('不能同时使用'));
  }
  const listed = (await run(['list'])).stdout;
  assert.match(listed, /草稿/);
  assert.match(listed, /定时/);
  assert.match(listed, /可参与构建/);
  const publishReady = (await run(['publish', 'ready'])).stdout;
  assert.match(publishReady, /可参与下一次构建/);
  assert.doesNotMatch(listed + publishFuture + publishReady, /已发布|已部署|下次构建生效/);
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


// This isolated Astro process records the CLI boundary. Real Astro rendering is
// covered by the package's build/boundary verification, not this dispatch fixture.
async function fakeAstro(root) {
  const core = path.join(root, 'node_modules/@mintfolio/core');
  const astro = path.join(core, 'node_modules/astro');
  await mkdir(path.join(astro, 'bin'), { recursive: true });
  await writeFile(path.join(core, 'package.json'), JSON.stringify({ name: '@mintfolio/core', version: '0.3.0', exports: { './package.json': './package.json' } }));
  await writeFile(path.join(astro, 'package.json'), JSON.stringify({ name: 'astro', version: '7.3.2', type: 'module', exports: { './package.json': './package.json' } }));
  await writeFile(path.join(astro, 'bin/astro.mjs'), `import {writeFileSync} from 'node:fs';
writeFileSync(process.env.CLI_CAPTURE_FILE, JSON.stringify({args:process.argv.slice(2),drafts:process.env.MINTFOLIO_PREVIEW_DRAFTS ?? null}));
console.log('ASTRO_PROCESS_LOG');
if(process.env.CLI_ASTRO_FAIL === '1') process.exitCode=1;
`);
  const capture = path.join(root, 'astro-call.json');
  const run = (args, env = {}) => exec(process.execPath, [cli, ...args], { cwd: root, windowsHide: true, env: { ...process.env, CLI_CAPTURE_FILE: capture, MINTFOLIO_PREVIEW_DRAFTS: '1', ...env } });
  return { run, captured: async () => JSON.parse(await readFile(capture, 'utf8')) };
}

test('CLI draft preview is explicitly enabled only for dev and never reaches production commands', async t => {
  const root = await fixture(t);
  const { run, captured } = await fakeAstro(root);
  await run(['dev', '--drafts', '--port', '4322']);
  assert.deepEqual(await captured(), { args: ['dev', '--port', '4322'], drafts: '1' });
  for (const command of ['dev', 'build', 'preview', 'sync']) {
    await run([command]);
    assert.deepEqual(await captured(), { args: [command], drafts: null });
  }
  for (const command of ['build', 'preview', 'sync']) await assert.rejects(run([command, '--drafts']), error => error.code === 1 && error.stderr.includes('仅适用于'));
  await assert.rejects(run(['dev', '--drafts=true']), error => error.code === 1);
});

test('CLI check produces one JSON document, separates child logs and returns content failures even after sync errors', async t => {
  const root = await fixture(t);
  const { run, captured } = await fakeAstro(root);
  const filename = await createPost(root, 'Check', { slug: 'check' });
  const original = await readFile(filename, 'utf8');
  await writeFile(filename, original + '\n![private caption](./missing.png)\n');
  await assert.rejects(run(['check', '--json']), error => {
    const result = JSON.parse(error.stdout);
    assert.equal(result.status, 'error');
    assert.equal(result.environment.status, 'ok');
    assert.equal(result.sync.status, 'ok');
    assert.equal(result.content.errors[0].code, 'MISSING_IMAGE');
    assert.equal(result.content.errors[0].file, 'content/blog/check.md');
    assert.ok(error.stderr.includes('ASTRO_PROCESS_LOG'));
    assert.ok(!error.stdout.includes('private caption'));
    return error.code === 1;
  });
  assert.deepEqual(await captured(), { args: ['sync'], drafts: null });
  await assert.rejects(run(['check', '--json'], { CLI_ASTRO_FAIL: '1' }), error => {
    const result = JSON.parse(error.stdout);
    assert.equal(result.sync.status, 'error');
    assert.equal(result.content.errors[0].code, 'MISSING_IMAGE');
    return error.code === 1;
  });
  await writeFile(filename, original + '\n[unconfirmed anchor](#absent)\n');
  const result = JSON.parse((await run(['check', '--json'])).stdout);
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.content.errors, []);
  assert.equal(result.content.warnings[0].code, 'MISSING_ANCHOR');
});

test('new core config fields validate complete author registries and preserve files on invalid changes', async t => {
  const root = await fixture(t);
  await setConfig(root, 'site', 'blog.pageSize', '12');
  await setConfig(root, 'site', 'blog.timezone', 'Asia/Hong_Kong');
  await setConfig(root, 'site', 'feed.content', 'full');
  await setConfig(root, 'site', 'feed.limit', '30');
  await setConfig(root, 'site', 'seo.defaultSocialImage', '/images/share.png');
  await setConfig(root, 'site', 'seo.twitterSite', '@writer');
  await setConfig(root, 'site', 'authors', JSON.stringify([{ id: 'a', name: 'One' }, { id: 'b', name: 'Two', url: 'https://example.com' }]), { json: true });
  await setConfig(root, 'site', 'authors.0.bio', 'Author biography');
  await setConfig(root, 'site', 'navigation', JSON.stringify([{ id: 'links', label: 'Links', url: '/links' }]), { json: true });
  const filename = path.join(root, 'site.config.ts');
  const before = await readFile(filename, 'utf8');
  for (const [field, value] of [['blog.pageSize', '0'], ['blog.pageSize', '1.5'], ['blog.timezone', 'Not/AZone'], ['feed.limit', '1001'], ['feed.content', 'invalid'], ['authors.1.id', 'a'], ['authors.0.url', 'javascript:alert(1)'], ['navigation.0.url', '//outside.example']]) {
    await assert.rejects(setConfig(root, 'site', field, value));
    assert.equal(await readFile(filename, 'utf8'), before);
  }
  assert.equal(await getConfig(root, 'site', 'blog.pageSize'), 12);
  assert.equal(await getConfig(root, 'site', 'feed.content'), 'full');
  assert.equal(await getConfig(root, 'site', 'authors.0.bio'), 'Author biography');
  const schema = await configSchema(root, 'site');
  for (const field of ['blog', 'seo', 'feed', 'authors', 'navigation']) assert.ok(schema[field]);
});

test('site initialization registers pages and preserves existing page content and collection configuration', async t => {
  const root = await fixture(t);
  await initialize(root);
  const collections = path.join(root, 'src/content.config.ts');
  const page = path.join(root, 'content/pages/links.md');
  assert.match(await readFile(collections, 'utf8'), /pages: createPageCollection\(\)/);
  assert.match(await readFile(page, 'utf8'), /title: "友情链接"/);
  await writeFile(collections, '// owner-defined collections\n');
  await writeFile(page, 'Owner page content\n');
  await initialize(root);
  assert.equal(await readFile(collections, 'utf8'), '// owner-defined collections\n');
  assert.equal(await readFile(page, 'utf8'), 'Owner page content\n');
});
