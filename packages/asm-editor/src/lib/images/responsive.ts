import images from 'virtual:responsive-images'
import { variantPath } from './variants'

export type ResponsiveImage = {
    /** The build's smaller copies and the original, each with its width; none without copies. */
    srcset: string | undefined
    width: number | undefined
    height: number | undefined
}

/**
 * What lets the browser load the smallest copy of a static picture that is still sharp at the size
 * it is drawn ([variants.ts](./variants.ts)), with the `sizes` the page gives it. A picture without
 * copies gets no `srcset`, and the browser loads `src` as before.
 */
export function responsiveImage(src: string): ResponsiveImage {
    const image = images[src]
    if (!image) return { srcset: undefined, width: undefined, height: undefined }
    const [width, height, widths] = image
    const candidates = widths.map((copy) => `${variantPath(src, copy)} ${copy}w`)
    return { srcset: [...candidates, `${src} ${width}w`].join(', '), width, height }
}
