declare module 'virtual:mintfolio/theme' {
  /** Host-only selected theme; theme packages consume injected public props. */
  export const activeTheme: import('./context').ActiveTheme;
  /** Each concrete renderer narrows page/settings; the dispatcher accepts the public union. */
  export function getRenderer(kind: import('@mintfolio/theme-api').PageKind):
    (props: import('@mintfolio/theme-api/astro').PageProps) => ReturnType<typeof import('../fallback/pages/not-found.astro').default>;
}

declare module 'virtual:mintfolio/site-config' {
  const config: import('../public/config').SiteConfigInput;
  export default config;
}
