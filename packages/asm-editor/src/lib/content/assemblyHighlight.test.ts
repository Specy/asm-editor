import { describe, expect, it } from 'vite-plus/test'
import { tokenizeAssembly, type AssemblyTokenKind } from './assemblyHighlight'
import { z80Registers } from '#lib/languages/Z80/Z80-documentation.ts'
import {
    RISCVCsrRegisterNames,
    RISCVLanguageFloatingPointRegisterNames,
    RISCVLanguageRegisterNames
} from '#lib/languages/RISC-V/RISC-V-registers.ts'
import { z80ConditionCodes, z80DirectiveNames } from '#lib/languages/Z80/Z80-documentation.ts'
import {
    M68KDirectives,
    M68KRefusedDirectives,
    M68KRefusedInstructions
} from '#lib/languages/M68K/M68K-documentation.ts'
import { X86Registers } from '#lib/languages/X86/X86-grammar.ts'

/**
 * The highlighter reads structure rather than instruction sets, so what these check is that a line
 * is cut into the right pieces, not that any architecture's mnemonics are known. The things it has
 * to get right per language are what starts a comment, what a `$` means, and which names are its
 * registers, the one word list it keeps.
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
        expect(kindOf('    add.l d1, d0', 'M68K', 'add')).toBe('mnemonic')
        expect(kindOf('    add.l d1, d0', 'M68K', 'd1')).toBe('register')
        expect(kindOf('loop_test:', 'M68K', 'loop_test')).toBe('label')
        //a label does not consume the statement: the name after it is still the instruction
        expect(kindOf('done: rts', 'M68K', 'rts')).toBe('mnemonic')
    })

    it('reads a directive by its leading dot, and a dotted mnemonic as one name', () => {
        expect(kindOf('.text', 'MIPS', '.text')).toBe('directive')
        expect(kindOf('    move.l #1, d0', 'M68K', 'move')).toBe('mnemonic')
    })

    it('colours an M68K size suffix apart from the name it sizes, as the editor does', () => {
        const kinds = (line: string) =>
            tokenizeAssembly(line, 'M68K')[0]
                .filter((t) => t.kind !== 'plain')
                .map((t) => [t.kind, t.text])
        expect(kinds('    move.l (a0,d1.w), d0')).toEqual([
            ['mnemonic', 'move'],
            ['size', '.l'],
            ['bracket', '('],
            ['register', 'a0'],
            ['register', 'd1'],
            ['size', '.w'],
            ['bracket', ')'],
            ['register', 'd0']
        ])
        expect(kinds('    dc.b 1')).toEqual([
            ['directive', 'dc'],
            ['size', '.b'],
            ['number', '1']
        ])
        //and the size an absolute address is taken at
        expect(kindOf('    move.w ($1000).w, d0', 'M68K', '.w')).toBe('size')
        //the other languages keep their dots inside the name
        expect(kindOf('    fadd.s ft0, ft1, ft2', 'RISC-V', 'fadd.s')).toBe('mnemonic')
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
        expect(kindOf('    mulu #2, d0', 'M68K', '2')).toBe('number')
    })

    it('reads a constant definition as a name being assigned, not as an instruction', () => {
        expect(kindOf('count equ 12', 'M68K', 'count')).toBe('label')
        expect(kindOf('count equ 12', 'M68K', 'equ')).toBe('directive')
        expect(kindOf('count equ 12', 'M68K', '12')).toBe('number')
        //a statement opening with a directive has no instruction; the name after it is its operand
        expect(kindOf('.eqv COUNT 12', 'MIPS', '.eqv')).toBe('directive')
        expect(kindOf('.eqv COUNT 12', 'MIPS', 'COUNT')).toBe('plain')
        //and a name that is nobody's assignment is still the instruction
        expect(kindOf('    equal_case d0, d1', 'M68K', 'equal_case')).toBe('mnemonic')
    })

    it('tells a hex literal from a register name by the language', () => {
        //`$` opens a hex literal for the two older assemblers
        expect(kindOf('    move.l #$FF, d0', 'M68K', '$FF')).toBe('number')
        expect(kindOf('    ld a, $FF', 'Z80', '$FF')).toBe('number')
        //and belongs to a name for MIPS, whose registers are spelled with it
        expect(kindOf('    addi $t0, $zero, 1', 'MIPS', '$t0')).toBe('register')
        expect(kindOf('    addi $t0, $zero, 1', 'MIPS', '1')).toBe('number')
    })

    it("colours an operand that names one of the language's registers", () => {
        expect(kindOf('    move.w d0.w, -(sp)', 'M68K', 'd0')).toBe('register')
        expect(kindOf('    move.w d0.w, -(sp)', 'M68K', 'sp')).toBe('register')
        expect(kindOf('    lea table(pc), a0', 'M68K', 'table')).toBe('plain')
        expect(kindOf('    lw $t1, 4($sp)', 'MIPS', '$sp')).toBe('register')
        expect(kindOf('    addi sp, sp, -16', 'RISC-V', 'sp')).toBe('register')
        expect(kindOf('    fadd.s ft0, fa0, fa1', 'RISC-V', 'fa1')).toBe('register')
        expect(kindOf('    ld x10, 0(x2)', 'RISC-V-64', 'x10')).toBe('register')
        expect(kindOf('    la a0, message', 'RISC-V', 'message')).toBe('plain')
        expect(kindOf('    mov EAX, [ebx + 4]', 'X86', 'EAX')).toBe('register')
        expect(kindOf('    mov EAX, [ebx + 4]', 'X86', 'ebx')).toBe('register')
        expect(kindOf('    ld a, (hl)', 'Z80', 'hl')).toBe('register')
        expect(kindOf('    ld (ix+2), b', 'Z80', 'ix')).toBe('register')
        //the instruction itself is never a register, even where the names collide
        expect(kindOf('    sp', 'RISC-V', 'sp')).toBe('mnemonic')
    })

    it("keeps the Z80's alternate apostrophe in the register instead of opening a string", () => {
        const tokens = tokenizeAssembly("    ex af, af' ; swap", 'Z80')[0]
        expect(tokens.find((t) => t.text === "af'")?.kind).toBe('register')
        expect(lastOf(tokens).kind).toBe('comment')
    })

    it('knows every register the editor and the Cores name', () => {
        const unknown = (
            language: Parameters<typeof tokenizeAssembly>[1],
            names: readonly string[]
        ) =>
            names.filter(
                (name) =>
                    tokenizeAssembly(`    op x, ${name}`, language)[0].find((t) => t.text === name)
                        ?.kind !== 'register'
            )
        expect(
            unknown(
                'Z80',
                z80Registers.map((register) => register.name)
            )
        ).toEqual([])
        expect(
            unknown('RISC-V', [
                ...RISCVLanguageRegisterNames,
                ...RISCVLanguageFloatingPointRegisterNames
            ])
        ).toEqual([])
        expect(unknown('X86', X86Registers)).toEqual([])
        expect(unknown('M68K', ['d0', 'd7', 'a0', 'a7', 'sp', 'pc', 'sr', 'ccr', 'usp'])).toEqual(
            []
        )
    })

    it("reads x86's directives, which have no dot, and its dotted names, which are not directives", () => {
        expect(kindOf('section .data', 'X86', 'section')).toBe('directive')
        expect(kindOf('section .data', 'X86', '.data')).toBe('plain')
        expect(kindOf('    global _start', 'X86', 'global')).toBe('directive')
        expect(kindOf('    dq 1, 2', 'X86', 'dq')).toBe('directive')
        expect(kindOf('COUNT equ 4', 'X86', 'equ')).toBe('directive')
        //`times` repeats the directive after it, which is still one
        expect(kindOf('    times 4 db 0', 'X86', 'times')).toBe('directive')
        expect(kindOf('    times 4 db 0', 'X86', 'db')).toBe('directive')
        expect(kindOf('    times 4 nop', 'X86', 'nop')).toBe('mnemonic')
        expect(kindOf('    jmp .done', 'X86', '.done')).toBe('plain')
        //the other languages keep their dotted directives
        expect(kindOf('.data', 'MIPS', '.data')).toBe('directive')
    })

    it('reads a dotted name with a colon as a local label', () => {
        expect(kindOf('.done:', 'X86', '.done')).toBe('label')
        expect(kindOf('.L2:', 'RISC-V', '.L2')).toBe('label')
        //and the instruction after it is still the instruction
        expect(kindOf('.L2: ret', 'RISC-V', 'ret')).toBe('mnemonic')
    })

    it('leaves the colon out of the label, as every editor does', () => {
        for (const language of ['M68K', 'X86', 'Z80', 'MIPS', 'RISC-V'] as const) {
            expect(tokenizeAssembly('loop:', language)[0]).toEqual([
                { kind: 'label', text: 'loop' },
                { kind: 'plain', text: ':' }
            ])
        }
        expect(tokenizeAssembly('.done:', 'X86')[0][0]).toEqual({ kind: 'label', text: '.done' })
    })

    it('reads a name in the M68K and Z80 first column as a label, colon or not', () => {
        expect(kindOf('loop dbra d0, loop', 'M68K', 'loop')).toBe('label')
        expect(kindOf('loop djnz loop', 'Z80', 'loop')).toBe('label')
        expect(kindOf('loop djnz loop', 'Z80', 'djnz')).toBe('mnemonic')
        //an unindented instruction alone, or before a register, is still the instruction
        expect(kindOf('rts', 'M68K', 'rts')).toBe('mnemonic')
        expect(kindOf('ld a, 1', 'Z80', 'ld')).toBe('mnemonic')
        //and the other languages need the colon
        expect(kindOf('loop beqz t0, loop', 'RISC-V', 'loop')).toBe('mnemonic')
    })

    it("reads RISC-V's numbered local labels", () => {
        expect(tokenizeAssembly('1: j 1b', 'RISC-V')[0].slice(0, 3)).toEqual([
            { kind: 'label', text: '1' },
            { kind: 'plain', text: ': ' },
            { kind: 'mnemonic', text: 'j' }
        ])
        expect(kindOf('1: j 1b', 'MIPS', '1')).toBe('number')
    })

    it('reads the directives the M68K and the Z80 spell like instructions', () => {
        expect(kindOf('    dc.w 1, 2', 'M68K', 'dc')).toBe('directive')
        expect(kindOf('    org $1000', 'M68K', 'org')).toBe('directive')
        expect(kindOf('    end start', 'M68K', 'end')).toBe('directive')
        expect(kindOf('count equ 4', 'Z80', 'equ')).toBe('directive')
        expect(kindOf('    defb 1, 2', 'Z80', 'defb')).toBe('directive')
        expect(kindOf('#include "x.asm"', 'Z80', '#include')).toBe('directive')
        //an M68K instruction with the same size suffix is still one
        expect(kindOf('    move.w d0, d1', 'M68K', 'move')).toBe('mnemonic')
        //a name the directive follows is the label it defines, where the editors read one
        expect(kindOf('val defb 1', 'Z80', 'val')).toBe('label')
        expect(kindOf('table dc.w 1', 'M68K', 'table')).toBe('label')
        expect(kindOf('    msg db "hi", 0', 'X86', 'msg')).toBe('label')
        expect(kindOf('    msg db "hi", 0', 'X86', 'db')).toBe('directive')
        //and a label spelled like a directive is a name among the operands
        expect(kindOf('    bra end', 'M68K', 'end')).toBe('plain')
        expect(kindOf('    jp end', 'Z80', 'end')).toBe('plain')
    })

    it('knows every directive the M68K and Z80 grammars do', () => {
        const notDirective = (
            language: Parameters<typeof tokenizeAssembly>[1],
            names: readonly string[]
        ) => names.filter((name) => kindOf(`    ${name} 1`, language, name) !== 'directive')
        expect(notDirective('M68K', M68KDirectives)).toEqual([])
        //`=` is punctuation, coloured as such
        expect(
            notDirective(
                'Z80',
                z80DirectiveNames.filter((name) => name !== '=')
            )
        ).toEqual([])
    })

    it("reads the M68K's immediate marker apart from what it introduces", () => {
        const tokens = tokenizeAssembly('    move.l #count, d0', 'M68K')[0]
        expect(tokens.find((t) => t.kind === 'immediate')?.text).toBe('#')
        expect(kindOf('    move.l #count, d0', 'M68K', 'count')).toBe('plain')
    })

    it('reads x86 size keywords, and the instruction after a prefix', () => {
        expect(kindOf('    mov byte [rdi], 0', 'X86', 'byte')).toBe('size')
        expect(kindOf('    jmp short done', 'X86', 'short')).toBe('size')
        expect(kindOf('    repne scasb', 'X86', 'repne')).toBe('mnemonic')
        expect(kindOf('    repne scasb', 'X86', 'scasb')).toBe('mnemonic')
        expect(kindOf('    lock add [rdi], eax', 'X86', 'rdi')).toBe('register')
    })

    it("reads x86's preprocessor directives and the halves of a MIPS or RISC-V address", () => {
        expect(kindOf('%define COUNT 10', 'X86', '%define')).toBe('directive')
        expect(kindOf('%define COUNT 10', 'X86', 'COUNT')).toBe('plain')
        expect(kindOf('%macro PRINT 1', 'X86', '%macro')).toBe('directive')
        expect(kindOf('    lui $at, %hi(msg)', 'MIPS', '%hi')).toBe('keyword')
        expect(kindOf('    lw $t0, %lo(msg)($at)', 'MIPS', '%lo')).toBe('keyword')
        expect(kindOf('    auipc a0, %pcrel_hi(msg)', 'RISC-V', '%pcrel_hi')).toBe('keyword')
        //and M68K's `%` is still a binary literal
        expect(kindOf('    move.l #%1010, d0', 'M68K', '%1010')).toBe('number')
    })

    it('reads a CSR as a register only where an instruction names one', () => {
        expect(kindOf('    csrr t0, fcsr', 'RISC-V', 'fcsr')).toBe('register')
        expect(kindOf('    csrrw zero, time, t1', 'RISC-V', 'time')).toBe('register')
        expect(kindOf('    j time', 'RISC-V', 'time')).toBe('plain')
        expect(
            RISCVCsrRegisterNames.filter(
                (name) => kindOf(`    csrr t0, ${name}`, 'RISC-V', name) !== 'register'
            )
        ).toEqual([])
    })

    it('reads the words s68k refuses as invalid, and every one of them', () => {
        expect(kindOf('    stop #$2700', 'M68K', 'stop')).toBe('invalid')
        expect(kindOf('    bsr reset', 'M68K', 'reset')).toBe('plain')
        expect(
            [...M68KRefusedInstructions, ...M68KRefusedDirectives].filter(
                (name) => kindOf(`    ${name} 1`, 'M68K', name) !== 'invalid'
            )
        ).toEqual([])
    })

    it('reads strings as NASM does: escapes only in a backquoted one', () => {
        const tokens = tokenizeAssembly('    db "C:\\", 0, `a\\`b`', 'X86')[0]
        expect(tokens.filter((t) => t.kind === 'string').map((t) => t.text)).toEqual([
            '"C:\\"',
            '`a\\`b`'
        ])
        expect(kindOf('    db "C:\\", 0', 'X86', '0')).toBe('number')
    })

    it('levels brackets by how deeply they nest, through the whole program', () => {
        const brackets = (code: string, language: Parameters<typeof tokenizeAssembly>[1]) =>
            tokenizeAssembly(code, language)
                .flat()
                .filter((t) => t.kind === 'bracket')
                .map((t) => `${t.text}${t.level ?? '!'}`)
        expect(brackets('    move.l ((a0)), d0', 'M68K')).toEqual(['(0', '(1', ')1', ')0'])
        expect(brackets('    mov eax, [rbx + (4)]', 'X86')).toEqual(['[0', '(1', ')1', ']0'])
        //across lines, and a closer nothing opened has no level
        expect(brackets('    dc.l (1\n    dc.l 2))', 'M68K')).toEqual(['(0', ')0', ')!'])
        //only the pairs the language's editor colours
        expect(brackets('    li t0, [1]', 'RISC-V')).toEqual([])
        //and never inside a string or a comment
        expect(brackets('    li t0, 1 # (x)', 'RISC-V')).toEqual([])
    })

    it('reads a Z80 condition only where a jump, call or return takes one', () => {
        expect(kindOf('    jr c, loop', 'Z80', 'c')).toBe('condition')
        expect(kindOf('    jp nz, loop', 'Z80', 'nz')).toBe('condition')
        expect(kindOf('    ret z', 'Z80', 'z')).toBe('condition')
        expect(kindOf('    call m, handler', 'Z80', 'm')).toBe('condition')
        //`c` is the register everywhere else, and so is a second operand
        expect(kindOf('    ld a, c', 'Z80', 'c')).toBe('register')
        expect(kindOf('    jp loop, c', 'Z80', 'c')).toBe('register')
        //by exact text, since `p` is also inside `jp`
        const kindOfExactly = (line: string, text: string) =>
            tokenizeAssembly(line, 'Z80')[0].find((t) => t.text === text)?.kind
        const names = z80ConditionCodes.map((condition) => condition.name)
        expect(
            names.filter((name) => kindOfExactly(`    jp ${name}, x`, name) !== 'condition')
        ).toEqual([])
    })

    it('reads a decimal fraction as one number where the editor does', () => {
        expect(kindOf('x: .float 1.5', 'MIPS', '1.5')).toBe('number')
        expect(kindOf('x: .double 2.25', 'RISC-V', '2.25')).toBe('number')
        expect(kindOf('x: dq 1.5', 'X86', '1.5')).toBe('number')
    })

    it('reads the number prefixes and suffixes the languages write', () => {
        expect(kindOf('    li t0, 0xFF', 'RISC-V', '0xFF')).toBe('number')
        expect(kindOf('    li t0, 0b1010', 'RISC-V', '0b1010')).toBe('number')
        expect(kindOf('    move.l #%1010, d0', 'M68K', '%1010')).toBe('number')
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
