import { describe, expect, it } from 'vitest'
import { tokenizeAssembly, type AssemblyTokenKind } from './assemblyHighlight'

/**
 * The highlighter reads structure rather than instruction sets, so what these check is that a line
 * is cut into the right pieces, not that any architecture's mnemonics are known. The two things it
 * has to get right per language are what starts a comment and what a `$` means, because those are
 * the characters the six disagree about.
 */

/**
 * The kind covering a piece of a line. Containment rather than equality, because the tokenizer
 * runs consecutive plain text together: an operand it made no claim about arrives inside the run
 * of separators around it.
 */
function kindOf(line: string, language: Parameters<typeof tokenizeAssembly>[1], text: string) {
    const token = tokenizeAssembly(line, language)[0].find((t) => t.text.includes(text))
    return token?.kind
}

/** The last token of a line. `Array.prototype.at` is past this project's TS lib target. */
function lastOf(tokens: { kind: string; text: string }[]) {
    return tokens[tokens.length - 1]
}

/** Nothing may be dropped or invented: the tokens must rebuild the source exactly. */
function rebuild(code: string, language: Parameters<typeof tokenizeAssembly>[1]) {
    return tokenizeAssembly(code, language)
        .map((line) => line.map((t) => t.text).join(''))
        .join('\n')
}

describe('tokenizeAssembly', () => {
    it('reads the first name of a statement as the instruction and a trailing colon as a label', () => {
        expect(kindOf('    add.l d1, d0', 'M68K', 'add.l')).toBe('mnemonic')
        expect(kindOf('    add.l d1, d0', 'M68K', 'd1')).toBe('plain')
        expect(kindOf('loop_test:', 'M68K', 'loop_test')).toBe('label')
        //a label does not consume the statement: the name after it is still the instruction
        expect(kindOf('done: rts', 'M68K', 'rts')).toBe('mnemonic')
    })

    it('reads a directive by its leading dot, and a dotted mnemonic as one name', () => {
        expect(kindOf('.text', 'MIPS', '.text')).toBe('directive')
        expect(kindOf('    move.l #1, d0', 'M68K', 'move.l')).toBe('mnemonic')
    })

    it('starts a comment where each language starts one', () => {
        expect(kindOf('    li t0, 1 # set it', 'RISC-V', '# set it')).toBe('comment')
        expect(lastOf(tokenizeAssembly('    move.l #1, d0 ; set it', 'M68K')[0])).toEqual({
            kind: 'comment',
            text: '; set it'
        })
        //`*` is a comment only in the first column, which is where the M68K assemblers read one
        expect(tokenizeAssembly('* a whole line', 'M68K')[0]).toEqual([
            { kind: 'comment', text: '* a whole line' }
        ])
        expect(kindOf('    mulu #2, d0', 'M68K', '#2')).toBe('number')
    })

    it('reads a constant definition as a name being assigned, not as an instruction', () => {
        expect(kindOf('count equ 12', 'M68K', 'count')).toBe('label')
        expect(kindOf('count equ 12', 'M68K', 'equ')).toBe('mnemonic')
        expect(kindOf('count equ 12', 'M68K', '12')).toBe('number')
        //a statement opening with a directive has no instruction; the name after it is its operand
        expect(kindOf('.eqv COUNT 12', 'MIPS', '.eqv')).toBe('directive')
        expect(kindOf('.eqv COUNT 12', 'MIPS', 'COUNT')).toBe('plain')
        //and a name that is nobody's assignment is still the instruction
        expect(kindOf('    equal_case d0, d1', 'M68K', 'equal_case')).toBe('mnemonic')
    })

    it('tells a hex literal from a register name by the language', () => {
        //`$` opens a hex literal for the two older assemblers
        expect(kindOf('    move.l #$FF, d0', 'M68K', '#$FF')).toBe('number')
        expect(kindOf('    ld a, $FF', 'Z80', '$FF')).toBe('number')
        //and belongs to a name for MIPS, whose registers are spelled with it
        expect(kindOf('    addi $t0, $zero, 1', 'MIPS', '$t0')).toBe('plain')
        expect(kindOf('    addi $t0, $zero, 1', 'MIPS', '1')).toBe('number')
    })

    it('reads the number prefixes and suffixes the languages write', () => {
        expect(kindOf('    li t0, 0xFF', 'RISC-V', '0xFF')).toBe('number')
        expect(kindOf('    li t0, 0b1010', 'RISC-V', '0b1010')).toBe('number')
        expect(kindOf('    move.l #%1010, d0', 'M68K', '#%1010')).toBe('number')
        expect(kindOf('    ld a, 0FFh', 'Z80', '0FFh')).toBe('number')
        expect(kindOf('    mov eax, 42', 'X86', '42')).toBe('number')
    })

    it('reads a quoted string, including an unterminated one, without leaving the line', () => {
        expect(kindOf('msg: .asciiz "hello"', 'MIPS', '"hello"')).toBe('string')
        const unterminated = tokenizeAssembly('msg: .asciiz "hello\n    li t0, 1', 'MIPS')
        expect(lastOf(unterminated[0])).toEqual({ kind: 'string', text: '"hello' })
        expect(unterminated[1].some((t) => t.kind === 'mnemonic')).toBe(true)
    })

    it('rebuilds the source exactly, for every language', () => {
        const programs: [string, Parameters<typeof tokenizeAssembly>[1]][] = [
            ['loop:\n    move.l #$FF, d0 ; go\n    dbra d0, loop\n', 'M68K'],
            ['.data\nmsg: .asciiz "hi"\n.text\nmain:\n    li $v0, 4 # print\n', 'MIPS'],
            ['.text\nmain:\n    li s0, 0xFF\n    addi sp, sp, -16\n', 'RISC-V'],
            ['section .text\n_start:\n    mov eax, 1 ; write\n    int 0x80\n', 'X86'],
            ['    org $100\nstart:\n    ld a, 0FFh ; go\n    jp start\n', 'Z80']
        ]
        for (const [code, language] of programs) {
            expect(rebuild(code, language)).toBe(code)
        }
    })

    it('leaves a line it understands nothing of as plain text', () => {
        const kinds = new Set<AssemblyTokenKind>(
            tokenizeAssembly('    , , ,', 'M68K')[0].map((t) => t.kind)
        )
        expect([...kinds]).toEqual(['plain'])
    })
})
