import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const { createServer } = await import(pathToFileURL(createRequire(import.meta.resolve('astro')).resolve('vite')).href);

/** Load real Core modules through Vite; only Astro's collection/config boundary is supplied by the fixture. */
export async function runtime(t, { dev = false, previewDrafts = false, blog = [], pages = [], google = { measurementId: 'G-TEST123' } } = {}) {
  const collections = { blog, pages };
  const config = { site: { title: 'Runtime fixture', url: 'https://example.test', language: 'en' }, blog: { pageSize: 2 },
    ...(google ? { analytics: { google } } : {}), profile: { avatar: '/avatar.svg' } };
  const prefix = String.fromCharCode(0) + 'fixture:';
  const modules = {
    'astro:content': 'const collections = ' + JSON.stringify(collections) + '; for (const rows of Object.values(collections)) for (const row of rows) { if(row.data.pubDate) row.data.pubDate=new Date(row.data.pubDate); } export async function getCollection(name) { return collections[name] ?? []; }',
    'virtual:mintfolio/runtime': 'export const previewDrafts=' + JSON.stringify(previewDrafts) + '; export const publishedBefore="2026-01-01T00:00:00.000Z";',
    'virtual:mintfolio/site-config': 'export default ' + JSON.stringify(config),
    'astro:middleware': 'export { defineMiddleware } from "astro/middleware";',
  };
  const server = await createServer({ root, configFile: false, envFile: false, base: '/notes/', logLevel: 'error',
    mode: dev ? 'development' : 'production',
    define: { 'import.meta.env.DEV': JSON.stringify(dev), 'import.meta.env.PROD': JSON.stringify(!dev) },
    server: { middlewareMode: true, ws: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [{ name: 'test-astro-boundary', enforce: 'pre',
      resolveId(id) { if (Object.hasOwn(modules, id)) return prefix + id; },
      load(id) { if (id.startsWith(prefix)) return modules[id.slice(prefix.length)]; },
    }],
  });
  t.after(() => server.close());
  return { load: (file) => server.ssrLoadModule('/' + file) };
}
