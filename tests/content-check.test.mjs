import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { checkContent } from '../bin/lib/content-check.mjs';
import { within } from '../bin/lib/files.mjs';

const cache = fileURLToPath(new URL('../.cache/', import.meta.url));

async function fixture(t, files) {
  await mkdir(cache, { recursive: true });
  const root = await mkdtemp(path.join(cache, 'content-check-'));
  t.after(async () => {
    const target = await realpath(root);
    const allowed = await realpath(cache);
    assert.ok(target !== allowed && within(target, allowed));
    await rm(target, { recursive: true, force: true });
  });
  for (const [relative, source] of Object.entries(files)) {
    const filename = path.join(root, relative);
    await mkdir(path.dirname(filename), { recursive: true });
    await writeFile(filename, source);
  }
  return root;
}

const article = (body, fields = '') => `---\ntitle: Example\npubDate: 2020-01-01\ndescription: Example\n${fields}---\n\n${body}\n`;

test('diagnostics resolve canonical routes, aliases, nested files, reference links, images and Unicode heading slugs', async t => {
  const root = await fixture(t, {
    'Nested/Source File.md': article('# 开始 *写作*\n\n[local](#开始-写作)\n\n[repeat](#开始-写作-1)\n\n# 开始 *写作*\n\n[custom](#manual)\n\n<a id="manual"></a>\n\n[other](/blog/stable#hello-world)\n\n[alias](/old-post#hello-world)\n\n[page](/handbook#read-me)\n\n![relative](<./my image.png>)\n\n![public][cover]\n\n[cover]: /assets/cover.png?v=2#size\n\n[theme](/custom-theme-route)\n\n[mail](mailto:person@example.com)\n\n[remote](https://example.com/unknown)\n\n![external](data:image/png;base64,AAAA)\n\n![generated](/_astro/generated.webp)', 'cover: /assets/cover.png\n'),
    'target.md': article('# Hello `world`', 'slug: stable\naliases: [/old-post]\n'),
    '_mintfolio/pages/guide.md': article('# Read me', 'slug: handbook\n'),
    'Nested/my image.png': 'png',
    '_mintfolio/public/assets/cover.png': 'png',
  });
  const result = await checkContent(root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
  assert.deepEqual(result.counts, { files: 3, posts: 2, pages: 1, links: 9, images: 5 });
});

test('drafts, future posts and protected articles are checked without exposing source, targets or passwords', async t => {
  const secret = 'PASSWORD_OR_PRIVATE_BODY_DO_NOT_REPORT';
  const root = await fixture(t, {
    'private.md': article(`[${secret}](/blog/${secret})\n\n![${secret}](./${secret}.png)\n\n[anchor](#${secret})`, `password: ${secret}\ndraft: true\n`),
    'future.md': article('[missing](/blog/not-created)').replace('2020-01-01', '2099-01-01'),
  });
  const result = await checkContent(root);
  assert.equal(result.errors.filter(item => item.code === 'MISSING_CONTENT').length, 2);
  assert.equal(result.errors.filter(item => item.code === 'MISSING_IMAGE').length, 1);
  assert.equal(result.warnings.filter(item => item.code === 'MISSING_ANCHOR').length, 1);
  assert.ok(result.errors.every(item => item.file.startsWith('') && item.line >= 7 && item.column >= 1));
  assert.ok(!JSON.stringify(result).includes(secret));
  assert.ok(!JSON.stringify(result).includes(root));
});

test('code examples stay opaque while source Markdown links and missing anchors are distinguished', async t => {
  const root = await fixture(t, {
    'post.md': article('```md\n[broken](/blog/code-example)\n![missing](/missing.png)\n```\n\n`[also broken](/blog/inline-example)`\n\n[valid source](./_mintfolio/pages/guide.md#guide)\n\n[missing source](./absent.md)\n\n[missing hash](/guide#absent)\n\n[page typo](/handbook/absent)\n\n[empty](#)\n\n[query](?q=anything)'),
    '_mintfolio/pages/guide.md': article('# Guide'),
    '_mintfolio/pages/handbook/install.md': article('# Install'),
  });
  const result = await checkContent(root);
  assert.deepEqual(result.errors.map(item => item.code), ['MISSING_CONTENT']);
  assert.deepEqual(result.warnings.map(item => item.code), ['MARKDOWN_SOURCE_LINK', 'MISSING_ANCHOR', 'UNKNOWN_PAGE']);
  assert.equal(result.counts.images, 0);
});

test('duplicate explicit slugs, aliases and reserved routes are diagnosed across both collections', async t => {
  const root = await fixture(t, {
    'a.md': article('# A', 'slug: shared\naliases: [/old]\n'),
    'b.md': article('# B', 'slug: shared\naliases: [/old]\n'),
    '_mintfolio/pages/c.md': article('# C', 'slug: blog/shared\naliases: [/about]\n'),
  });
  const result = await checkContent(root);
  assert.equal(result.errors.filter(item => item.code === 'DUPLICATE_ROUTE').length, 3);
  assert.equal(result.errors.filter(item => item.code === 'RESERVED_ROUTE').length, 1);
  assert.ok(result.errors.every(item => item.line >= 5));
});

test('new built-in output endpoints reject page slugs and article aliases including case variants', async t => {
  const routes = ['/404.html', '/feed.json', '/atom.xml', '/robots.txt', '/search-index.json'];
  const files = {};
  for (const [index, route] of routes.entries()) {
    files[`_mintfolio/pages/reserved-${index}.md`] = article('# Page', `slug: ${route.slice(1)}\n`);
    files[`alias-${index}.md`] = article('# Post', `aliases: [${route}, ${route.toUpperCase()}]\n`);
  }
  const root = await fixture(t, files);
  const result = await checkContent(root);
  assert.equal(result.errors.length, routes.length * 3);
  assert.ok(result.errors.every(item => item.code === 'RESERVED_ROUTE' && item.line === 5));
  assert.deepEqual(result.warnings, []);
});

test('invalid YAML and escaping images produce redacted diagnostics and optional pages can be disabled', async t => {
  const secret = 'SECRET_YAML_VALUE';
  const root = await fixture(t, {
    'invalid.md': `---\npassword: ${secret}\npassword: duplicated\n---\n`,
    'valid.md': article('![outside](../../../outside.png)'),
    '_mintfolio/pages/page.md': article('![absent](./missing.png)'),
  });
  const result = await checkContent(root, { pagesDir: false });
  assert.equal(result.counts.pages, 0);
  assert.deepEqual(result.errors.map(item => item.code), ['INVALID_FRONTMATTER', 'OUTSIDE_SITE']);
  assert.ok(!JSON.stringify(result).includes(secret));
  await assert.rejects(checkContent(root, { blogDir: '../' }), /站点目录/);
});

test('heading IDs match Astro file IDs and repeated headings without using image alt text', async t => {
  const root = await fixture(t, {
    'Nested/Hello World/index.md': article('# Hello ![alt](/logo.png) World\n\n[heading](#hello--world)\n\n[article](/blog/nested/hello-world#hello--world)'),
    '_mintfolio/public/logo.png': 'png',
  });
  const result = await checkContent(root);
  assert.deepEqual(result.errors, []);
  assert.deepEqual(result.warnings, []);
});
