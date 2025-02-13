import { DEFAULT_THEME } from "$stores/themeStore"

export const PAGE_SIZE = 16 * 16
export const PAGE_ELEMENTS_PER_ROW = Math.sqrt(PAGE_SIZE)
export const MEMORY_SIZE = {
    M68K: 0xffffff,
    MIPS: 0xffffffff
} //16mb

export const DEFAULT_MEMORY_VALUE = {
    M68K: 0xff,
    MIPS: 0x00
}

export const LANG_ACCENT = {
    M68K: {
        accent: DEFAULT_THEME.accent.color,
        accent2: DEFAULT_THEME.accent2.color,
        background: DEFAULT_THEME.background.color,
        primary: DEFAULT_THEME.primary.color,
        secondary: DEFAULT_THEME.secondary.color,
        tertiary: DEFAULT_THEME.tertiary.color,
        scrollbar: DEFAULT_THEME.scrollbar.color
    },
    MIPS: {
        accent: '#553b6a',
        accent2: '#4e4456',
        background: 'rgb(25 23 33)',
        primary: 'rgb(25 23 33)',
        secondary: '#201d29',
        tertiary: '#322d45',
        scrollbar: '#433d6f'
    }
} as const


export const BASE_CODE = {
    MIPS: `
.data
    # Write here your data
.text
main:
    li $v0, 42
    # Write here your code
`.trim(),
    M68K: `
ORG $1000
START:
    * Write here your code
    move.l 42, d0
END: * Jump here to end the program
`.trim()
}
