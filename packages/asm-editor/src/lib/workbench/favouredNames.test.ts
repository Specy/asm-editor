import { describe, expect, it } from 'vite-plus/test'
import { ARGUMENTS_DIAGNOSTIC_SOURCE } from '#lib/commandLine.ts'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { favouredNames, statementNames } from './favouredNames'

const text = (content: string): ProjectFile => ({ encoding: 'plain', content })

function error(lineIndex: number, extra: Partial<Diagnostic> = {}): Diagnostic {
    return {
        severity: 'error',
        lineIndex,
        column: 1,
        message: 'Something is wrong.',
        formatted: 'Something is wrong.',
        ...extra
    } as Diagnostic
}

const mips = {
    'main.s': text('.text\nmain: li $v0, 1\n    adi $t0, $t0, 1\n\n# a comment\nloop:\n'),
    'lib.s': text('helper:\n    lw $t0, 0($sp)\n'),
    'sort.c': text('int main(void) {\n    return x;\n}\n')
}

describe('the names the errors favour', () => {
    it('takes the word after a label ending in a colon, or the first one without', () => {
        const names = favouredNames(
            [error(1, { file: 'main.s' }), error(2, { file: 'main.s' })],
            mips,
            'main.s',
            'MIPS'
        )
        expect(names).toEqual(['adi', 'li'])
    })

    it('reads a word in the first column of an M68K line as a label', () => {
        const files = { 'main.x68': text('FPS equ 30\n    move.l d0,d1\n') }
        expect(favouredNames([error(0)], files, 'main.x68', 'M68K')).toEqual(['equ', 'fps'])
        expect(statementNames('FPS equ 30', 'M68K')).toEqual(['fps', 'equ'])
        expect(statementNames('loop    dbra d0,loop', 'M68K')).toEqual(['loop', 'dbra'])
        expect(statementNames('start: move.l d0,d1', 'M68K')).toEqual(['move.l'])
        // indented, the first word is the operation
        expect(statementNames('    move.l d0,d1', 'M68K')).toEqual(['move.l'])
    })

    it('leaves the engine to tell an M68K instruction in the first column from a label', () => {
        // a size suffix is never a label's
        expect(statementNames('move.l d0,d1', 'M68K')).toEqual(['move.l'])
        expect(statementNames('rts', 'M68K')).toEqual(['rts'])
        expect(statementNames('clr d0', 'M68K')).toEqual(['clr', 'd0'])
        // never an operand out of a list
        expect(statementNames('move sr,d0', 'M68K')).toEqual(['move'])
        // a comment line
        expect(statementNames('* move the data', 'M68K')).toEqual([])
        expect(statementNames('; move the data', 'M68K')).toEqual([])
    })

    it('reads a word in the first column of a Z80 line as a label, a mnemonic too, as the assembler does', () => {
        expect(statementNames('loop    djnz loop', 'Z80')).toEqual(['djnz'])
        expect(statementNames('main:: nop', 'Z80')).toEqual(['nop'])
        expect(statementNames('start : nop', 'Z80')).toEqual(['nop'])
        expect(statementNames('.here nop', 'Z80')).toEqual(['nop'])
        expect(statementNames('FPS equ 30', 'Z80')).toEqual(['equ'])
        // the assembler's own reading, which names no entry: label `djnz`, unknown mnemonic `loop`
        expect(statementNames('djnz loop', 'Z80')).toEqual(['loop'])
        // a label alone, even spelled like a mnemonic
        expect(statementNames('nop', 'Z80')).toEqual([])
        // never an operand out of a list
        expect(statementNames('ld a,b', 'Z80')).toEqual([])
        // indented, the first word is the statement's, a colon after it or not
        expect(statementNames('    ld a,b ; load', 'Z80')).toEqual(['ld'])
        expect(statementNames('    inner: djnz inner', 'Z80')).toEqual(['inner'])
        expect(statementNames('#insert "sprite.bmp"', 'Z80')).toEqual(['#insert'])
        expect(statementNames('; a comment', 'Z80')).toEqual([])
        const files = { 'main.asm': text('loop    djnz loop\n') }
        expect(favouredNames([error(0)], files, 'main.asm', 'Z80')).toEqual(['djnz'])
    })

    it('takes a directive with its dot, and nothing from a comment, a lone label or an empty line', () => {
        expect(statementNames('.data', 'MIPS')).toEqual(['.data'])
        expect(statementNames('    #insert "sprite.bmp"', 'Z80')).toEqual(['#insert'])
        expect(favouredNames([error(3), error(4), error(5), error(9)], mips, 'main.s', 'MIPS'))
            //an empty line, a comment, a label alone, and a line past the end
            .toEqual([])
    })

    it('counts errors only, not warnings', () => {
        const warning = { ...error(2, { file: 'main.s' }), severity: 'warning' } as Diagnostic
        expect(favouredNames([warning], mips, 'main.s', 'MIPS')).toEqual([])
    })

    it('reads an error of no File on the Entry file', () => {
        expect(favouredNames([error(1)], mips, 'lib.s', 'MIPS')).toEqual(['lw'])
        expect(favouredNames([error(1)], mips, undefined, 'MIPS')).toEqual([])
    })

    it("leaves out C Files and the Arguments' errors", () => {
        expect(favouredNames([error(1, { file: 'sort.c' })], mips, 'main.s', 'MIPS')).toEqual([])
        // an error of no File belongs to the Entry file, here a C one
        expect(favouredNames([error(1)], mips, 'sort.c', 'MIPS')).toEqual([])
        const argument = error(0, { source: ARGUMENTS_DIAGNOSTIC_SOURCE })
        expect(favouredNames([argument], mips, 'main.s', 'MIPS')).toEqual([])
    })

    it("reads the lines of the Files it is given, the Build's in the snapshot view", () => {
        const built = { 'main.s': text('.text\nmain: sw $t0, 0($sp)\n') }
        expect(favouredNames([error(1)], built, 'main.s', 'MIPS')).toEqual(['sw'])
        expect(favouredNames([error(1)], mips, 'main.s', 'MIPS')).toEqual(['li'])
    })

    it('gives each name once, in the same order whatever the order of the errors', () => {
        const errors = [error(2), error(1), error(2, { message: 'Another.' })]
        const names = favouredNames(errors, mips, 'main.s', 'MIPS')
        expect(names).toEqual(favouredNames([...errors].reverse(), mips, 'main.s', 'MIPS'))
        expect(names).toEqual(['adi', 'li'])
    })
})
