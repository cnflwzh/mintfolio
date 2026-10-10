import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import test from 'node:test';
import { pageSeo } from '../src/server/seo.ts';
import { generateAtom, generateJsonFeed, generateRss, prepareFeedHtml, selectFeedPosts } from '../src/server/feeds.ts';
import { generateRobots, generateSitemap } from '../src/server/sitemap.ts';

const site = {
  title: 'A & B', description: 'Notes <and> articles', url: 'https://example.test',
  language: 'zh-CN', profile: { name: 'Site Author', avatar: '/avatar.png' },
  seo: { defaultSocialImage: '/social.png', twitterSite: '@example' },
  feed: { limit: 50, content: 'summary' },
};
const post = (id, overrides = {}) => ({
  id, url: '/blog/' + id, title: 'Title ' + id, description: 'Summary ' + id,
  publishedAt: '2026-01-01T00:00:00.000Z', protected: false,
  tags: [{ id: 'tag', label: 'A & B', url: '/tags/a' }],
  category: { id: 'notes', label: 'Notes', url: '/categories/notes' },
  ...overrides,
});

test('article SEO applies overrides, authors, modification time and safe structured data', () => {
  const article = post('seo', {
    updatedAt: '2026-02-01T00:00:00.000Z', wordCount: 360,
    authors: [{ id: 'guest', name: 'Guest Author', url: '/authors/guest' }],
    seo: { title: 'Search title', description: 'Search summary', image: '/share.png', imageAlt: 'Share text' },
  });
  const result = pageSeo(site, article.title, article.description, article.url, article);
  assert.equal(result.type, 'article');
  assert.equal(result.title, 'Search title');
  assert.equal(result.description, 'Search summary');
  assert.equal(result.image, 'https://example.test/share.png');
  assert.equal(result.imageAlt, 'Share text');
  assert.equal(result.modifiedAt, article.updatedAt);
  assert.equal(result.twitterCard, 'summary_large_image');
  assert.deepEqual(result.authors, ['Guest Author']);
  assert.equal(result.jsonLd['@type'], 'BlogPosting');
  assert.equal(result.jsonLd.dateModified, article.updatedAt);
  assert.equal(result.jsonLd.wordCount, 360);
  assert.equal(result.jsonLd.author[0].url, 'https://example.test/authors/guest');
  assert.equal('articleBody' in result.jsonLd, false);
  const page = pageSeo(site, 'Links', '', '/links', undefined, false, { noindex: true, canonical: 'https://original.test/links' });
  assert.equal(page.canonical, 'https://original.test/links');
  assert.equal(page.robots, 'noindex,nofollow');
  assert.equal(page.image, 'https://example.test/social.png');
  assert.equal(page.jsonLd, undefined);
});

test('protected and preview pages cannot regain indexability or JSON-LD through SEO overrides', () => {
  const privatePost = post('locked', {
    protected: true, description: 'Public locked placeholder',
    seo: { title: 'SECRET TITLE', description: 'SECRET SUMMARY', image: '/SECRET.png', canonical: 'https://SECRET.test', noindex: false },
  });
  const result = pageSeo(site, privatePost.title, 'SECRET PARAMETER', privatePost.url, privatePost);
  assert.equal(result.robots, 'noindex,nofollow');
  assert.equal(result.description, 'Public locked placeholder');
  assert.equal(result.canonical, 'https://example.test/blog/locked');
  assert.equal(result.jsonLd, undefined);
  assert.equal(result.publishedAt, undefined);
  assert.doesNotMatch(JSON.stringify(result), /SECRET/);
  const preview = post('draft', { preview: true });
  assert.equal(pageSeo(site, preview.title, preview.description, preview.url, preview).jsonLd, undefined);
  assert.equal(pageSeo(site, '404', '', '/404', undefined, true).robots, 'noindex,nofollow');
});

test('feeds filter before limiting and keep chronology independent of pinned list order', () => {
  const selected = [
    post('locked', { protected: true, title: 'PRIVATE_CONTENT' }),
    post('preview', { preview: true, title: 'DRAFT_CONTENT' }),
    post('noindex', { seo: { noindex: true }, title: 'NOINDEX_CONTENT' }),
    post('pinned', { pinned: true }),
    post('new', { publishedAt: '2026-03-01T00:00:00.000Z', title: 'New <entry> & notes', updatedAt: '2026-03-02T00:00:00.000Z' }),
    post('wrong-tag', { tags: [], publishedAt: '2026-04-01T00:00:00.000Z' }),
  ];
  const options = { limit: 1, tag: 'A & B', category: 'Notes', path: '/feeds/tag/test/rss.xml' };
  assert.deepEqual(selectFeedPosts(site, selected, options).map((item) => item.id), ['new']);
  assert.equal(selected[0].id, 'locked');
  const rss = generateRss(site, selected, options);
  assert.match(rss, /New &lt;entry&gt; &amp; notes/);
  assert.match(rss, /https:\/\/example.test\/feeds\/tag\/test\/rss.xml/);
  assert.match(rss, /Mon, 02 Mar 2026 00:00:00 GMT/);
  const json = JSON.parse(generateJsonFeed(site, selected, options));
  assert.equal(json.version, 'https://jsonfeed.org/version/1.1');
  assert.equal(json.items.length, 1);
  assert.equal(json.items[0].id, 'https://example.test/blog/new');
  assert.equal(json.items[0].content_text, 'Summary new');
  assert.equal(json.items[0].date_modified, '2026-03-02T00:00:00.000Z');
  for (const output of [rss, JSON.stringify(json), generateAtom(site, selected, options)]) {
    assert.doesNotMatch(output, /PRIVATE_CONTENT|DRAFT_CONTENT|NOINDEX_CONTENT|wrong-tag|Title pinned/);
  }
});

test('full subscriptions keep public semantic HTML and resolve images while removing executable markup', () => {
  const html = '<h2 id="read">Read</h2><p><a href="#read">Jump</a> <a href="../other?x=1&amp;y=2">Other</a></p><img src="/images/pic.png" alt="Picture" onerror="steal()"><script>steal()</script><iframe src="https://bad.test"></iframe><a href="javascript:steal()">Bad</a>';
  const article = post('entry', { contentHtml: html });
  const secret = post('private', { protected: true, contentHtml: '<p>SECRET_BODY</p>' });
  const options = { content: 'full' };
  const feed = JSON.parse(generateJsonFeed(site, [secret, article], options));
  const content = feed.items[0].content_html;
  assert.match(content, /href="https:\/\/example.test\/blog\/entry#read"/);
  assert.match(content, /href="https:\/\/example.test\/other\?x=1&amp;y=2"/);
  assert.match(content, /src="https:\/\/example.test\/images\/pic.png"/);
  assert.match(content, /<h2 id="read">Read<\/h2>/);
  assert.doesNotMatch(content, /script|onerror|iframe|javascript:|steal\(\)/);
  for (const output of [generateRss(site, [secret, article], options), generateAtom(site, [secret, article], options), JSON.stringify(feed)]) {
    assert.doesNotMatch(output, /SECRET_BODY/);
  }
  assert.throws(() => generateRss(site, [post('missing')], options), /missing rendered public HTML/);
  assert.equal(prepareFeedHtml('<img src="data:image/svg+xml,x">', site.url).includes('data:'), false);
});

test('sitemap uses actual lastmod and excludes private, preview, noindex and alternate canonical content', () => {
  const xml = generateSitemap(site, [
    post('updated', { updatedAt: '2026-04-01T00:00:00.000Z' }),
    post('original'), post('private', { protected: true }), post('draft', { preview: true }),
    post('hidden', { seo: { noindex: true } }),
    post('syndicated', { seo: { canonical: 'https://original.test/source' } }),
  ], [
    { url: '/friends', updatedAt: '2026-05-01T00:00:00.000Z' },
    { url: '/about', seo: { noindex: true } },
    { url: '/hidden-page', preview: true },
    { url: '/blog/page/2' }, { url: '/blog/page/2' },
    { url: 'https://external.test' },
  ]);
  assert.match(xml, /<loc>https:\/\/example.test\/blog\/updated<\/loc><lastmod>2026-04-01T00:00:00.000Z<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/example.test\/friends<\/loc><lastmod>2026-05-01T00:00:00.000Z<\/lastmod>/);
  assert.match(xml, /<loc>https:\/\/example.test\/blog\/original<\/loc><lastmod>2026-01-01T00:00:00.000Z<\/lastmod>/);
  assert.equal(xml.split('https://example.test/blog/page/2').length - 1, 1);
  assert.doesNotMatch(xml, /private|draft|hidden|syndicated|external|\/about/);
  assert.equal(generateRobots(site), 'User-agent: *\nAllow: /\n\nSitemap: https://example.test/sitemap.xml\n');
});

test('rendered SeoHead escapes JSON-LD script boundaries and advertises all static feeds', async () => {
  const [{ transform }, { experimental_AstroContainer }] = await Promise.all([
    import(pathToFileURL(createRequire(import.meta.resolve('astro')).resolve('@astrojs/compiler-rs')).href), import('astro/container'),
  ]);
  const filename = new URL(import.meta.resolve('@mintfolio/theme-api/SeoHead.astro'));
  const compiled = await transform(await readFile(filename, 'utf8'), { filename: filename.pathname, internalURL: 'astro/compiler-runtime', resultScopedSlot: true, resolvePath: (specifier) => specifier });
  // The compiler emits only Astro runtime imports. Resolve those against this
  // test package so the isolated compiled fixture can live under the OS temp dir.
  const code = compiled.code.replace(/from (["'])(astro\/[^"']+)\1/g, (_, quote, specifier) => 'from ' + quote + import.meta.resolve(specifier) + quote);
  const directory = await mkdtemp(path.join(tmpdir(), 'mintfolio-seo-head-'));
  const modulePath = path.join(directory, 'seo-head.mts');
  await writeFile(modulePath, code);
  const { default: Head } = await import(pathToFileURL(modulePath).href);
  const container = await experimental_AstroContainer.create();
  const article = post('script', { title: '</script><script>alert(1)</script> & text' });
  const seo = pageSeo(site, article.title, article.description, article.url, article);
  const html = await container.renderToString(Head, { props: { seo } });

  const json = html.match(/<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/)?.[1];
  assert.ok(json, 'the actual head must include a JSON-LD script');
  assert.doesNotMatch(json, /<|>|&/);
  assert.equal(JSON.parse(json).headline, article.title);
  assert.match(html, /property="og:type" content="article"/);
  assert.match(html, /name="twitter:card" content="summary_large_image"/);
  assert.match(html, /type="application\/rss\+xml"/);
  assert.match(html, /type="application\/feed\+json"/);
  assert.match(html, /type="application\/atom\+xml"/);
});
