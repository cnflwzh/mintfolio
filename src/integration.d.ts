import type { AstroIntegration } from 'astro';
import type { ThemeConfiguration } from '@mintfolio/theme-api';

/** Build-time engine options. Omitted theme selects Core's lightweight Minimal. */
export interface MintfolioOptions extends Partial<ThemeConfiguration> {
  /** Site module is compiled by Astro, so local image imports remain supported. */
  siteConfig?: string;
}
/** Inject Core-owned blog routes and compile exactly one selected theme. */
export default function mintfolio(options?: MintfolioOptions): AstroIntegration;
