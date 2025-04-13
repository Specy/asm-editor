import type { AvailableLanguages } from "./Project.svelte"

export const PAGE_SIZE = 16 * 16
export const PAGE_ELEMENTS_PER_ROW = Math.sqrt(PAGE_SIZE)
export const MEMORY_SIZE = {
    M68K: 0xffffff,
    MIPS: 0xffffffff,
    M86:  0xffffff
} //16mb

export const DEFAULT_MEMORY_VALUE = {
    M68K: 0xff,
    MIPS: 0x00,
    X86: 0x00
}

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
`.trim(),
    X86: `
section .data
    ; Write here your data
    
section .text
global START
START:
    mov eax, 42
    ; Write here your code
`.trim(),
}


export const LANGUAGE_THEMES = {
    M68K: 'default',
    MIPS: 'default-mips',
    X86: 'default',
} satisfies Record<AvailableLanguages, string>


export const LANGUAGE_EXTENSIONS = {
    M68K: 's68k',
    MIPS: 'mips',
    X86: 'asm',
} satisfies Record<AvailableLanguages, string>