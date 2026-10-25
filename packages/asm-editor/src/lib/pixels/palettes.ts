import type { AvailableLanguages } from '../Project.svelte'
import { rgba, type PictureFormat } from './bmp'

/**
 * The palettes a new picture starts with, by its bits a pixel
 * ([pixel-editor.md](../../../../../docs/design/pixel-editor.md), decision 6), and the layout a new
 * picture starts on in each Target (decision 5).
 */

/**
 * The 256 colours of a 3-3-2 byte, entry `RRRGGGBB` being that colour with each field stretched
 * over eight bits by repeating it, as the Z80's Screen stretches a colour byte (`expandColor` in
 * `Z80Device.ts`), so an 8-bit pixel's index is the byte a Z80 program draws it with.
 */
export const PALETTE_332: readonly number[] = Array.from({ length: 256 }, (_, byte) => {
    const red = (byte >> 5) & 0x07
    const green = (byte >> 2) & 0x07
    const blue = byte & 0x03
    const stretch = (bits: number) => ((bits << 5) | (bits << 2) | (bits >> 1)) & 0xff
    return rgba(stretch(red), stretch(green), blue * 0x55)
})

/** The 16 colours of Windows and the VGA's default text palette, in their usual order. */
export const PALETTE_16: readonly number[] = [
    [0x00, 0x00, 0x00],
    [0x80, 0x00, 0x00],
    [0x00, 0x80, 0x00],
    [0x80, 0x80, 0x00],
    [0x00, 0x00, 0x80],
    [0x80, 0x00, 0x80],
    [0x00, 0x80, 0x80],
    [0xc0, 0xc0, 0xc0],
    [0x80, 0x80, 0x80],
    [0xff, 0x00, 0x00],
    [0x00, 0xff, 0x00],
    [0xff, 0xff, 0x00],
    [0x00, 0x00, 0xff],
    [0xff, 0x00, 0xff],
    [0x00, 0xff, 0xff],
    [0xff, 0xff, 0xff]
].map(([red, green, blue]) => rgba(red, green, blue))

export const PALETTE_2: readonly number[] = [rgba(0, 0, 0), rgba(255, 255, 255)]

/** The palette a new picture of `format` starts with; none for a picture without one. */
export function startingPalette(format: PictureFormat): readonly number[] | undefined {
    if (format === 'indexed8') return PALETTE_332
    if (format === 'indexed4') return PALETTE_16
    if (format === 'indexed1') return PALETTE_2
    return undefined
}

/**
 * The layout a new picture starts on: the one the Target's Screen draws with, so a program loads
 * a pixel without converting it. MIPS and RISC-V read a 32-bit pixel as `0x00RRGGBB`, the Screen's
 * own word; the Z80's colours are 3-3-2 bytes; the M68K shifts a 32-bit pixel into EASy68K's
 * `$00BBGGRR`; x86 has no Screen and takes the same as the others.
 */
export function newPictureFormat(language: AvailableLanguages): PictureFormat {
    return language === 'Z80' ? 'indexed8' : 'rgb32'
}
