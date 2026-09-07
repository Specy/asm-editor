import type { AvailableLanguages } from './Project.svelte'

export const PAGE_SIZE = 16 * 16
export const PAGE_ELEMENTS_PER_ROW = Math.sqrt(PAGE_SIZE)
export const MEMORY_SIZE = {
    M68K: 0xffffffn,
    MIPS: 0xffffffffn,
    X86: 0x00007fffffffffffn,
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

/**
 * The empty project every language starts from. Each one ends by asking its environment to
 * stop, because that is the single thing a first program cannot be read from: falling off the
 * end of the text segment is not an ending, it is the assembler's next bytes being executed.
 * Nothing else here does any work, so the reader has one correct line to keep and a blank
 * space to write in, rather than a magic constant to wonder about.
 */
export const BASE_CODE = {
    MIPS: `
.data
    # Write your data here

.text
.globl main
main:
    # Write your code here

    li $v0, 10          # service 10: end the program
    syscall
`.trim(),
    M68K: `
ORG $1000

START:
    ; Write your code here

    move.b #9, d0       ; task 9: end the program
    trap #15
`.trim(),
    X86: `
global _start

section .data
    ; Write your data here

section .text
_start:
    ; Write your code here

    mov rax, 60         ; syscall 60: exit
    xor rdi, rdi        ; with status 0
    syscall
`.trim(),
    'RISC-V': `
.data
    # Write your data here

.text
.globl main
main:
    # Write your code here

    li a7, 10           # service 10: end the program
    ecall
`.trim(),
    'RISC-V-64': `
.data
    # Write your data here

.text
.globl main
main:
    # Write your code here

    li a7, 10           # service 10: end the program
    ecall
`.trim(),
    //not `.trim()`ed like the others: the leading indentation is load bearing, an assembler
    //directive in the first column is parsed as a label definition
    Z80: `        .org 0x8000
start:
        ; Write your code here

        halt`
} satisfies Record<AvailableLanguages, string>

export const LANGUAGE_THEMES = {
    M68K: 'default',
    MIPS: 'default-mips',
    X86: 'default',
    'RISC-V': 'default-risc-v',
    'RISC-V-64': 'default-risc-v',
    Z80: 'default-z80'
} satisfies Record<AvailableLanguages, string>

export const LANGUAGE_EXTENSIONS = {
    M68K: 's68k',
    MIPS: 'mips',
    X86: 'asm',
    'RISC-V': 'riscv',
    'RISC-V-64': 'riscv',
    Z80: 'z80'
} satisfies Record<AvailableLanguages, string>

export const DISCERNS_AVATAR_ID = 65
export const DISCERNS_AVATAR_INSTANCE_ID = 75
