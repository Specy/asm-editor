import { describe, expect, it } from 'vitest'
import type { MonacoType } from '$lib/monaco/Monaco'
import {
    getInstructionDocumentation,
    M68KDirectives,
    M68KRefusedDirectives,
    M68KRefusedInstructions,
    M68kInstructions
} from './M68K-documentation'
import { createM68KCompletition, formatM68kSource } from './M68K-language'
import { getM68kErrorMessage } from './M68kUtils'

const ADDED_V2_INSTRUCTIONS = [
    'movep',
    'tas',
    'rtr',
    'chk',
    'trapv',
    'illegal',
    'addx',
    'subx',
    'negx',
    'roxl',
    'roxr',
    'abcd',
    'sbcd',
    'nbcd',
    'extb'
]

const CONDITION_CODES = [
    'hi',
    'ls',
    'cc',
    'cs',
    'ne',
    'eq',
    'vc',
    'vs',
    'pl',
    'mi',
    'ge',
    'lt',
    'gt',
    'le',
    'hs',
    'lo'
]

/** Mirrors the implemented rows of s68k v2's instruction table. */
const V2_INSTRUCTIONS = [
    'move',
    'movea',
    'movem',
    'movep',
    'moveq',
    'exg',
    'lea',
    'pea',
    'link',
    'unlk',
    'swap',
    'add',
    'sub',
    'adda',
    'suba',
    'addi',
    'subi',
    'addq',
    'subq',
    'addx',
    'subx',
    'negx',
    'clr',
    'cmp',
    'cmpa',
    'cmpi',
    'cmpm',
    'divs',
    'divu',
    'muls',
    'mulu',
    'ext',
    'extb',
    'neg',
    'tst',
    'abcd',
    'sbcd',
    'nbcd',
    'and',
    'or',
    'eor',
    'andi',
    'ori',
    'eori',
    'not',
    'asl',
    'asr',
    'lsl',
    'lsr',
    'rol',
    'ror',
    'roxl',
    'roxr',
    'btst',
    'bset',
    'bclr',
    'bchg',
    'bra',
    'bsr',
    'jmp',
    'jsr',
    'rts',
    'nop',
    'trap',
    'rtr',
    'tas',
    'trapv',
    'chk',
    'illegal',
    ...CONDITION_CODES.map((code) => `b${code}`),
    ...[...CONDITION_CODES, 't', 'f'].map((code) => `db${code}`),
    'dbra',
    ...[...CONDITION_CODES, 't', 'f'].map((code) => `s${code}`)
]

const V2_DIRECTIVES = [
    'dc',
    'dcb',
    'ds',
    'end',
    'equ',
    'fail',
    'incbin',
    'include',
    'list',
    'nolist',
    'offset',
    'opt',
    'org',
    'page',
    'reg',
    'section',
    'set',
    'simhalt'
]

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}

const monacoStub = {
    Range,
    languages: {
        CompletionItemKind: {
            Function: 1,
            Keyword: 2,
            Unit: 3,
            Enum: 4,
            Variable: 5,
            Value: 6
        }
    }
} as unknown as MonacoType

async function completions(line: string) {
    const provider = createM68KCompletition(monacoStub)
    const position = { lineNumber: 1, column: line.length + 1 }
    const model = {
        getValueInRange: () => line,
        getWordUntilPosition: () => {
            const word = /[A-Za-z0-9_]+$/.exec(line)?.[0] ?? ''
            return {
                word,
                startColumn: position.column - word.length,
                endColumn: position.column
            }
        }
    }
    const result = await provider.provideCompletionItems(
        model as never,
        position as never,
        {} as never,
        {} as never
    )
    return result?.suggestions ?? []
}

describe('M68K v2 language tooling', () => {
    it('keeps every added instruction and accepted directive in the documented vocabulary', () => {
        expect([...M68KDirectives].sort()).toEqual([...V2_DIRECTIVES].sort())
        expect([...M68kInstructions].sort()).toEqual([...V2_INSTRUCTIONS].sort())
        for (const name of [...ADDED_V2_INSTRUCTIONS, ...V2_DIRECTIVES]) {
            expect(getInstructionDocumentation(name), `${name} has documentation`).toBeDefined()
        }
        expect(M68KRefusedInstructions).toEqual(['rte', 'stop', 'reset'])
        expect(M68KRefusedDirectives).toEqual(
            expect.arrayContaining(['macro', 'endm', 'ifeq', 'endc', 'while', 'endw'])
        )
    })

    it('completes SIMHALT, uppercase directives, and operations after labels', async () => {
        const simhalt = await completions('    si')
        expect(simhalt).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ label: 'simhalt', insertText: 'simhalt' })
            ])
        )

        const end = await completions('    EN')
        expect(end).toEqual(
            expect.arrayContaining([expect.objectContaining({ label: 'end', insertText: 'END' })])
        )

        const labelled = await completions('entry: EN')
        expect(labelled).toEqual(
            expect.arrayContaining([expect.objectContaining({ label: 'end', insertText: 'END' })])
        )
    })

    it('offers v2 sizes and addressing modes in their operation context', async () => {
        expect((await completions('bra.')).map((item) => item.label)).toContain('s')
        expect((await completions('move.w ')).map((item) => item.label)).toEqual(
            expect.arrayContaining(['d(PC)', 'd(PC,Xn)', 'sr', 'ccr'])
        )
        expect((await completions('movem.w ')).map((item) => item.label)).toContain(
            '<register list>'
        )
    })

    it('formats v2 operations without changing separators in strings or comments', () => {
        expect(
            formatM68kSource("simhalt\nEND START\nlabel:move.w #1,d0\n dc.b 'a,b',1 ; leave,x")
        ).toBe("\tsimhalt\n\tEND START\nlabel:\tmove.w #1, d0\n dc.b 'a,b', 1 ; leave,x")
    })

    it('formats every new runtime exception for a learner', () => {
        expect(
            getM68kErrorMessage({ type: 'ChkOutOfBounds', value: { value: -1, bound: 9 } })
        ).toBe(' CHK exception: -1 is outside 0..9')
        expect(getM68kErrorMessage({ type: 'OverflowException' })).toContain('TRAPV')
        expect(getM68kErrorMessage({ type: 'IllegalInstruction' })).toContain('Illegal instruction')
    })
})
