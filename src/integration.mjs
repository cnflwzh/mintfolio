import themeRuntime from './engine/integration.mjs';

/**
 * Public engine entry: a consuming site owns content/config, Core injects routes.
 * @param {import('./integration').MintfolioOptions} [options]
 * @returns {import('astro').AstroIntegration}
 */
export default function mintfolio(options = {}) {
  return themeRuntime(options, { routes: true, siteConfig: options.siteConfig });
}
