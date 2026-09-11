/**
 * Values validated from Minimal's manifest settings before a page renderer runs.
 * maxWidth is a pixel value; accentColor is a validated hexadecimal CSS color.
 */
export interface MinimalSettings {
  readonly maxWidth: number;
  readonly accentColor: string;
}
