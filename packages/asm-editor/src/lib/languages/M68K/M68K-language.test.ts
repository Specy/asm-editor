import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import {
    getInstructionDocumentation,
    M68KDirectives,
    M68KRefusedDirectives,
    M68KRefusedInstructions,
    M68kInstructions
} from './M68K-documentation'
import {
    createM68KCompletion,
    createM68kHoverProvider,
    createM68kSignatureHelpProvider,
    formatM68kSource
} from './M68K-language'
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
    const provider = createM68KCompletion(monacoStub)
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

    it('offers the addressing modes of the operand with their insert text and detail', async () => {
        const provider = createM68KCompletion(monacoStub)
        const resolved = async (line: string) =>
            Promise.all(
                (await completions(line)).map(async (item) => {
                    const { label, insertText, kind, detail, documentation } =
                        (await provider.resolveCompletionItem!(item, {} as never)) ?? item
                    return [label, insertText, kind, detail, documentation].join(' | ')
                })
            )
        // The size the operation already has comes first, then the modes in a fixed order.
        expect(await resolved('move.w ')).toEqual([
            'w | w  | 4 | Selects first 16 bits of the register | Select first part of the register',
            'An | a0 | 5 | Address register | ',
            'Dn | d0 | 5 | Data register | ',
            '# | # | 6 | #<num/label> | decimal number or label | Decimal immediate number or label',
            'EA | label | 6 | Effective address | ',
            '(An) | (a0) | 6 | Indirect | ',
            '-(An) | -(a0) | 6 | Indirect with predecrement | ',
            '(An)+ | (a0)+ | 6 | Indirect with postincrement | ',
            'd(An) | 0(a0) | 6 | Address-register displacement | ',
            'd(An,Xn) | 0(a0,d0) | 6 | Address-register displacement with an index | ',
            'd(PC) | 0(pc) | 6 | Program-counter displacement | ',
            'd(PC,Xn) | 0(pc,d0) | 6 | Program-counter displacement with an index | ',
            'sr | sr | 5 | Status register | ',
            'ccr | ccr | 5 | Condition-code register | '
        ])
        expect(await resolved('movem.w ')).toContain(
            '<register list> | d0-d1/a0-a1 | 5 | Register list for MOVEM | '
        )
        expect(await resolved('bra.')).toEqual([
            'b | b  | 4 | Selects first 8 bits of the register | Select first 8 bits of the register',
            's | s  | 4 | Selects a short branch displacement | Select a short branch displacement',
            'w | w  | 4 | Selects first 16 bits of the register | Select first part of the register',
            'l | l  | 4 | Select all 32 bits of the register | Select all bits of the register'
        ])
        expect(await resolved('move.w #')).toEqual([
            '$ | $ | 3 | $<num> | hexadecimal number | Hexadecimal immediate number',
            '% | % | 3 | %<num> | binary number | Binary immediate number',
            '@ | @ | 3 | @<num> | octal number | Octal immediate number',
            "' | ' | 3 |  | "
        ])
    })

    it('describes a directive by its sizes, description and example', async () => {
        const provider = createM68kHoverProvider(monacoStub)
        const hover = async (line: string, column: number) =>
            provider.provideHover(
                { getLineContent: () => line } as never,
                { lineNumber: 1, column } as never,
                {} as never
            )
        expect(await hover('    org $1000', 6)).toEqual({
            range: new Range(1, 5, 1, 8),
            contents: [
                { value: '# org' },
                { value: '**Sizes:** Not sized ' },
                { value: 'Sets the current position in memory for the following instructions' },
                { value: 'org $1000' }
            ]
        })
        const dc = await hover('label: DC.L 1', 9)
        expect(dc?.range).toEqual(new Range(1, 8, 1, 10))
        expect(dc?.contents.map((content) => content.value)).toEqual([
            '# DC',
            '**Sizes:** b, w, l ',
            expect.stringMatching(/^Defines constants, /),
            "dc.b 'Hello world!', 4, %10, $F, @8, 'a', some_label"
        ])
    })

    it('returns no empty hover and highlights only the operation token', async () => {
        const provider = createM68kHoverProvider(monacoStub)
        const line = 'entry: move.w #1,d0'
        const model = { getLineContent: () => line }
        const hover = await provider.provideHover(
            model as never,
            { lineNumber: 1, column: 10 } as never,
            {} as never
        )
        expect(hover?.range).toEqual(new Range(1, 8, 1, 12))
        expect(
            await provider.provideHover(
                model as never,
                { lineNumber: 1, column: 2 } as never,
                {} as never
            )
        ).toBeNull()
    })

    it('names the category of a family member under its heading', async () => {
        const provider = createM68kHoverProvider(monacoStub)
        const value = async (line: string, column: number) => {
            const hover = await provider.provideHover(
                { getLineContent: () => line } as never,
                { lineNumber: 1, column } as never,
                {} as never
            )
            return hover?.contents.map((content) => content.value) ?? []
        }
        // `beq` is a member of the Bcc family, whose category it takes.
        const [beq, summary, flags, rows] = await value('    beq loop', 6)
        expect(beq.split('\n\n')).toEqual([
            '**beq** Branch if equal',
            '*Control flow · Sizes .b .s .w .l*'
        ])
        expect(summary).toMatch(/^Branches /)
        expect(flags).toBe('Flags: X – · N – · Z – · V – · C –')
        expect(rows).toBe('`beq label`')
        // `move <ea>,sr` is privileged, but `move` is not in all of its forms.
        const [move] = await value('    move.w d0,d1', 6)
        expect(move.split('\n\n')[1]).toBe('*Data movement*')
        // Directives have no category.
        const [org] = await value('    org $1000', 6)
        expect(org).not.toContain('*')
    })

    it("links the instruction's Documentation by the page's address", async () => {
        //Monaco renders a link without a scheme as plain text, so a hover's are absolute
        vi.stubGlobal('location', { origin: 'https://asm.example' })
        onTestFinished(() => void vi.unstubAllGlobals())
        const hover = await createM68kHoverProvider(monacoStub).provideHover(
            { getLineContent: () => '    move.w d0,d1' } as never,
            { lineNumber: 1, column: 6 } as never,
            {} as never
        )
        const text = hover?.contents.map((content) => content.value).join('\n\n') ?? ''
        expect(text).toContain(
            '[Documentation](https://asm.example/documentation/m68k/instruction/move)'
        )
    })

    it('tracks the active operand in signature help without counting nested commas', async () => {
        const provider = createM68kSignatureHelpProvider(monacoStub)
        const line = 'move.w 0(a0,d0), '
        const result = await provider.provideSignatureHelp(
            { getValueInRange: () => line } as never,
            { lineNumber: 1, column: line.length + 1 } as never,
            {} as never,
            {} as never
        )
        expect(result?.value.activeParameter).toBe(1)
        expect(result?.value.signatures[0].label).toContain('move.w')
        expect(result?.value.signatures[0].parameters).toHaveLength(2)
        result?.dispose()
    })

    it('names the postincrement and predecrement operands in signature help', async () => {
        const provider = createM68kSignatureHelpProvider(monacoStub)
        const label = async (line: string) => {
            const result = await provider.provideSignatureHelp(
                { getValueInRange: () => line } as never,
                { lineNumber: 1, column: line.length + 1 } as never,
                {} as never,
                {} as never
            )
            result?.dispose()
            return result?.value.signatures[0].label
        }
        expect(await label('cmpm ')).toBe('cmpm (An)+, (An)+')
        expect(await label('addx ')).toBe('addx Dn/-(An), Dn/-(An)')
    })

    it('does not show signature help while the cursor is in a comment', async () => {
        const provider = createM68kSignatureHelpProvider(monacoStub)
        const line = 'move.w #1,d0 ; operand, comment'
        expect(
            await provider.provideSignatureHelp(
                { getValueInRange: () => line } as never,
                { lineNumber: 1, column: line.length + 1 } as never,
                {} as never,
                {} as never
            )
        ).toBeNull()
    })

    it('formats v2 operations without changing separators in strings or comments', () => {
        expect(
            formatM68kSource("simhalt\nEND START\nlabel:move.w #1,d0\n dc.b 'a,b',1 ; leave,x")
        ).toBe("\tsimhalt\n\tEND START\nlabel:\tmove.w #1, d0\n dc.b 'a,b', 1 ; leave,x")
        expect(formatM68kSource('move.w #1,d0\r\nsimhalt\r\n')).toBe(
            '\tmove.w #1, d0\r\n\tsimhalt\r\n'
        )
    })

    it('formats every new runtime exception for a learner', () => {
        expect(
            getM68kErrorMessage({ type: 'ChkOutOfBounds', value: { value: -1, bound: 9 } })
        ).toBe('CHK exception: -1 is outside 0..9')
        expect(getM68kErrorMessage({ type: 'OverflowException' })).toContain('TRAPV')
        expect(getM68kErrorMessage({ type: 'IllegalInstruction' })).toContain('Illegal instruction')
        //what the Core does not run yet, which a program can only reach in bytes it never
        //assembled as code
        expect(getM68kErrorMessage({ type: 'Unimplemented', value: '`rte`' }, 4)).toBe(
            'Error at line 4: `rte` is not implemented yet'
        )
    })

    //a caller follows its own sentence with a space ("Error compiling code. Entry file not found")
    it('starts a message without a line at its first word, and one with a line after the colon', () => {
        expect(getM68kErrorMessage(new Error('Entry file not found: gone.s'))).toBe(
            'Entry file not found: gone.s'
        )
        expect(getM68kErrorMessage({ type: 'DivisionByZero' }, 3)).toBe(
            'Error at line 3: Division by zero'
        )
        expect(getM68kErrorMessage('refused', 2)).toBe('Error at line 2: refused')
    })
})
