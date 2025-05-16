import type { AvailableLanguages } from "./Project.svelte"

export const PAGE_SIZE = 16 * 16
export const PAGE_ELEMENTS_PER_ROW = Math.sqrt(PAGE_SIZE)
export const MEMORY_SIZE = {
    M68K: 0xffffff,
    MIPS: 0xffffffff,
    X86:  0xffffff,
    'RISC-V': 0xffffffff
} satisfies Record<AvailableLanguages, number>

export const DEFAULT_MEMORY_VALUE = {
    M68K: 0xff,
    MIPS: 0x00,
    X86: 0x00,
    'RISC-V': 0x00
} satisfies Record<AvailableLanguages, number>

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
    'RISC-V': `
    .data
    # Write here your data
    
.text
main:
    li t0, 42
    # Write here your code
    `.trim()
} satisfies Record<AvailableLanguages, string>


export const LANGUAGE_THEMES = {
    M68K: 'default',
    MIPS: 'default-mips',
    X86: 'default',
    'RISC-V': 'default-risc-v'
} satisfies Record<AvailableLanguages, string>


export const LANGUAGE_EXTENSIONS = {
    M68K: 's68k',
    MIPS: 'mips',
    X86: 'asm',
    'RISC-V': 'riscv'
} satisfies Record<AvailableLanguages, string>