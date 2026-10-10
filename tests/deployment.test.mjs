import assert from 'node:assert/strict';
import test from 'node:test';
import { deploymentUrl, normalizeBase, prefixRoute, withBase, withoutBase } from '../src/shared/deployment.mjs';
import { absoluteUrl, createUrls } from '../src/server/routing.ts';
import { pageSeo } from '../src/server/seo.ts';
import { generateAtom, generateJsonFeed, generateRss } from '../src/server/feeds.ts';

const origin = 'https://example.test';
const base = '/blog-site/';

test('root deployment retains existing public routes and author URLs', () => {
  const urls = createUrls();
  assert.deepEqual([
    urls.home(), urls.archive(), urls.archivePage(2), urls.page('links'), urls.post('notes/first'),
    urls.tag('Astro'), urls.category('Notes'), urls.series('Guide'),
    urls.rss(), urls.jsonFeed(), urls.atom(), urls.sitemap(),
  ], ['/', '/blog', '/blog/page/2', '/links', '/blog/notes/first', '/tags/Astro', '/categories/Notes', '/series/Guide', '/rss.xml', '/feed.json', '/atom.xml', '/sitemap.xml']);
  for (const value of ['/assets/image.png', '/blog?q=Astro#results', '#heading', './image.png', '//cdn.test/image.png', 'https://other.test/post']) {
    assert.equal(withBase(value), value);
  }
  assert.equal(prefixRoute('/links'), '/links');
  assert.equal(withoutBase('/blog/notes'), '/blog/notes');
  assert.equal(deploymentUrl(origin), origin + '/');
  assert.equal(absoluteUrl('/rss.xml', origin), origin + '/rss.xml');
});

test('authored links are prefixed once while logical pages retain identities matching the deployment directory', () => {
  const urls = createUrls(base);
  for (const [authored, expected] of [
    ['/', '/blog-site/'],
    ['/images/中文.png?size=2#large', '/blog-site/images/中文.png?size=2#large'],
    ['/blog-site', '/blog-site'],
    ['/blog-site/images/photo.png', '/blog-site/images/photo.png'],
    ['/blog-site-other/links', '/blog-site/blog-site-other/links'],
    ['#heading', '#heading'],
    ['./photo.png', './photo.png'],
    ['//cdn.test/photo.png', '//cdn.test/photo.png'],
    ['https://other.test/photo.png', 'https://other.test/photo.png'],
    ['data:image/png;base64,AAAA', 'data:image/png;base64,AAAA'],
  ]) {
    assert.equal(withBase(authored, base), expected);
    assert.equal(withBase(withBase(authored, base), base), expected);
  }
  assert.equal(urls.home(), '/blog-site/');
  assert.equal(urls.page('blog-site'), '/blog-site/blog-site');
  assert.equal(urls.page('blog-site/links'), '/blog-site/blog-site/links');
  assert.equal(prefixRoute('/blog-site/links', base), '/blog-site/blog-site/links');
  assert.equal(withoutBase(urls.page('blog-site/links'), base), '/blog-site/links');
  assert.equal(withoutBase(urls.home(), base), '/');
  assert.equal(urls.page('中文/独立页'), '/blog-site/' + encodeURIComponent('中文') + '/' + encodeURIComponent('独立页'));
  assert.equal(urls.post('Cafe\u0301/开始'), '/blog-site/blog/Caf%C3%A9/' + encodeURIComponent('开始'));
  const filtered = new URL(urls.archivePage(2, { tag: '中文/笔记', category: '代码', q: 'Astro + 中文' }), origin);
  assert.equal(filtered.pathname, '/blog-site/tags/' + encodeURIComponent('中文~2F笔记') + '/page/2');
  assert.equal(filtered.searchParams.get('category'), '代码');
  assert.equal(filtered.searchParams.get('q'), 'Astro + 中文');
});

test('Unicode deployment bases accept matching site URLs and preserve raw or encoded route suffixes', () => {
  const unicodeBase = '/博客/';
  const encodedBase = '/%E5%8D%9A%E5%AE%A2/';
  const encodedPrefix = encodedBase.slice(0, -1);
  assert.equal(normalizeBase(unicodeBase), encodedBase);
  assert.equal(normalizeBase(encodedBase), encodedBase);
  for (const siteUrl of [origin + unicodeBase, origin + encodedBase]) {
    assert.equal(deploymentUrl(siteUrl, unicodeBase), origin + encodedBase);
    assert.equal(deploymentUrl(siteUrl, encodedBase), origin + encodedBase);
  }
  for (const prefix of ['/博客', encodedPrefix]) {
    for (const suffix of ['/images/图像.png?q=中文#片段', '?q=中文#片段', '#片段', '/']) {
      const authored = prefix + suffix;
      assert.equal(withBase(authored, unicodeBase), authored);
      assert.equal(withBase(withBase(authored, encodedBase), unicodeBase), authored);
      const logical = suffix.startsWith('/') ? suffix : '/' + suffix;
      assert.equal(withoutBase(authored, unicodeBase), logical);
      assert.equal(withoutBase(authored, encodedBase), logical);
    }
  }
  assert.equal(withBase('/images/photo.png?size=2#large', unicodeBase), encodedBase + 'images/photo.png?size=2#large');
  assert.equal(absoluteUrl('/博客/feed.json', origin + encodedBase), origin + encodedBase + 'feed.json');
  assert.equal(absoluteUrl(encodedBase + 'feed.json', origin + unicodeBase), origin + encodedBase + 'feed.json');
  assert.equal(prefixRoute('/博客/links', unicodeBase), encodedPrefix + '/博客/links');
  const sameNamePage = createUrls(unicodeBase).page('博客/links');
  assert.equal(sameNamePage, encodedPrefix + encodedBase + 'links');
  assert.equal(withoutBase(sameNamePage, unicodeBase), encodedBase + 'links');
});

test('deployment origins and absolute URLs use the configured base without duplicating prefixes', () => {
  assert.equal(normalizeBase('blog-site'), base);
  assert.equal(normalizeBase('/blog-site'), base);
  for (const input of [origin, origin + base, origin + '/blog-site']) {
    assert.equal(deploymentUrl(input, base), origin + base);
  }
  for (const input of [origin + '/elsewhere/', origin + '/?preview=true', origin + '/#preview']) {
    assert.throws(() => deploymentUrl(input, base), /site.url pathname/);
  }
  const siteUrl = deploymentUrl(origin, base);
  for (const [value, expected] of [
    ['/feed.json', origin + base + 'feed.json'],
    ['/blog-site/feed.json', origin + base + 'feed.json'],
    ['feed.json', origin + base + 'feed.json'],
    ['/blog/中文?source=feed#开头', origin + base + 'blog/' + encodeURIComponent('中文') + '?source=feed#' + encodeURIComponent('开头')],
    ['https://original.test/article', 'https://original.test/article'],
    ['//cdn.test/image.png', 'https://cdn.test/image.png'],
  ]) assert.equal(absoluteUrl(value, siteUrl), expected);
});

test('SEO and all feed formats emit absolute deployment URLs for entries, self links and author assets', () => {
  const urls = createUrls(base);
  const site = {
    title: 'Deployment', description: 'Notes', url: deploymentUrl(origin, base), language: 'zh-CN',
    profile: { name: 'Author', avatar: '/avatar.png' }, feed: { content: 'summary', limit: 20 },
  };
  const post = {
    id: '中文', url: urls.post('中文'), title: '中文文章', description: 'Summary',
    publishedAt: '2026-01-01T00:00:00.000Z', protected: false, cover: '/cover.png',
    tags: [], category: { id: 'notes', label: 'Notes', url: urls.category('Notes') },
  };
  const articleUrl = origin + '/blog-site/blog/' + encodeURIComponent('中文');
  const seo = pageSeo(site, post.title, post.description, post.url, post);
  assert.equal(seo.canonical, articleUrl);
  assert.equal(seo.image, origin + base + 'cover.png');
  assert.equal(seo.jsonLd.author[0].url, origin + base + 'about');
  assert.deepEqual(seo.feeds, { rss: origin + base + 'rss.xml', json: origin + base + 'feed.json', atom: origin + base + 'atom.xml' });
  const json = JSON.parse(generateJsonFeed(site, [post]));
  assert.equal(json.feed_url, origin + base + 'feed.json');
  assert.equal(json.items[0].url, articleUrl);
  assert.equal(json.items[0].image, origin + base + 'cover.png');
  assert.equal(json.authors[0].url, origin + base + 'about');
  assert.equal(json.authors[0].avatar, origin + base + 'avatar.png');
  const rss = generateRss(site, [post]);
  assert.ok(rss.includes('<atom:link href="' + origin + base + 'rss.xml"'));
  assert.ok(rss.includes('<link>' + articleUrl + '</link>'));
  const atom = generateAtom(site, [post]);
  assert.ok(atom.includes('<id>' + origin + base + 'atom.xml</id>'));
  assert.ok(atom.includes('<link href="' + articleUrl + '"'));
});


test('SDK endpoint and asset URLs respect subdirectory deployment without double prefixes', () => {
  const urls = createUrls('/博客/');
  const prefix = '/%E5%8D%9A%E5%AE%A2';
  assert.equal(urls.searchIndex(), prefix + '/search-index.json');
  assert.equal(urls.robots(), prefix + '/robots.txt');
  assert.equal(urls.asset('/images/logo.svg?x=1#icon'), prefix + '/images/logo.svg?x=1#icon');
  assert.equal(urls.asset(urls.asset('/images/logo.svg')), prefix + '/images/logo.svg');
  for (const value of ['https://cdn.example/logo.svg', '//cdn.example/logo.svg', './logo.svg', '#icon']) assert.equal(urls.asset(value), value);
  assert.equal(createUrls().searchIndex(), '/search-index.json');
});

test('series archive pagination encodes taxonomy labels and preserves combined query filters', () => {
  const urls = createUrls('/notes/');
  const series = '中文/Guide';
  assert.equal(urls.archivePage(1, { series }), urls.series(series));
  assert.equal(urls.archivePage(3, { series }), urls.series(series) + '/page/3');
  const combined = new URL(urls.archivePage(2, { tag: 'Web', category: 'Code', series, q: 'Astro & 中文' }), origin);
  assert.equal(combined.pathname, '/notes/tags/Web/page/2');
  assert.equal(combined.searchParams.get('series'), series);
  assert.equal(combined.searchParams.get('category'), 'Code');
  assert.equal(combined.searchParams.get('q'), 'Astro & 中文');
  assert.equal(new URL(urls.archive({ series }), origin).searchParams.get('series'), series);
  for (const page of [0, -1, 1.5, NaN, Infinity]) assert.throws(() => urls.archivePage(page, { series }), /positive integer/);
});
