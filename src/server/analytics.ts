import { ELEMENT_NODE, parse, walkSync, type ElementNode } from 'ultrahtml';

/**
 * Add Core's single Google bootstrap immediately before the document's closing head.
 * @param html Rendered HTML; original bytes are preserved outside the insertion.
 * @param measurementId Validated public GA4 ID, not executable configuration.
 * @returns The original HTML for a fragment or an already instrumented document.
 * @throws When an ID is invalid or a theme still loads Google Analytics itself.
 */
export function injectGoogleAnalytics(html: string, measurementId: string): string {
  if (!/^G-[A-Z0-9]+$/.test(measurementId)) {
    throw new Error('[mintfolio:analytics] Invalid Google measurement ID');
  }
  const tree = parse(html);
  const heads: ElementNode[] = [];
  walkSync(tree, (node) => {
    if (node.type === ELEMENT_NODE && node.name.toLowerCase() === 'head') heads.push(node);
  });
  const head = heads[0];
  const offset = head?.loc[1]?.start;
  if (!head || offset === undefined || !/^<\/head\s*>/i.test(html.slice(offset))) return html;

  let installed = false;
  let legacyLoader = false;
  walkSync(tree, (node) => {
    if (node.type !== ELEMENT_NODE || node.name.toLowerCase() !== 'script') return;
    if (node.attributes['data-mintfolio-analytics'] === 'google') installed = true;
    if (!node.attributes.src) return;
    try {
      const url = new URL(node.attributes.src, 'https://mintfolio.invalid');
      if (url.hostname === 'www.googletagmanager.com' && url.pathname === '/gtag/js') legacyLoader = true;
    } catch { /* Unrelated invalid URLs do not belong to Core analytics. */ }
  });
  if (installed) return html;
  if (legacyLoader) {
    throw new Error('[mintfolio:analytics] Remove the theme/custom gtag.js loader before enabling site.analytics.google; Core must be its sole owner.');
  }

  // GA4's own initial page view + Enhanced Measurement history tracking is one
  // reporting strategy. Do not also emit page_view on astro:page-load/popstate.
  // ClientRouter may execute this inline script again; the window guard survives
  // document swaps and prevents a second loader, config call or initial page view.
  const bootstrap = '(function(){'
    + 'var w=window,d=document,h=w.location.hostname;'
    + 'if(h==="localhost"||h.endsWith(".localhost")||h==="127.0.0.1"||h==="[::1]"||h==="::1")return;'
    + 'if(w.__mintfolioGoogleAnalytics)return;'
    + 'w.__mintfolioGoogleAnalytics=' + JSON.stringify(measurementId) + ';'
    + 'w.dataLayer=w.dataLayer||[];'
    + 'w.gtag=w.gtag||function(){w.dataLayer.push(arguments);};'
    + 'w.gtag("js",new Date());'
    + 'w.gtag("config",' + JSON.stringify(measurementId) + ');'
    + 'var s=d.createElement("script");s.async=true;'
    + 's.setAttribute("data-mintfolio-google-loader","");'
    + 's.src="https://www.googletagmanager.com/gtag/js?id="+' + JSON.stringify(measurementId) + ';'
    + 'd.head.appendChild(s);'
    + '})();';
  const tag = '<script data-mintfolio-analytics="google" data-astro-rerun>' + bootstrap + '</script>';
  return html.slice(0, offset) + tag + html.slice(offset);
}
