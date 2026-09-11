import assert from 'node:assert/strict';
import test from 'node:test';
import { createPostListController } from '@mintfolio/core/client';

const items = [
  { id: 'a', title: 'Astro guide', category: 'development', tags: ['astro'], description: '' },
  { id: 'b', title: 'Astro diary', category: 'journal', tags: ['astro'], description: '' },
  { id: 'c', title: 'React guide', category: 'development', tags: ['react'], description: '' },
];
const index = (item) => ({ ...item, title: item.title.toLowerCase(), url: `/blog/${item.id}` });

test('shared list controller applies combined search/facets before pagination and resets on filter changes', () => {
  const list = createPostListController({ items, index, pageSize: 1 });
  const states = [];
  const unsubscribe = list.subscribe((value) => states.push(value));
  assert.equal(states.length, 1);
  assert.equal(list.value().visible[0], items[0]);
  assert.equal(list.value().hasMore, true);
  list.loadMore();
  assert.deepEqual(list.value().visible, items.slice(0, 2));
  list.setFilters({ q: 'GUIDE', category: 'Development' });
  assert.equal(list.value().limit, 1);
  assert.deepEqual(list.value().matches, [items[0], items[2]]);
  assert.deepEqual(list.value().facets.tags, ['astro', 'react']);
  list.setFilters({ tag: 'ASTRO' });
  assert.deepEqual(list.value().visible, [items[0]]);
  assert.equal(list.value().hasMore, false);
  assert.deepEqual(list.value().facets.categories, ['development', 'journal']);
  list.setFilters({ tag: 'unknown' });
  assert.equal(list.value().total, 0);
  unsubscribe();
  const count = states.length;
  list.setFilters({ tag: '' });
  assert.equal(states.length, count);
  list.dispose();
  const final = list.value();
  list.loadMore();
  list.setFilters({ q: '' });
  assert.deepEqual(list.value(), final);
});

test('facet reconciliation is an explicit UI policy and saved pagination can be restored', () => {
  const list = createPostListController({ items, index, pageSize: 1, reconcileFacets: true });
  list.setFilters({ tag: 'react', category: 'journal' });
  assert.equal(list.value().filters.tag, '');
  assert.deepEqual(list.value().visible, [items[1]]);
  list.setFilters({ category: '' });
  list.setLimit(3);
  assert.deepEqual(list.value().visible, items);
  assert.throws(() => list.setLimit(0), /positive/);
  assert.throws(() => createPostListController({ items, index, initialFilters: { q: null } }), /Filters/);
  list.dispose();
});
