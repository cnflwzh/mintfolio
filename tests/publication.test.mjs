import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationState } from '../src/shared/publication.mjs';
import { selectPublishedPosts, toPostSummary } from '../src/server/postModel.ts';

test('publication states share an explicit cutoff, timezone offsets and the inclusive release boundary', () => {
  const now = new Date('2026-10-01T01:00:00Z');
  const cases = [
    [{ draft: true, pubDate: '2026-09-01' }, 'draft'],
    [{ draft: true, pubDate: '2026-10-02' }, 'draft'],
    [{ draft: false, pubDate: '2026-10-01T09:00:00+08:00' }, 'publishable'],
    [{ draft: false, pubDate: '2026-10-01T01:00:00.001Z' }, 'scheduled'],
    [{ pubDate: '2026-10-01' }, 'publishable'],
    [{ pubDate: new Date(now) }, 'publishable'],
    [{ pubDate: now.valueOf() }, 'publishable'],
  ];
  for (const [fields, expected] of cases) {
    const source = Object.freeze(fields);
    assert.equal(publicationState(source, now), expected);
  }
  assert.equal(now.toISOString(), '2026-10-01T01:00:00.000Z');
  const future = { pubDate: '2026-10-01T01:00:00.001Z' };
  assert.equal(publicationState(future, new Date('2026-10-01T01:00:00.001Z')), 'publishable');
});

test('build selection and preview badges classify the same cutoff without exposing protected fields', () => {
  const now = new Date('2026-10-01T01:00:00Z');
  const record = (id, overrides = {}) => ({
    id,
    data: { title: id, description: 'Public description', pubDate: new Date(now), draft: false, ...overrides },
  });
  const future = record('future', {
    pubDate: new Date('2026-10-01T01:00:00.001Z'),
    password: 'PRIVATE_PASSWORD_SENTINEL',
    description: 'PRIVATE_DESCRIPTION_SENTINEL',
  });
  const draft = record('draft', { draft: true, pubDate: new Date('2020-01-01') });
  const rows = [future, record('boundary'), draft, record('pinned', { pinned: true, pubDate: new Date('2020-01-01') })];
  const selected = selectPublishedPosts(rows, { now });
  assert.deepEqual(selected.map(post => post.id), ['pinned', 'boundary']);
  assert.ok(selected.every(post => publicationState(post.data, now) === 'publishable'));
  const preview = selectPublishedPosts(rows, { now, preview: true });
  assert.equal(preview.length, rows.length);
  for (const post of preview) {
    const summary = toPostSummary(post, { now, preview: true });
    assert.equal(Boolean(summary.preview), publicationState(post.data, now) !== 'publishable');
  }
  assert.equal(toPostSummary(future, { preview: true, now: new Date('2026-10-01T01:00:00.001Z') }).preview, undefined);
  assert.equal(toPostSummary(future, { now }).preview, undefined);
  const protectedSummary = toPostSummary(future, { now, preview: true });
  assert.equal(protectedSummary.protected, true);
  assert.doesNotMatch(JSON.stringify(protectedSummary), /PRIVATE_PASSWORD_SENTINEL|PRIVATE_DESCRIPTION_SENTINEL/);
  assert.deepEqual(rows.map(post => post.id), ['future', 'boundary', 'draft', 'pinned']);
  assert.equal(draft.data.draft, true);
});
