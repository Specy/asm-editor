import { describe, expect, it } from 'vitest'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { ASSEMBLY_TOKEN_COLORS } from '#lib/monaco/assemblyTokenColors.ts'
import { tokenizeAssembly } from './assemblyHighlight'
import { assemblyPaletteStyle, assemblyTokenClass, assemblyTokenOf } from './assemblyPalette'

/** The editor token of the piece of a line whose text is exactly `text`. */
function tokenOf(line: string, language: AvailableLanguages, text: string) {
    const token = tokenizeAssembly(line, language)[0].find((t) => t.text === text)
    if (!token) throw new Error(`no token "${text}" in "${line}"`)
    return assemblyTokenOf(token, language)
}

describe('assemblyTokenOf', () => {
    it('paints instructions, directives, comments and strings alike in every language', () => {
        expect(tokenOf('    add $t2, $t0, $t1 # sum', 'MIPS', 'add')).toBe('keyword')
        expect(tokenOf('.data', 'RISC-V', '.data')).toBe('directive')
        expect(tokenOf('    add $t2, $t0, $t1 # sum', 'MIPS', '# sum')).toBe('comment')
        expect(tokenOf('msg: dc.b "hi"', 'M68K', '"hi"')).toBe('string')
    })

    it('splits the M68K registers as its grammar does, and leaves the special ones plain', () => {
        expect(tokenOf('    move.l d0, a0', 'M68K', 'd0')).toBe('data-register')
        expect(tokenOf('    move.l d0, a0', 'M68K', 'a0')).toBe('address-register')
        expect(tokenOf('    move.l d0, sp', 'M68K', 'sp')).toBe('address-register')
        expect(tokenOf('    move.w d0, sr', 'M68K', 'sr')).toBeUndefined()
        expect(tokenOf('    add t0, t1, t2', 'RISC-V', 't1')).toBe('variable.predefined')
        expect(tokenOf('    ld a, b', 'Z80', 'b')).toBe('variable.predefined')
    })

    it('tells hex literals apart where the grammar does', () => {
        expect(tokenOf('    li $t0, 0x1F', 'MIPS', '0x1F')).toBe('number.hex')
        expect(tokenOf('    li $t0, 31', 'MIPS', '31')).toBe('number')
        expect(tokenOf('    ld a, $1F', 'Z80', '$1F')).toBe('number.hex')
        expect(tokenOf('    ld a, 1Fh', 'Z80', '1Fh')).toBe('number.hex')
        expect(tokenOf('    mov eax, 0x10', 'X86', '0x10')).toBe('number.hex')
        //M68K's grammar has no hex token: `$1F` is a number like any other, after its own `#`
        expect(tokenOf('    move.l #$1F, d0', 'M68K', '$1F')).toBe('number')
        expect(tokenOf('    move.l #$1F, d0', 'M68K', '#')).toBe('number.immediate')
    })

    it('paints the x86 size keywords and prefixes as keywords', () => {
        expect(tokenOf('    mov byte [rdi], 0', 'X86', 'byte')).toBe('keyword')
        expect(tokenOf('    repne scasb', 'X86', 'repne')).toBe('keyword')
        expect(tokenOf('    repne scasb', 'X86', 'scasb')).toBe('keyword')
    })

    it('styles labels as each grammar does', () => {
        //the M68K and x86 editors take the colon into the label, the Z80 one leaves it out
        expect(tokenOf('loop: rts', 'M68K', 'loop:')).toBe('label')
        expect(tokenOf('loop: ret', 'Z80', 'loop')).toBe('label')
        expect(tokenOf('loop: ret', 'X86', 'loop:')).toBe('tag')
        //x86 only paints a name as a tag when a colon makes it one
        expect(tokenOf('COUNT equ 5', 'X86', 'COUNT')).toBeUndefined()
        expect(tokenOf('count equ 12', 'M68K', 'count')).toBe('label')
        expect(tokenOf('loop: jr $ra', 'MIPS', 'loop')).toBeUndefined()
    })
})

describe('assemblyTokenClass', () => {
    it('names the class after the token and gives plain text none', () => {
        const [label] = tokenizeAssembly('loop:', 'X86')[0]
        expect(assemblyTokenClass(label, 'X86')).toBe('asm-tag')
        const [, colon] = tokenizeAssembly('loop:', 'RISC-V')[0]
        expect(assemblyTokenClass(colon, 'RISC-V')).toBeUndefined()
        const hex = tokenizeAssembly('    li t0, 0x1F', 'RISC-V')[0].find((t) => t.text === '0x1F')!
        expect(assemblyTokenClass(hex, 'RISC-V')).toBe('asm-number-hex')
    })
})

describe('assemblyPaletteStyle', () => {
    it("sets every editor token's colour for the surface", () => {
        const dark = assemblyPaletteStyle(true)
        for (const [token, color] of Object.entries(ASSEMBLY_TOKEN_COLORS.dark)) {
            expect(dark).toContain(`--asm-${token.replace('.', '-')}: ${color}`)
        }
        expect(assemblyPaletteStyle(false)).toContain(
            `--asm-number-hex: ${ASSEMBLY_TOKEN_COLORS.light['number.hex']}`
        )
    })
})
