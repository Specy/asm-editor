/**
 * Smaller copies of the large pictures under `static/`, which the build makes beside each one
 * ([responsive-images-plugin.ts](../../../scripts/responsive-images-plugin.ts)) so that a page can
 * show a picture at about the size it is drawn: a blog card drew a 1440-pixel screenshot 378
 * pixels wide. Which pictures get copies, and how wide; a copy is only made narrower than its
 * original. Plain data, read by the plugin in Node and by the pages.
 */
export const IMAGE_VARIANT_RULES: readonly { pattern: RegExp; widths: readonly number[] }[] = [
    // the home page's screenshots and the blog's
    { pattern: /^\/images\/(ASM-[\w-]+|blog\/[\w/-]+)\.(webp|png)$/, widths: [480, 960] }
]

/** The address of a picture's copy `width` pixels wide: `/images/a.webp` → `/images/a-480w.webp`. */
export function variantPath(src: string, width: number): string {
    return src.replace(/\.[a-z]+$/i, `-${width}w.webp`)
}
