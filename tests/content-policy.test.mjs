import assert from 'node:assert/strict';
import test from 'node:test';
import { createSearchEntry, filterPosts, searchPosts } from '@mintfolio/theme-api/search';
import {
  collectArchives, collectTaxonomy, isProtectedPost, PROTECTED_POST_DESCRIPTION,
  selectPublishedPosts, toPostSummary, UNCATEGORIZED,
} from '../src/server/postModel.ts';
import { urls } from '../src/server/routing.ts';

/** In-memory validated content, with extra private fields to exercise the allowlist. */
function record(id, data = {}) {
  return {
    id,
    body: 'Private source body that must not become a public property',
    filePath: '/private/content/location.md',
    data: {
      title: 'A public title', description: 'Public introduction',
      pubDate: new Date('2026-09-01T12:00:00Z'), draft: false,
      internalEditorialNote: 'Private editorial metadata',
      ...data,
    },
  };
}

test('the collection publication policy omits drafts and sorts without changing source records', () => {
  const old = record('old', { pubDate: new Date('2026-01-01') });
  const draft = record('draft', { draft: true, pubDate: new Date('2027-01-01') });
  const newest = record('newest', { pubDate: new Date('2026-09-01') });
  const input = [old, draft, newest];
  assert.deepEqual(selectPublishedPosts(input).map((post) => post.id), ['newest', 'old']);
  assert.deepEqual(input.map((post) => post.id), ['old', 'draft', 'newest']);
  assert.equal(selectPublishedPosts(input)[0], newest);
});

test('public projection includes only safe metadata and preserves canonical encoded links', () => {
  const source = record('笔记/a b#c', { tags: ['C++', '日常 & 学习'], category: 'Web / 前端', cover: '/cover.webp' });
  const result = toPostSummary(source);
  assert.deepEqual(Object.keys(result).sort(), [
    'id', 'url', 'title', 'description', 'publishedAt', 'tags', 'category', 'cover', 'protected',
  ].sort());
  assert.equal(result.description, source.data.description);
  assert.equal(result.publishedAt, '2026-09-01T12:00:00.000Z');
  assert.equal(result.url, '/blog/%E7%AC%94%E8%AE%B0/a%20b%23c');
  assert.equal(result.protected, false);
  assert.equal(result.tags[0].url, urls.tag('C++'));
  assert.equal(result.category.url, '/categories/'+encodeURIComponent('Web ~2F 前端'));
  assert.equal('password' in result, false);
  assert.equal('body' in result, false);
  assert.equal('data' in result, false);
  assert.deepEqual(toPostSummary(record('uncategorized')).category, {
    id: UNCATEGORIZED, label: UNCATEGORIZED, url: urls.category(UNCATEGORIZED),
  });
});

test('protected summaries and search entries never contain passwords, bodies, or private descriptions', () => {
  const source = record('private/entry', {
    password: 'private-long-password', description: 'Secret summary not intended for publication',
  });
  const result = toPostSummary(source);
  const serialized = JSON.stringify({ result, search: createSearchEntry(result) });
  assert.equal(isProtectedPost(source), true);
  assert.equal(result.protected, true);
  assert.equal(result.description, PROTECTED_POST_DESCRIPTION);
  for (const secret of [source.data.password, source.data.description, source.body, source.filePath, source.data.internalEditorialNote]) {
    assert.equal(serialized.includes(secret), false);
  }
  // Search uses only the public projection, even if a visitor guesses secret text.
  assert.deepEqual(filterPosts([result], { q: 'Secret summary' }), []);
  assert.deepEqual(searchPosts([createSearchEntry(result)], { q: 'Secret summary' }), []);
  assert.equal(filterPosts([result], { q: 'A PUBLIC TITLE' }).length, 1);
});

test('taxonomy counts each label once per article and includes safe protected metadata', () => {
  const posts = [
    toPostSummary(record('one', { tags: ['Astro', 'Astro', 'TypeScript'], category: 'Development' })),
    toPostSummary(record('two', { tags: ['Astro'], password: 'a-long-test-password', category: 'Development' })),
    toPostSummary(record('three', { tags: ['TypeScript'] })),
  ];
  assert.deepEqual(collectTaxonomy(posts, 'tags').map(({ label, count }) => [label, count]), [['Astro', 2], ['TypeScript', 2]]);
  assert.deepEqual(collectTaxonomy(posts, 'categories').map(({ label, count }) => [label, count]), [['Development', 2], [UNCATEGORIZED, 1]]);
  assert.deepEqual(collectTaxonomy([], 'tags'), []);
});

test('monthly archives use UTC boundaries and retain the source post order within a month', () => {
  const posts = [
    toPostSummary(record('september', { pubDate: new Date('2026-09-02T00:00:00Z') })),
    toPostSummary(record('boundary', { pubDate: new Date('2026-09-01T00:30:00+08:00') })),
    toPostSummary(record('august', { pubDate: new Date('2026-08-01T00:00:00Z') })),
  ];
  const groups = collectArchives(posts);
  assert.deepEqual(groups.map(({ id, year, month, count }) => ({ id, year, month, count })), [
    { id: '2026-09', year: 2026, month: 9, count: 1 },
    { id: '2026-08', year: 2026, month: 8, count: 2 },
  ]);
  assert.deepEqual(groups[1].posts.map((post) => post.id), ['boundary', 'august']);
  assert.equal(groups[0].posts[0], posts[0]);
  assert.deepEqual(collectArchives([]), []);
});


test('scheduled publication uses an explicit cutoff and preview never mutates records', () => {
  const now=new Date('2026-09-12T00:00:00Z');
  const rows=[record('future',{pubDate:new Date('2026-09-12T00:00:01Z')}),record('draft',{draft:true}),record('live',{pubDate:now}),record('pinned',{pinned:true,pubDate:new Date('2020-01-01')})];
  assert.deepEqual(selectPublishedPosts(rows,{now}).map(p=>p.id),['pinned','live']);
  assert.equal(selectPublishedPosts(rows,{now,preview:true}).length,4);
  assert.equal(rows[1].data.draft,true);
});

test('stable slugs and public author metadata are explicit; private SEO cannot reveal summaries', () => {
  const authors=[{id:'ada',name:'Ada',url:'https://example.com/ada'}];
  const post=toPostSummary(record('source-file',{slug:'guides/稳定地址',updatedAt:new Date('2026-09-09'),authors:['ada'],series:'深入学习',seriesOrder:2}),{authors});
  assert.equal(post.url,'/blog/guides/'+encodeURIComponent('稳定地址'));
  assert.equal(post.updatedAt,'2026-09-09T00:00:00.000Z');
  assert.deepEqual(post.authors,authors);
  assert.equal(post.series.order,2);
  assert.throws(()=>toPostSummary(record('bad',{authors:['missing']}),{authors}),/Unknown author/);
  const protectedPost=toPostSummary(record('secret',{password:'test-secret-password',seo:{description:'private description',image:'/private-image.png',noindex:true}}));
  assert.equal(JSON.stringify(protectedPost).includes('private'),false);
});


test('taxonomy routes are portable and preserve encoded labels and combined filters', () => {
  assert.equal(urls.tag('a/b'),'/tags/a~2Fb');
  assert.notEqual(urls.tag('a~2Fb'),urls.tag('a/b'));
  assert.equal(urls.tag('CON'),'/tags/~43ON');
  assert.equal(urls.tag('C: 系统'),'/tags/C~3A%20'+encodeURIComponent('系统'));
  assert.equal(urls.tag('尾点.'),'/tags/'+encodeURIComponent('尾点')+'~2E');
  assert.equal(urls.tag('Cafe\u0301'),urls.tag('Café'));
  const paged=new URL(urls.archivePage(2,{q:'Astro 中文',tag:'Web',category:'技术'}),'https://example.com');
  assert.equal(paged.pathname,'/tags/Web/page/2');
  assert.equal(paged.searchParams.get('q'),'Astro 中文');
  assert.equal(paged.searchParams.get('category'),'技术');
});
