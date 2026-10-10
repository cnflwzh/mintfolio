import { defineMiddleware } from 'astro:middleware';
import { config } from './site';
import { injectGoogleAnalytics } from './analytics';

/**
 * Core-owned HTML response instrumentation, including prerendered pages and
 * theme overrides. Feeds, JSON, redirects, HEAD requests and dev remain untouched.
 * Installation is build-only; PROD is an additional guard for nonproduction builds.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  const google = config.analytics?.google;
  const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase();
  if (!import.meta.env.PROD || !google || google.enabled === false
    || context.request.method === 'HEAD' || response.status === 204
    || (response.status >= 300 && response.status < 400)
    || contentType !== 'text/html') return response;

  // Astro HTML is uncompressed here; never decode a user-supplied compressed body.
  const encoding = response.headers.get('content-encoding');
  if (encoding && encoding.toLowerCase() !== 'identity') return response;

  const original = await response.text();
  const html = injectGoogleAnalytics(original, google.measurementId);
  const headers = new Headers(response.headers);
  if (html !== original) {
    headers.delete('content-length');
    headers.delete('etag');
    headers.delete('last-modified');
  }
  return new Response(html, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
});
