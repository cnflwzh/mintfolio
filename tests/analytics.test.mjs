import assert from 'node:assert/strict';
import test from 'node:test';
import { injectGoogleAnalytics } from '../src/server/analytics.ts';
import { defineSiteConfig } from '@mintfolio/core/config';
import { runtime } from './helpers/runtime.mjs';

const html = '<!doctype html><html><head><title>Example</title></head><body>Original body</body></html>';

test('analytics config rejects executable or invalid IDs, preserves opt-out and leaves input unchanged', () => {
  const base = { site: { title: 'Test', url: 'https://example.test' } };
  const input = { ...base, analytics: { google: { measurementId: ' G-TEST123 ', enabled: false } } };
  const result = defineSiteConfig(input);
  assert.deepEqual(result.analytics.google, { measurementId: 'G-TEST123', enabled: false });
  assert.equal(input.analytics.google.measurementId, ' G-TEST123 ');
  for (const google of [{ measurementId: '</script><script>bad()</script>' }, { measurementId: 'UA-123' }, { measurementId: 'G-TEST123', enabled: 'false' }]) {
    assert.throws(() => defineSiteConfig({ ...base, analytics: { google } }), /analytics.google/);
  }
});

test('analytics injection is idempotent, preserves surrounding bytes and refuses duplicate legacy loaders', () => {
  const injected = injectGoogleAnalytics(html, 'G-TEST123');
  const marker = '<script data-mintfolio-analytics="google"';
  const start = injected.indexOf(marker), end = injected.indexOf('</script>', start) + '</script>'.length;
  assert.ok(start > 0);
  assert.equal(injected.slice(0, start) + injected.slice(end), html);
  assert.equal(injectGoogleAnalytics(injected, 'G-TEST123'), injected);
  assert.equal(injectGoogleAnalytics('<p>Fragment</p>', 'G-TEST123'), '<p>Fragment</p>');
  const legacy = html.replace('</head>', '<script src="https://www.googletagmanager.com/gtag/js?id=G-OLD"></script></head>');
  assert.throws(() => injectGoogleAnalytics(legacy, 'G-TEST123'), /sole owner/);
  assert.throws(() => injectGoogleAnalytics(html, 'G-INVALID"'), /Invalid Google/);
});

test('HTML response instrumentation preserves status and cookies but drops stale representation headers', async t => {
  const host = await runtime(t);
  const { onRequest } = await host.load('src/server/analytics-middleware.ts');
  const original = new Response(html, { status: 404, headers: {
    'content-type': 'text/html; charset=utf-8', 'content-length': String(Buffer.byteLength(html)),
    etag: '"old"', 'last-modified': 'Wed, 01 Jan 2020 00:00:00 GMT', 'set-cookie': 'session=test; HttpOnly', 'cache-control': 'no-store',
  } });
  const response = await onRequest({ request: new Request('https://example.test/missing') }, async () => original);
  assert.equal(response.status, 404);
  assert.equal(response.headers.get('set-cookie'), 'session=test; HttpOnly');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  for (const header of ['content-length', 'etag', 'last-modified']) assert.equal(response.headers.has(header), false);
  assert.match(await response.text(), /data-mintfolio-analytics="google"/);
  const already = new Response(injectGoogleAnalytics(html, 'G-TEST123'), { headers: { 'content-type': 'text/html', etag: '"valid"' } });
  const unchanged = await onRequest({ request: new Request('https://example.test/') }, async () => already);
  assert.equal(unchanged.headers.get('etag'), '"valid"');
});

test('analytics middleware leaves non-HTML, redirects, HEAD and compressed responses unread', async t => {
  const host = await runtime(t);
  const { onRequest } = await host.load('src/server/analytics-middleware.ts');
  const cases = [
    [new Response('{"ok":true}', { headers: { 'content-type': 'application/json' } }), 'GET'],
    [new Response('<feed/>', { headers: { 'content-type': 'application/atom+xml' } }), 'GET'],
    [new Response(null, { status: 302, headers: { location: '/new', 'content-type': 'text/html' } }), 'GET'],
    [new Response(null, { status: 204 }), 'GET'],
    [new Response(html, { headers: { 'content-type': 'text/html' } }), 'HEAD'],
    [new Response(new Uint8Array([31,139,8]), { headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' } }), 'GET'],
  ];
  for (const [original, method] of cases) {
    assert.equal(await onRequest({ request: new Request('https://example.test/', { method }) }, async () => original), original);
    assert.equal(original.bodyUsed, false);
  }
});

test('development, disabled and absent analytics never instrument HTML', async t => {
  for (const options of [{ dev: true }, { google: { measurementId: 'G-TEST123', enabled: false } }, { google: null }]) {
    const host = await runtime(t, options);
    const { onRequest } = await host.load('src/server/analytics-middleware.ts');
    const original = new Response(html, { headers: { 'content-type': 'text/html' } });
    assert.equal(await onRequest({ request: new Request('https://example.test/') }, async () => original), original);
    assert.equal(original.bodyUsed, false);
  }
});
