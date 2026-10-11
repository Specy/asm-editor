import { describe, expect, it } from 'vite-plus/test'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { ASSEMBLY_BRACKET_COLORS, ASSEMBLY_TOKEN_COLORS } from '#lib/monaco/assemblyTokenColors.ts'
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

    it('splits the M68K registers as its grammar does, and colours the special ones as registers', () => {
        expect(tokenOf('    move.l d0, a0', 'M68K', 'd0')).toBe('data-register')
        expect(tokenOf('    move.l d0, a0', 'M68K', 'a0')).toBe('address-register')
        expect(tokenOf('    move.l d0, sp', 'M68K', 'sp')).toBe('address-register')
        expect(tokenOf('    move.w d0, sr', 'M68K', 'sr')).toBe('variable.predefined')
        expect(tokenOf('    lea msg(pc), a0', 'M68K', 'pc')).toBe('variable.predefined')
        expect(tokenOf('    add t0, t1, t2', 'RISC-V', 't1')).toBe('variable.predefined')
        expect(tokenOf('    ld a, b', 'Z80', 'b')).toBe('variable.predefined')
    })

    it('tells hex literals apart in every language', () => {
        expect(tokenOf('    li $t0, 0x1F', 'MIPS', '0x1F')).toBe('number.hex')
        expect(tokenOf('    li $t0, 31', 'MIPS', '31')).toBe('number')
        expect(tokenOf('    ld a, $1F', 'Z80', '$1F')).toBe('number.hex')
        expect(tokenOf('    ld a, 1Fh', 'Z80', '1Fh')).toBe('number.hex')
        expect(tokenOf('    mov eax, 0x10', 'X86', '0x10')).toBe('number.hex')
        //the M68K writes hex with `$` alone, after its own `#`
        expect(tokenOf('    move.l #$1F, d0', 'M68K', '$1F')).toBe('number.hex')
        expect(tokenOf('    move.l #31, d0', 'M68K', '31')).toBe('number')
        expect(tokenOf('    move.l #$1F, d0', 'M68K', '#')).toBe('number.immediate')
    })

    it('paints the size words apart from the instructions, and prefixes as instructions', () => {
        expect(tokenOf('    mov byte [rdi], 0', 'X86', 'byte')).toBe('keyword.size')
        expect(tokenOf('    move.l #1, d0', 'M68K', '.l')).toBe('keyword.size')
        expect(tokenOf('    move.l #1, d0', 'M68K', 'move')).toBe('keyword')
        expect(tokenOf('    repne scasb', 'X86', 'repne')).toBe('keyword')
        expect(tokenOf('    repne scasb', 'X86', 'scasb')).toBe('keyword')
        expect(tokenOf('    lui $at, %hi(msg)', 'MIPS', '%hi')).toBe('keyword')
    })

    it('styles every label alike, with or without its colon', () => {
        for (const language of ['M68K', 'X86', 'Z80', 'MIPS', 'RISC-V'] as const) {
            expect(tokenOf('loop: nop', language, 'loop')).toBe('label')
            expect(tokenOf('loop: nop', language, ': ')).toBeUndefined()
        }
        expect(tokenOf('COUNT equ 5', 'X86', 'COUNT')).toBe('label')
        expect(tokenOf('count equ 12', 'M68K', 'count')).toBe('label')
    })

    it('paints a refused word as invalid and a bracket by its level', () => {
        expect(tokenOf('    stop #1', 'M68K', 'stop')).toBe('invalid')
        const brackets = tokenizeAssembly('    move.l ((a0)), d0)', 'M68K')[0].filter(
            (t) => t.kind === 'bracket'
        )
        expect(brackets.map((t) => assemblyTokenOf(t, 'M68K'))).toEqual([
            'bracket-1',
            'bracket-2',
            'bracket-2',
            'bracket-1',
            'bracket-unexpected'
        ])
    })
})

describe('assemblyTokenClass', () => {
    it('names the class after the token and gives plain text none', () => {
        const [label] = tokenizeAssembly('loop:', 'X86')[0]
        expect(assemblyTokenClass(label, 'X86')).toBe('asm-label')
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
        expect(dark).toContain(`--asm-bracket-1: ${ASSEMBLY_BRACKET_COLORS.dark.levels[0]}`)
        expect(dark).toContain(
            `--asm-bracket-unexpected: ${ASSEMBLY_BRACKET_COLORS.dark.unexpected}`
        )
    })
})
