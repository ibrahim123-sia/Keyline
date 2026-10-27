/**
 * Resized copies of library images (/media/<key>?w=&q=). The /media route only makes these
 * widths and qualities (the same lists next/image uses), so links stay cacheable. Client-safe.
 */
export const variantWidths = [64, 128, 256, 384, 640, 750, 828, 1080, 1200, 1920, 2048, 3840];
export const variantQualities = [60, 75, 90];

const isSvg = (url: string) => /\.svg($|\?)/i.test(url);

/** The smallest made width that is at least `width`. */
export const variantWidth = (width: number): number =>
  variantWidths.find((w) => w >= width) ?? variantWidths.at(-1)!;

export function mediaVariant(url: string, width: number, quality = 75): string {
  return isSvg(url) ? url : `${url}?w=${variantWidth(width)}&q=${quality}`;
}

/** `srcset` from `min` to `max` pixels wide (SVGs need none). */
export function mediaSrcSet(url: string, max = 1920, min = 256, quality = 75): string | undefined {
  if (isSvg(url)) return undefined;
  return variantWidths
    .filter((w) => w >= min && w <= max)
    .map((w) => `${url}?w=${w}&q=${quality} ${w}w`)
    .join(", ");
}
