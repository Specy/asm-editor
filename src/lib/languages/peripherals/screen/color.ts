/**
 * Screen colors are 24-bit RGB, `0xRRGGBB`, one canonical encoding every adapter converts into:
 * EASy68K's tasks carry `0x00BBGGRR` words, the Z80's ports carry one 3-3-2 byte
 * ([ADR 0011](../../../../../docs/adr/0011-z80-peripherals-through-the-port-map.md)) and MARS's
 * framebuffer words carry the color in their low 24 bits. The images are RGBA bytes because that is
 * what `putImageData` takes; alpha is always opaque, since no environment has a transparent pixel.
 */
export type ScreenColor = number

export const BLACK: ScreenColor = 0x000000
export const WHITE: ScreenColor = 0xffffff

export function rgb(red: number, green: number, blue: number): ScreenColor {
    return ((red & 0xff) << 16) | ((green & 0xff) << 8) | (blue & 0xff)
}

export function redOf(color: ScreenColor): number {
    return (color >> 16) & 0xff
}

export function greenOf(color: ScreenColor): number {
    return (color >> 8) & 0xff
}

export function blueOf(color: ScreenColor): number {
    return color & 0xff
}
