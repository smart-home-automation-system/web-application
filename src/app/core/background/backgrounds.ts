/**
 * The photos a view can have behind the glass, by name: `public/backgrounds/<name>-2560.webp`
 * and `<name>-1280.webp`, made by `scripts/make-background.mjs`. A route names its photo in
 * `data.background`; a route without one shows the plain glow.
 */
export const BACKGROUNDS = ['home', 'heating', 'water', 'boiler', 'presence'] as const;

export type BackgroundName = (typeof BACKGROUNDS)[number];

export function isBackgroundName(value: unknown): value is BackgroundName {
  return (BACKGROUNDS as readonly unknown[]).includes(value);
}

/** The `srcset` of a photo: the browser picks the file by the width of the screen. */
export function backgroundSrcset(name: BackgroundName): string {
  return `backgrounds/${name}-1280.webp 1280w, backgrounds/${name}-2560.webp 2560w`;
}
