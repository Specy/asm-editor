import type { AvailableLanguages } from './Project.svelte'

export const PAGE_SIZE = 16 * 16
export const PAGE_ELEMENTS_PER_ROW = Math.sqrt(PAGE_SIZE)
export const MEMORY_SIZE = {
    M68K: 0xffffffn,
    MIPS: 0xffffffffn,
    X86: 0xffffffn,
    'RISC-V': 0xffffffffn,
    'RISC-V-64': 0xffffffffn,
    Z80: 0xffffn
} satisfies Record<AvailableLanguages, bigint>

export const DEFAULT_MEMORY_VALUE = {
    M68K: 0xff,
    MIPS: 0x00,
    X86: 0x00,
    'RISC-V': 0x00,
    'RISC-V-64': 0x00,
    Z80: 0x00
} satisfies Record<AvailableLanguages, number>

export const COMMENT_CHARACTER = {
    M68K: ';',
    MIPS: '#',
    X86: ';',
    'RISC-V': '#',
    'RISC-V-64': '#',
    Z80: ';'
} satisfies Record<AvailableLanguages, string>

export const BASE_CODE = {
    MIPS: `
.data
    # Write here your data
    
.text
main:
    # Write here your code
    li $v0, 42
`.trim(),
    M68K: `
ORG $1000
START:
    * Write here your code
    move.l #42, d0
    
END: * Jump here to end the program
`.trim(),
    X86: `
section .data
    ; Write here your data
    
section .text
global START
START:
    ; Write here your code
    mov eax, 42
`.trim(),
    'RISC-V': `
.data
    # Write here your data
    
.text
main:
    # Write here your code
    li t0, 42
    `.trim(),
    'RISC-V-64': `
.data
    # Write here your data
    
.text
main:
    # Write here your code
    li t0, 42
    `.trim(),
    Z80: `
    ; Write here your code
    ld a, 42
    ; You can add more instructions here
`.trim()
} satisfies Record<AvailableLanguages, string>

export const LANGUAGE_THEMES = {
    M68K: 'default',
    MIPS: 'default-mips',
    X86: 'default',
    'RISC-V': 'default-risc-v',
    'RISC-V-64': 'default-risc-v',
    Z80: 'default'
} satisfies Record<AvailableLanguages, string>

export const LANGUAGE_EXTENSIONS = {
    M68K: 's68k',
    MIPS: 'mips',
    X86: 'asm',
    'RISC-V': 'riscv',
    'RISC-V-64': 'riscv',
    Z80: 'z80'
} satisfies Record<AvailableLanguages, string>
