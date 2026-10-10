import assert from 'node:assert/strict';
import test from 'node:test';
import { runtime } from './helpers/runtime.mjs';

const active = { definition: { manifest: { id: 'fixture' }, capabilities: { encryptedPosts: true } }, settings: {} };
const post = (id, data = {}, body = 'Public searchable keyword') => ({ id, body, data: {
  title: id, description: 'Public summary', pubDate: '2020-01-01', draft: false, tags: ['Web'], category: 'Code', ...data,
} });
const page = (id, data = {}) => ({ id, body: 'Private collection source', data: { title: id, description: '', draft: false, ...data } });
const blog = [post('open', { slug: 'renamed' }), post('locked', { password: 'PASSWORD_SENTINEL', description: 'PRIVATE_SUMMARY', seo: { description: 'PRIVATE_SEO' } }, 'PRIVATE_BODY'),
  post('draft', { draft: true }, 'DRAFT_BODY'), post('future', { pubDate: '2999-01-01' }, 'FUTURE_BODY'),
  post('hidden', { seo: { noindex: true } }, 'NOINDEX_BODY')];
const pages = [page('links', { slug: 'resources' }), page('draft-page', { draft: true })];

test('production context and search endpoint preserve publication and protected-content boundaries', async t => {
  // An inherited preview flag must not expose drafts in production.
  const host = await runtime(t, { blog, pages, previewDrafts: true });
  const { createThemeContext } = await host.load('src/engine/context.ts');
  const theme = await createThemeContext(active);
  assert.deepEqual((await theme.content.posts()).items.map(p => p.id), ['open', 'locked', 'hidden']);
  assert.equal(await theme.content.post('draft'), null);
  assert.equal(await theme.content.page('draft-page'), null);
  assert.equal(await theme.content.page('resources'), null);
  assert.equal((await theme.content.page('links')).url, '/notes/resources');
  assert.equal((await theme.content.post('open')).url, '/notes/blog/renamed');
  const locked = await theme.content.post('locked');
  assert.equal(locked.protected, true);
  assert.equal(locked.wordCount, undefined);
  assert.doesNotMatch(JSON.stringify(locked), /PASSWORD_SENTINEL|PRIVATE_/);
  const index = await theme.search.index();
  assert.deepEqual(index.map(p => p.id), ['open', 'locked']);
  assert.equal(index.find(p => p.id === 'locked').text, undefined);
  const { GET } = await host.load('src/routes/search-index.json.ts');
  const response = await GET();
  assert.match(response.headers.get('content-type'), /application\/json/);
  const payload = await response.json();
  assert.deepEqual(payload.index, index);
  assert.deepEqual(payload.posts.map(p => p.id), ['open', 'locked']);
  assert.doesNotMatch(JSON.stringify(payload), /PASSWORD_SENTINEL|PRIVATE_|DRAFT_BODY|FUTURE_BODY|NOINDEX_BODY/);
  await assert.rejects(createThemeContext({ ...active, definition: { ...active.definition, capabilities: {} } }), /encryptedPosts/);
});

test('explicit local preview exposes draft metadata but public search never leaks preview or noindex bodies', async t => {
  const host = await runtime(t, { dev: true, previewDrafts: true, blog, pages });
  const { createThemeContext } = await host.load('src/engine/context.ts');
  const theme = await createThemeContext(active);
  assert.equal((await theme.content.post('draft')).preview, true);
  assert.equal((await theme.content.post('future')).preview, true);
  assert.equal((await theme.content.page('draft-page')).preview, true);
  assert.deepEqual((await theme.search.index()).map(p => p.id), ['open', 'locked']);
  assert.equal((await theme.content.posts({ q: 'DRAFT_BODY' })).total, 0);
  assert.equal((await theme.content.posts({ q: 'NOINDEX_BODY' })).total, 0);
  const { GET } = await host.load('src/routes/search-index.json.ts');
  assert.doesNotMatch(await (await GET()).text(), /DRAFT_BODY|FUTURE_BODY|NOINDEX_BODY|PRIVATE_|PASSWORD_SENTINEL/);
});

test('ordinary development keeps drafts hidden unless preview is explicitly enabled', async t => {
  const host = await runtime(t, { dev: true, blog, pages });
  const { createThemeContext } = await host.load('src/engine/context.ts');
  const theme = await createThemeContext(active);
  assert.equal(await theme.content.post('draft'), null);
  assert.equal(await theme.content.post('future'), null);
  assert.equal(await theme.content.page('draft-page'), null);
});

test('series query, pagination and full-text slices retain correct identities, order and totals', async t => {
  const items = [post('last', { series: 'Guide', pubDate: '2020-01-04' }),
    post('second', { series: 'Guide', seriesOrder: 2, pubDate: '2020-01-03' }),
    post('first', { series: 'Guide', seriesOrder: 1 }), post('other', { pinned: true })];
  const host = await runtime(t, { blog: items });
  const { createThemeContext } = await host.load('src/engine/context.ts');
  const theme = await createThemeContext(active);
  assert.deepEqual((await theme.content.series('Guide')).map(p => p.id), ['first', 'second', 'last']);
  assert.deepEqual(await theme.content.series('missing'), []);
  const slice = await theme.content.posts({ series: 'guide', q: 'keyword', offset: 1, limit: 1 });
  assert.equal(slice.total, 3);
  assert.deepEqual(slice.items.map(p => p.id), ['second']);
  assert.equal((await theme.content.posts({ limit: 0 })).total, 4);
  assert.deepEqual((await theme.content.posts({ limit: 0 })).items, []);
  await assert.rejects(theme.content.posts({ offset: -1 }), /non-negative/);
  await assert.rejects(theme.content.posts({ limit: 1.5 }), /non-negative/);
  const { archivePage } = await host.load('src/server/pages.ts');
  const archive = await archivePage(theme, { kind: 'series', label: 'Guide', number: 2 });
  assert.deepEqual(archive.posts.map(p => p.id), ['last']);
  assert.equal(archive.pagination.totalItems, 3);
  assert.equal(archive.pagination.previous, '/notes/series/Guide');
  assert.equal(archive.pagination.next, null);
  assert.equal(archive.url, '/notes/series/Guide/page/2');
  assert.equal(archive.seo.canonical, 'https://example.test/notes/series/Guide/page/2');
  await assert.rejects(archivePage(theme, { kind: 'series', label: 'Guide', number: 3 }), /Unknown archive page/);
});
