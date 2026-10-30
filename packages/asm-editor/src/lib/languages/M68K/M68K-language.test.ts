import { describe, expect, it, onTestFinished, vi } from 'vite-plus/test'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import {
    getInstructionDocumentation,
    M68KDirectives,
    M68KRefusedDirectives,
    M68kInstructions
} from './M68K-documentation'
import {
    createM68KCompletion,
    createM68kHoverProvider,
    createM68kSignatureHelpProvider,
    formatM68kSource
} from './M68K-language'
import { getM68kErrorMessage, getM68kTerminationMessage } from './M68kUtils'
import { M68KLanguage, M68KLanguageConfiguration } from './M68K-grammar'
import type { MemoryRange } from '@specy/s68k'
import { tokenizeAssembly } from '#lib/content/assemblyHighlight.ts'
import { assemblyTokenOf } from '#lib/content/assemblyPalette.ts'

/** What the code blocks of the Documentation and the courses colour a piece of an M68K line. */
function kindOf(line: string, text: string) {
    return tokenizeAssembly(line, 'M68K')[0].find((token) => token.text === text)?.kind
}

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
    'extb',
    'rte',
    'stop',
    'reset',
    'rtd',
    'bkpt',
    'movec',
    'moves',
    //the 68020's
    ...['chk2', 'cmp2', 'cas', 'cas2', 'pack', 'unpk', 'divsl', 'divul', 'trapeq', 'trapt'],
    ...['bftst', 'bfextu', 'bfexts', 'bfffo', 'bfchg', 'bfclr', 'bfset', 'bfins']
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
    'rte',
    'stop',
    'reset',
    'tas',
    'trapv',
    'chk',
    'illegal',
    'rtd',
    'bkpt',
    'movec',
    'moves',
    ...['chk2', 'cmp2', 'cas', 'cas2', 'pack', 'unpk', 'divsl', 'divul'],
    ...['bftst', 'bfextu', 'bfexts', 'bfffo', 'bfchg', 'bfclr', 'bfset', 'bfins'],
    ...[...CONDITION_CODES, 't', 'f'].map((code) => `trap${code}`),
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
    'memory',
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
        expect(M68KRefusedDirectives).toEqual(
            expect.arrayContaining(['macro', 'endm', 'ifeq', 'endc', 'while', 'endw'])
        )
    })

    //the 68010's and the 68020's control registers are coloured as `usp` is, in the editor and in
    //the code blocks
    it('colours the control registers as usp, and completes them as movec’s operands', async () => {
        const operands = M68KLanguage.tokenizer.operands as unknown[]
        const cases = operands.flatMap((rule) => {
            const actions = Array.isArray(rule) ? rule[1] : undefined
            const first = Array.isArray(actions) ? actions[0] : undefined
            return first && typeof first === 'object' && 'cases' in first
                ? [first.cases as Record<string, string>]
                : []
        })
        expect(cases).toHaveLength(1)
        const [key] = Object.entries(cases[0]).find(([, token]) => token === 'variable.predefined')!
        const predefined = new RegExp(`^(?:${key.replace(/^\$1~/, '')})$`, 'i')
        const control = ['sfc', 'dfc', 'vbr', 'msp', 'isp', 'cacr', 'caar']
        for (const name of ['usp', ...control, 'VBR', 'MSP'])
            expect(predefined.test(name), name).toBe(true)
        expect(predefined.test('vbrx')).toBe(false)
        expect(predefined.test('mspx')).toBe(false)
        for (const name of control) {
            expect(kindOf(`    movec d0,${name}`, name), name).toBe(
                kindOf('    move.l a0,usp', 'usp')
            )
        }
        const offered = await completions('    movec ')
        expect(offered.map((item) => item.label)).toEqual([
            'An',
            'Dn',
            'usp',
            'vbr',
            'sfc',
            'dfc',
            'msp',
            'isp',
            'cacr',
            'caar'
        ])
        //the 68020's, tagged as its other operands are, after the 68010's
        const msp = offered.find((item) => item.label === 'msp')!
        expect(msp.detail).toBe('Master stack pointer, 68020 only')
        expect(msp.sortText).toBe('~msp')
    })

    //the Core reads and enforces EASy68K's memory map, so the line is a directive like any other
    //([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 15)
    it('highlights, completes and documents the memory directive', async () => {
        expect(M68KDirectives).toContain('memory')
        expect(M68KRefusedDirectives).not.toContain('memory')
        //the first rule of the editor's grammar to read the word, as Monaco reads it from there
        const line = 'memory rom $8000,$8fff'
        const rules = M68KLanguage.tokenizer.root as unknown[]
        const rule = rules.find(
            (candidate): candidate is [RegExp, unknown] =>
                Array.isArray(candidate) &&
                candidate[0] instanceof RegExp &&
                new RegExp(`^(?:${candidate[0].source})`, 'i').test(line)
        )
        expect(rule?.[1]).toEqual(['directive', expect.objectContaining({ next: '@operands' })])
        //and the code blocks of the Documentation and the courses
        const [memory] = tokenizeAssembly(`    ${line}`, 'M68K')[0].filter((t) => t.text.trim())
        expect(memory).toMatchObject({ kind: 'directive', text: 'memory' })
        expect(await completions('    mem')).toEqual(
            expect.arrayContaining([expect.objectContaining({ label: 'memory' })])
        )
        expect(getInstructionDocumentation('memory')?.description).toContain('bus error')
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
        // The size the operation already has comes first, then the modes in a fixed order, the
        // 68020's after the 68000's (below)
        expect((await resolved('move.w ')).slice(0, 15)).toEqual([
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
            'ccr | ccr | 5 | Condition-code register | ',
            'usp | usp | 5 | User stack pointer | '
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
                {
                    value: 'Sets the address where the following instructions or data are assembled. For example, `org $2000` places the next item at `$2000`. Within a section, it changes that section’s location counter.'
                },
                { value: 'org $1000' }
            ]
        })
        const dc = await hover('label: DC.L 1', 9)
        expect(dc?.range).toEqual(new Range(1, 8, 1, 10))
        expect(dc?.contents.map((content) => content.value)).toEqual([
            '# DC',
            '**Sizes:** b, w, l ',
            expect.stringMatching(/^Stores a comma-separated list of values in memory\./),
            "dc.b 'Hello world!', 4, %10, $F, @10, 'a', some_label"
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

    it('says an instruction is the 68020’s alone, and a form privileged, in its hover', async () => {
        const provider = createM68kHoverProvider(monacoStub)
        const value = async (line: string, column: number) => {
            const hover = await provider.provideHover(
                { getLineContent: () => line } as never,
                { lineNumber: 1, column } as never,
                {} as never
            )
            return hover?.contents.map((content) => content.value) ?? []
        }
        const [extb] = await value('    extb.l d0', 6)
        //the fact says it once, without the tag beside it
        expect(extb.split('\n\n')[1]).toBe(
            '*Arithmetic · Size .l · 68020 only: select `opt p=68020` before any code or data*'
        )
        //the first six of move's seven rows, the 68010's last, which its page lists
        const rows = (await value('    move.w d0,d1', 6)).find((block) =>
            block.includes('`move usp, An`')
        )
        expect(rows?.split('  \n').slice(3)).toEqual([
            '`move <ea>, sr` · Size .w · Privileged',
            '`move usp, An` · Size .l · Privileged',
            '`move An, usp` · Size .l · Privileged',
            '… 1 more on its page'
        ])
        //rte is privileged in its one form, so the tag is the instruction's
        const [rte] = await value('    rte', 6)
        expect(rte.split('\n\n')[1]).toBe('*System · Privileged*')
    })

    it('says in completion that an instruction is the 68020’s, and still offers it', async () => {
        const provider = createM68KCompletion(monacoStub)
        const [extb] = (await completions('    ext')).filter((item) => item.label === 'extb')
        expect(extb.detail).toBe('M68K instruction, 68020 only')
        expect(extb.documentation).toEqual({
            value: 'Sign-extends the low byte of a data register to a full long. For example, if `d0` is `$12345680`, `extb.l d0` makes it `$FFFFFF80` (-128). N and Z describe the long result, V and C are cleared, and X is unchanged.\n\n68020 only: select `opt p=68020` before any code or data.'
        })
        const resolved = await provider.resolveCompletionItem!(
            { label: 'extb', insertText: 'extb' } as never,
            {} as never
        )
        expect(resolved?.detail).toBe('M68K instruction, 68020 only')
        const [ext] = (await completions('    ext')).filter((item) => item.label === 'ext')
        expect(ext.detail).toBe('M68K instruction')
        expect(ext.documentation).toEqual(expect.any(String))
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

    it('leaves the options of an opt line as they are, one word to s68k', () => {
        //a space after a comma would end the options and make the rest a comment
        expect(formatM68kSource('    opt mex,p=68020,bit ; options\nopt cre,bit')).toBe(
            '    opt mex,p=68020,bit ; options\n\topt cre,bit'
        )
        expect(formatM68kSource('    move.w d0,d1')).toBe('    move.w d0, d1')
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
        expect(getM68kErrorMessage({ type: 'Irq', value: { level: 2 } }, 4)).toBe(
            'Error at line 4: IRQ 2'
        )
        //the 68020's, through the vectors of trapv and chk
        expect(getM68kErrorMessage({ type: 'ConditionalTrap' }, 5)).toBe(
            'Error at line 5: Conditional trap: a TRAPcc instruction ran while its condition was true'
        )
        expect(
            getM68kErrorMessage({
                type: 'Chk2OutOfBounds',
                value: { value: 12, lower: 1, upper: 5 }
            })
        ).toBe('CHK2 exception: 12 is outside 1..5')
        //bounds the other way round as signed numbers are an unsigned range
        expect(
            getM68kErrorMessage({
                type: 'Chk2OutOfBounds',
                value: { value: 5, lower: 16, upper: -16 }
            })
        ).toBe(
            'CHK2 exception: 5 is outside 16..-16, interpreted as an unsigned range because -16 is below 16'
        )
    })

    //an exception whose vector holds no handler ends the program, the vector named after where
    //it happened ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 9)
    it('names the vector that held no handler, and what the exception was about', () => {
        const ended = (cause: object, vector?: number) =>
            ({ type: 'Exception', value: { cause, vector } }) as Parameters<
                typeof getM68kTerminationMessage
            >[0]
        expect(getM68kTerminationMessage(ended({ type: 'DivisionByZero' }, 5), 12)).toBe(
            'Division by zero at line 12: vector 5 at $000014 holds no handler'
        )
        expect(
            getM68kTerminationMessage(
                ended({ type: 'UnhandledTrap', value: { vector: 35 } }, 35),
                4
            )
        ).toBe('TRAP #3 at line 4: vector 35 at $00008C holds no handler')
        //an IRQ whose autovector holds no handler, named for its level
        expect(getM68kTerminationMessage(ended({ type: 'Irq', value: { level: 2 } }, 26), 7)).toBe(
            'IRQ 2 at line 7: vector 26 at $000068 holds no handler'
        )
        //the 68020's trap<cc> and chk2
        expect(getM68kTerminationMessage(ended({ type: 'ConditionalTrap' }, 7), 6)).toBe(
            'Conditional trap at line 6: vector 7 at $00001C holds no handler (a TRAPcc instruction ran while its condition was true)'
        )
        expect(
            getM68kTerminationMessage(
                ended({ type: 'Chk2OutOfBounds', value: { value: -1, lower: 0, upper: 9 } }, 6),
                8
            )
        ).toBe(
            'CHK2 exception at line 8: vector 6 at $000018 holds no handler (-1 is outside 0..9)'
        )
        expect(
            getM68kTerminationMessage(
                ended({ type: 'LineA', value: 0xa123 }, 10),
                undefined,
                0x1000
            )
        ).toBe(
            'Line A instruction at $1000: vector 10 at $000028 holds no handler ($A123: the processor has no instruction starting with $A)'
        )
        expect(getM68kTerminationMessage(ended({ type: 'Trace' }, 9))).toBe(
            'Trace exception: vector 9 at $000024 holds no handler (the T bit of SR is set, which raises a trace exception after every instruction)'
        )
        expect(
            getM68kTerminationMessage(
                ended(
                    {
                        type: 'AddressError',
                        value: { address: 0x1001, size: 'Word', access: 'Program' }
                    },
                    3
                ),
                2
            )
        ).toBe(
            'Address error at line 2: vector 3 at $00000C holds no handler (fetching code at the odd address $1001)'
        )
        //a task EASy68K does not know goes through TRAP #15's own vector
        expect(
            getM68kTerminationMessage(
                ended({ type: 'UnsupportedTrapTask', value: { task: 200 } }, 47),
                3
            )
        ).toBe(
            'Trap task 200 is not a supported trap #15 task at line 3: vector 47 at $0000BC holds no handler'
        )
        //one no handler could take reads as any other error
        expect(
            getM68kTerminationMessage(
                ended({ type: 'UnsupportedTrapTask', value: { task: 10 } }),
                3
            )
        ).toBe(getM68kErrorMessage({ type: 'UnsupportedTrapTask', value: { task: 10 } }, 3))
    })

    it('says the CPU halted on a double fault, and what pushing the frame raised', () => {
        expect(
            getM68kTerminationMessage(
                {
                    type: 'Halted',
                    value: {
                        cause: {
                            type: 'AddressError',
                            value: { address: 0x4fff, size: 'Word' as never, access: 'Write' }
                        },
                        vector: 32
                    }
                },
                4
            )
        ).toBe(
            'The CPU halted at line 4: a double fault while handling TRAP #0 (vector 32). Saving the exception frame on the supervisor stack raised an address error, writing a word at the odd address $4FFF'
        )
    })

    it('reads every new cause of an error on its own, as the toasts show it', () => {
        expect(getM68kErrorMessage({ type: 'PrivilegeViolation' }, 3)).toBe(
            'Error at line 3: Privilege violation: the instruction requires supervisor mode, but the program is in user mode'
        )
        expect(getM68kErrorMessage({ type: 'LineF', value: 0xf000 })).toBe(
            'Line F instruction: $F000: the processor has no instruction starting with $F'
        )
        expect(
            getM68kErrorMessage({
                type: 'AddressError',
                value: { address: 0x2001, size: 'Long', access: 'Write' }
            })
        ).toBe('Address error: writing a long word at the odd address $2001')
    })

    //the memory map's bus error, vector 2, names the access and the `memory` line that refused it
    //([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 15)
    it('says what a bus error tried, and which range of the memory map refused it', () => {
        const range = (kind: MemoryRange['kind'], start: number, end: number): MemoryRange => ({
            kind,
            start,
            end,
            location: { file: 'main.x68', line: 0, column: 0, endColumn: 0 }
        })
        const map = [
            range('rom', 0x8000, 0x8fff),
            range('read', 0x9000, 0x9fff),
            range('protected', 0xa000, 0xafff),
            range('invalid', 0x0, 0x3ff)
        ]
        const busError = (address: number, size: string, access: string, kind: string) => ({
            type: 'BusError',
            value: { address, size, access, range: kind }
        })
        expect(
            getM68kErrorMessage(busError(0x9000, 'Word', 'Write', 'read'), 4, undefined, map)
        ).toBe(
            'Error at line 4: Bus error: writing a word at $9000, where the memory read directive marks $9000-$9FFF as read-only'
        )
        expect(
            getM68kErrorMessage(busError(0xa002, 'Byte', 'Read', 'protected'), 5, undefined, map)
        ).toBe(
            'Error at line 5: Bus error: reading a byte at $A002 in user mode, where the memory protected directive restricts $A000-$AFFF to supervisor mode'
        )
        expect(
            getM68kErrorMessage(
                busError(0x200, 'Word', 'Program', 'invalid'),
                undefined,
                0x200,
                map
            )
        ).toBe(
            'Error at $200: Bus error: fetching code at $200, where the memory invalid directive marks $0-$3FF as invalid'
        )
        //without the Program's map, as a toast has it, the line is named alone
        expect(getM68kErrorMessage(busError(0x9000, 'Long', 'Write', 'read'))).toBe(
            'Bus error: writing a long word at $9000, which the memory read directive marks as read-only'
        )
        const ended = {
            type: 'Exception',
            value: { cause: busError(0x9000, 'Word', 'Write', 'read'), vector: 2 }
        } as Parameters<typeof getM68kTerminationMessage>[0]
        expect(getM68kTerminationMessage(ended, 4, undefined, map)).toBe(
            'Bus error at line 4: vector 2 at $000008 holds no handler (writing a word at $9000, where the memory read directive marks $9000-$9FFF as read-only)'
        )
    })

    it('says the CPU halted on a bus error while it took an exception, reading its vector or pushing its frame', () => {
        const map: MemoryRange[] = [
            {
                kind: 'invalid',
                start: 0,
                end: 0x3ff,
                location: { file: 'main.x68', line: 0, column: 0, endColumn: 0 }
            },
            {
                kind: 'read',
                start: 0xf00000,
                end: 0xffffff,
                location: { file: 'main.x68', line: 1, column: 0, endColumn: 0 }
            }
        ]
        const halted = (cause: object, vector: number) =>
            ({ type: 'Halted', value: { cause, vector } }) as Parameters<
                typeof getM68kTerminationMessage
            >[0]
        expect(
            getM68kTerminationMessage(
                halted(
                    {
                        type: 'BusError',
                        value: { address: 0x14, size: 'Long', access: 'Read', range: 'invalid' }
                    },
                    5
                ),
                3,
                undefined,
                map
            )
        ).toBe(
            'The CPU halted at line 3: a double fault while handling Divide by zero (vector 5). Reading the vector at $000014 raised a bus error, where the memory invalid directive marks $0-$3FF as invalid'
        )
        expect(
            getM68kTerminationMessage(
                halted(
                    {
                        type: 'BusError',
                        value: { address: 0xfffffe, size: 'Word', access: 'Write', range: 'read' }
                    },
                    2
                ),
                3,
                undefined,
                map
            )
        ).toBe(
            'The CPU halted at line 3: a double fault while handling Bus error (vector 2). Saving the exception frame on the supervisor stack raised a bus error, writing a word at $FFFFFE, where the memory read directive marks $F00000-$FFFFFF as read-only'
        )
        expect(
            getM68kTerminationMessage(
                halted(
                    {
                        type: 'BusError',
                        value: { address: 0x200, size: 'Word', access: 'Program', range: 'invalid' }
                    },
                    2
                ),
                3,
                undefined,
                map
            )
        ).toBe(
            'The CPU halted at line 3: a double fault while handling Bus error (vector 2). Fetching the exception handler raised a bus error, fetching code at $200, where the memory invalid directive marks $0-$3FF as invalid'
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

/**
 * The editor's side of the 68020's addressing modes and long branches under `opt p=68020`
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3, and milestone E6c
 * of the plan): the operand syntax coloured in Monaco as in the code blocks, completion and
 * signature help tagging the modes 68020 only.
 */
describe('the 68020’s addressing modes in the editor', () => {
    type EditorToken = { text: string; token: string }

    /**
     * The lines as Monaco's own Monarch tokenizer reads them with the editor's grammar. Its
     * modules are Monaco's internals, which have no types and need no DOM.
     */
    async function monacoTokens(code: string): Promise<EditorToken[][]> {
        const monarch = 'monaco-editor/editor/standalone/common/monarch/'
        const { compile } = await import(/* @vite-ignore */ `${monarch}monarchCompile.js`)
        const { MonarchTokenizer } = await import(/* @vite-ignore */ `${monarch}monarchLexer.js`)
        const settings = {
            getValue: () => 20_000,
            onDidChangeConfiguration: () => ({ dispose() {} })
        }
        const tokenizer = new MonarchTokenizer(
            {},
            {},
            'm68k',
            compile('m68k', M68KLanguage),
            settings
        )
        let state = tokenizer.getInitialState()
        return code.split('\n').map((line) => {
            const result = tokenizer.tokenize(line, true, state)
            state = result.endState
            const tokens: { offset: number; type: string }[] = result.tokens
            return tokens
                .map((token, index) => ({
                    text: line.slice(token.offset, tokens[index + 1]?.offset ?? line.length),
                    //a theme colours `keyword.move` by its `keyword`, as it colours the code blocks
                    token: token.type
                        .replace(/\.m68k$/, '')
                        .replace(/^keyword\.(?!size$).*/, 'keyword')
                }))
                .filter((token) => token.text.trim())
        })
    }

    /** The code blocks' tokens of a line as the editor tokens they are painted as. */
    function blockTokens(line: string): EditorToken[] {
        return tokenizeAssembly(line, 'M68K')[0]
            .filter((token) => token.text.trim())
            .map((token) => ({ text: token.text, token: assemblyTokenOf(token, 'M68K') ?? '' }))
    }

    const LINES = [
        '    move.l (4,a0,d1.w*4),d2',
        '    move.l ([4,a0],d1.w*4,8),d2',
        '    move.l ([4,a0,d1.w*4],8),d2',
        '    lea ([messages,pc,d1.l*4]),a1',
        '    move.w ([current,za0],zd1.w*2),d0',
        '    move.l (1000.w,a0,d1.l),d0',
        '    jmp ([zpc],d0.w*2)',
        '    bra.l far'
    ]

    it('colours the operands in Monaco as the code blocks colour them', async () => {
        const editor = await monacoTokens(LINES.join('\n'))
        //what either colours: a name is the editor's plain `identifier`, and a bracket is coloured
        //by its nesting in both, apart from its token
        const coloured = (tokens: EditorToken[]) =>
            tokens.filter(
                (token) => /\w/.test(token.text) && !['', 'identifier'].includes(token.token)
            )
        LINES.forEach((line, index) => {
            expect(coloured(editor[index]), line).toEqual(coloured(blockTokens(line)))
        })
        const [scaled, , , pc, suppressed, , zpc, branch] = editor
        //the scale is an operator and its number, the brackets delimiters
        expect(scaled).toContainEqual({ text: '*', token: 'operator' })
        //Monaco runs neighbouring delimiters into one token
        expect(
            pc
                .filter((token) => token.token === 'delimiter')
                .map((token) => token.text)
                .join(' ')
        ).toBe('([ , , ]),')
        expect(pc).toContainEqual({ text: 'pc', token: 'variable.predefined' })
        //the suppressed registers are the registers they leave out, sized like them
        expect(suppressed).toEqual(
            expect.arrayContaining([
                { text: 'za0', token: 'address-register' },
                { text: 'zd1', token: 'data-register' },
                { text: '.w', token: 'keyword.size' }
            ])
        )
        expect(zpc).toContainEqual({ text: 'zpc', token: 'variable.predefined' })
        expect(branch.map((token) => token.token)).toEqual([
            'keyword',
            'keyword.size',
            'identifier'
        ])
    })

    //the 68020's supervisor model: its control registers, which `movec` names, are `usp`'s colour
    it('colours the 68020’s control registers in Monaco as the code blocks colour them', async () => {
        const lines = [
            '    movec d0,msp',
            '    movec isp,a0',
            '    movec d1,cacr',
            '    movec caar,d2',
            '    move.l a0,usp'
        ]
        const editor = await monacoTokens(lines.join('\n'))
        lines.forEach((line, index) => {
            const name = /(msp|isp|cacr|caar|usp)/.exec(line)![1]
            expect(editor[index], line).toContainEqual({ text: name, token: 'variable.predefined' })
            expect(blockTokens(line), line).toContainEqual({
                text: name,
                token: 'variable.predefined'
            })
        })
        //a label that only starts like one stays a name
        const [label] = await monacoTokens('    move.l mspeed,d0')
        expect(label).toContainEqual({ text: 'mspeed', token: 'identifier' })
    })

    it('colours a displacement’s width as a size', async () => {
        const [line] = await monacoTokens('    move.l (1000.w,a0,d1.l),d0')
        expect(line.slice(2, 4)).toEqual([
            { text: '(', token: 'delimiter' },
            { text: '1000', token: 'number' }
        ])
        expect(line[4]).toEqual({ text: '.w', token: 'keyword.size' })
        expect(kindOf('    move.l (1000.w,a0,d1.l),d0', '.w')).toBe('size')
    })

    it('reads za0, zd0 and zpc as names outside an operand’s parentheses', async () => {
        const [label, operand, unclosed, next] = await monacoTokens(
            ['za0: dc.l 0', '    move.l za0,zd0', '    move.l (za0', '    move.l za0,d0'].join('\n')
        )
        expect(label[0]).toEqual({ text: 'za0', token: 'label' })
        expect(operand.filter((token) => /z/.test(token.text))).toEqual([
            { text: 'za0', token: 'identifier' },
            { text: 'zd0', token: 'identifier' }
        ])
        expect(unclosed).toContainEqual({ text: 'za0', token: 'address-register' })
        //a parenthesis left open ends with its line
        expect(next).toContainEqual({ text: 'za0', token: 'identifier' })
        //the code blocks run a plain name on into the comma after it
        const name = tokenizeAssembly('    move.l za0,d0', 'M68K')[0].find((token) =>
            token.text.includes('za0')
        )
        expect(name).toEqual({ kind: 'plain', text: ' za0,' })
        expect(kindOf('    move.l (za0),d0', 'za0')).toBe('register')
    })

    it('offers the 68020’s indexed modes where the 68000’s are, tagged 68020 only', async () => {
        const provider = createM68KCompletion(monacoStub)
        const later = (await completions('    move.w ')).filter((item) => item.sortText)
        expect(later.map((item) => [item.label, item.insertText, item.sortText])).toEqual([
            ['(bd,An,Xn*k)', '(0,a0,d0.w*4)', '~(bd,An,Xn*k)'],
            ['([bd,An],Xn,od)', '([0,a0],d0.w,0)', '~([bd,An],Xn,od)'],
            ['([bd,An,Xn],od)', '([0,a0,d0.w],0)', '~([bd,An,Xn],od)'],
            ['(bd,PC,Xn*k)', '(0,pc,d0.w*4)', '~(bd,PC,Xn*k)'],
            ['([bd,PC],Xn,od)', '([0,pc],d0.w,0)', '~([bd,PC],Xn,od)'],
            ['([bd,PC,Xn],od)', '([0,pc,d0.w],0)', '~([bd,PC,Xn],od)']
        ])
        const [scaled, post, pre] = later
        expect(scaled.detail).toBe('Scaled index with a base displacement, 68020 only')
        expect(post.detail).toBe('Memory indirect, postindexed, 68020 only')
        expect(pre.detail).toBe('Memory indirect, preindexed, 68020 only')
        expect(scaled.documentation).toEqual({
            value: 'Memory at a0 + bd + index × k. k is 1, 2, 4 or 8, allowing the index to count elements instead of bytes. bd can be a word or a long word. Any component can be omitted.\n\n68020 only: select `opt p=68020` before any code or data.'
        })
        //resolving keeps the tag
        const resolved = await provider.resolveCompletionItem!(
            { label: '([bd,PC],Xn,od)', insertText: '([0,pc],d0.w,0)' } as never,
            {} as never
        )
        expect(resolved?.detail).toBe('Memory indirect, postindexed, 68020 only')
        //a position without an indexed mode has none of them; a destination has no PC forms
        expect((await completions('    moveq #1,')).some((item) => item.sortText)).toBe(false)
        expect(
            (await completions('    move.w d0,'))
                .filter((item) => item.sortText)
                .map((item) => item.label)
        ).toEqual(['(bd,An,Xn*k)', '([bd,An],Xn,od)', '([bd,An,Xn],od)'])
    })

    it('offers no whole operand after a comma inside an operand’s parentheses', async () => {
        for (const line of ['    move.w (4,', '    move.w ([4,a0],', '    move.w d0,([a0,'])
            expect(await completions(line), line).toEqual([])
        //after the operand closes, the next one's modes come back
        expect(
            (await completions('    move.w ([4,a0],d1.w),')).map((item) => item.label)
        ).toContain('(An)')
    })

    it('says in signature help which positions take the 68020’s indexed modes', async () => {
        const provider = createM68kSignatureHelpProvider(monacoStub)
        const parameters = async (line: string) => {
            const result = await provider.provideSignatureHelp(
                { getValueInRange: () => line } as never,
                { lineNumber: 1, column: line.length + 1 } as never,
                {} as never,
                {} as never
            )
            result?.dispose()
            return result?.value
        }
        const move = await parameters('    move.w ([4,a0,d1.w*4],8), ')
        expect(move?.activeParameter).toBe(1)
        const [source, destination] = move!.signatures[0].parameters
        expect(source.documentation).toEqual({
            value: 'Also accepts `(bd,An,Xn*k)`, `([bd,An],Xn,od)`, `([bd,An,Xn],od)`, `(bd,PC,Xn*k)`, `([bd,PC],Xn,od)` and `([bd,PC,Xn],od)`. 68020 only: select `opt p=68020` before any code or data.'
        })
        expect(destination.documentation).toEqual({
            value: 'Also accepts `(bd,An,Xn*k)`, `([bd,An],Xn,od)` and `([bd,An,Xn],od)`. 68020 only: select `opt p=68020` before any code or data.'
        })
        const [count] = (await parameters('    moveq '))!.signatures[0].parameters
        expect(count.documentation).toBeUndefined()
    })
})

/**
 * The editor's side of the 68020's instructions and of `opt bit`
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 3, and milestone E6c
 * of the plan): its register pairs and bit fields coloured in Monaco as in the code blocks, and
 * offered and explained by completion and signature help.
 */
describe('the 68020’s instructions in the editor', () => {
    async function monacoTokens(code: string): Promise<{ text: string; token: string }[][]> {
        const monarch = 'monaco-editor/editor/standalone/common/monarch/'
        const { compile } = await import(/* @vite-ignore */ `${monarch}monarchCompile.js`)
        const { MonarchTokenizer } = await import(/* @vite-ignore */ `${monarch}monarchLexer.js`)
        const settings = {
            getValue: () => 20_000,
            onDidChangeConfiguration: () => ({ dispose() {} })
        }
        const tokenizer = new MonarchTokenizer(
            {},
            {},
            'm68k',
            compile('m68k', M68KLanguage),
            settings
        )
        let state = tokenizer.getInitialState()
        return code.split('\n').map((line) => {
            const result = tokenizer.tokenize(line, true, state)
            state = result.endState
            const tokens: { offset: number; type: string }[] = result.tokens
            return tokens
                .map((token, index) => ({
                    text: line.slice(token.offset, tokens[index + 1]?.offset ?? line.length),
                    token: token.type
                        .replace(/\.m68k$/, '')
                        .replace(/^keyword\.(?!size$).*/, 'keyword')
                }))
                .filter((token) => token.text.trim())
        })
    }

    async function parameters(line: string) {
        const provider = createM68kSignatureHelpProvider(monacoStub)
        const result = await provider.provideSignatureHelp(
            { getValueInRange: () => line } as never,
            { lineNumber: 1, column: line.length + 1 } as never,
            {} as never,
            {} as never
        )
        result?.dispose()
        return result?.value.signatures[0]
    }

    const LINES = [
        '    cas2.l d0:d1,d2:d3,(a0):(d4)',
        '    muls.l (4,a0,d1.w*4),d2:d3',
        '    bfins d1,(a0){d2:d3}',
        '    bfextu ([4,a0]){#0:8},d0',
        '    trapeq.w #3',
        '    callm #0,(a0)'
    ]

    it('colours the pairs and the bit fields in Monaco as the code blocks colour them', async () => {
        const editor = await monacoTokens(LINES.join('\n'))
        const coloured = (tokens: { text: string; token: string }[]) =>
            tokens.filter(
                (token) => /\w/.test(token.text) && !['', 'identifier'].includes(token.token)
            )
        LINES.forEach((line, index) => {
            const blocks = tokenizeAssembly(line, 'M68K')[0]
                .filter((token) => token.text.trim())
                .map((token) => ({ text: token.text, token: assemblyTokenOf(token, 'M68K') ?? '' }))
            expect(coloured(editor[index]), line).toEqual(coloured(blocks))
        })
        const [cas2, , bfins, bfextu, trap, callm] = editor
        expect(
            cas2.filter((token) => token.token === 'data-register').map((token) => token.text)
        ).toEqual(['d0', 'd1', 'd2', 'd3', 'd4'])
        //Monaco runs neighbouring delimiters into one token
        expect(
            bfins
                .filter((token) => token.token === 'delimiter')
                .map((token) => token.text)
                .join(' ')
        ).toBe(',( ){ : }')
        expect(bfextu).toContainEqual({ text: '#', token: 'number.immediate' })
        expect(trap.map((token) => token.token)).toEqual([
            'keyword',
            'keyword.size',
            'number.immediate',
            'number'
        ])
        //the module call is the one 68020 instruction s68k refuses
        expect(callm[0]).toEqual({ text: 'callm', token: 'invalid' })
        expect(M68KLanguageConfiguration.brackets).toContainEqual(['{', '}'])
    })

    it('offers the modes the 68020’s tst and cmpi add, tagged 68020 only', async () => {
        const tagged = async (line: string) =>
            (await completions(line))
                .filter((item) => item.sortText)
                .map((item) => [item.label, item.detail])
        const indexed = [
            ['(bd,An,Xn*k)', 'Scaled index with a base displacement, 68020 only'],
            ['([bd,An],Xn,od)', 'Memory indirect, postindexed, 68020 only'],
            ['([bd,An,Xn],od)', 'Memory indirect, preindexed, 68020 only']
        ]
        const pcIndexed = [
            ['(bd,PC,Xn*k)', 'Scaled index with a base displacement, 68020 only'],
            ['([bd,PC],Xn,od)', 'Memory indirect, postindexed, 68020 only'],
            ['([bd,PC,Xn],od)', 'Memory indirect, preindexed, 68020 only']
        ]
        //tst takes An, an immediate and the PC-relative modes on the 68020, after the 68000's own
        expect(await tagged('    tst.w ')).toEqual([
            ['An', 'Address register, 68020 only'],
            ['#', '#<num/label> | decimal number or label, 68020 only'],
            ['d(PC)', 'Program-counter displacement, 68020 only'],
            ['d(PC,Xn)', 'Program-counter displacement with an index, 68020 only'],
            ...indexed,
            ...pcIndexed
        ])
        const tst = await completions('    tst.w ')
        expect(tst.find((item) => item.label === 'Dn')?.sortText).toBeUndefined()
        expect(tst.find((item) => item.label === 'An')?.documentation).toEqual({
            value: '68020 only: select `opt p=68020` before any code or data.'
        })
        //cmpi compares with a PC-relative destination on the 68020, and its immediate is the 68000's
        expect(await tagged('    cmpi.w #1,')).toEqual([
            ['d(PC)', 'Program-counter displacement, 68020 only'],
            ['d(PC,Xn)', 'Program-counter displacement with an index, 68020 only'],
            ...indexed,
            ...pcIndexed
        ])
        expect(await tagged('    cmpi.w ')).toEqual([])
        //cmp's page lists its own forms only, not those it assembles as cmpi, the 68020's among them
        expect(await tagged('    cmp.w d0,')).toEqual([])
    })

    it('says in completion that a bit field is the 68020’s or 68000 with opt bit', async () => {
        const [bfextu] = (await completions('    bfext')).filter((item) => item.label === 'bfextu')
        expect(bfextu.detail).toBe('M68K instruction, 68020, or 68000 and 68010 with opt bit')
        expect((bfextu.documentation as { value: string }).value).toMatch(
            /\n\nSelect `opt p=68020`, or use `opt bit` with the 68000 or 68010, before any code or data\.$/
        )
        const [cas] = (await completions('    cas')).filter((item) => item.label === 'cas')
        expect(cas.detail).toBe('M68K instruction, 68020 only')
        //every condition of trap<cc>, which the 68020 brought
        const traps = (await completions('    trap')).map((item) => item.label)
        expect(traps).toEqual(expect.arrayContaining(['trapeq', 'trapt', 'trapf', 'trapv']))
    })

    it('offers the register pairs where the long multiplies, the divides and cas2 take them', async () => {
        const muls = await completions('    muls.l d0,')
        expect(muls.map((item) => [item.label, item.insertText, item.sortText])).toEqual([
            ['Dn', 'd0', undefined],
            ['Dx:Dy', 'd0:d1', '~Dx:Dy']
        ])
        expect(muls[1].detail).toBe('Register pair, 68020 only')
        expect((await completions('    divsl.l d0,')).map((item) => item.label)).toEqual(['Dx:Dy'])
        expect((await completions('    cas2 ')).map((item) => item.label)).toEqual(['Dx:Dy'])
        const [addresses] = await completions('    cas2.l d0:d1,d2:d3,')
        expect([addresses.label, addresses.insertText, addresses.detail]).toEqual([
            '(Rx):(Ry)',
            '(a0):(a1)',
            'Pair of addresses, 68020 only'
        ])
    })

    it('offers a bit field’s operand with its field after it', async () => {
        const items = await completions('    bfextu ')
        expect(items.slice(0, 3).map((item) => [item.label, item.insertText, item.detail])).toEqual(
            [
                ['Dn{offset:width}', 'd0{0:8}', 'Data register, with a bit field'],
                ['EA{offset:width}', 'label{0:8}', 'Effective address, with a bit field'],
                ['(An){offset:width}', '(a0){0:8}', 'Indirect, with a bit field']
            ]
        )
        expect((items[0].documentation as { value: string }).value).toContain('`{offset:width}`')
        //a 68020 mode keeps its tag, and comes after the 68000's
        const scaled = items.find((item) => item.label === '(bd,An,Xn*k){offset:width}')!
        expect(scaled.detail).toBe(
            'Scaled index with a base displacement, 68020 only, with a bit field'
        )
        expect(scaled.sortText).toBe('~(bd,An,Xn*k){offset:width}')
        //a destination has no PC-relative field, and the register after it no field at all
        expect((await completions('    bfset ')).map((item) => item.label)).not.toContain(
            'd(PC){offset:width}'
        )
        expect((await completions('    bfextu d0{0:8},')).map((item) => item.label)).toEqual(['Dn'])
    })

    it('says in signature help where a bit field goes and which positions take a pair', async () => {
        const bfextu = (await parameters('    bfextu '))!
        expect(bfextu.label).toBe(
            'bfextu Dn/(An)/d(An)/d(An,Xn)/Ea/<label>/d(PC)/d(PC,Xn){offset:width}, Dn'
        )
        expect((bfextu.parameters[0].documentation as { value: string }).value).toMatch(
            /^A bit field follows the operand: `\{offset:width\}`.*\n\nAlso accepts `\(bd,An,Xn\*k\)`/s
        )
        const [, destination] = (await parameters('    muls.l d0,'))!.parameters
        expect(destination).toEqual({
            label: 'Dn/Dx:Dy',
            documentation: {
                value: 'Also accepts `Dx:Dy`. 68020 only: select `opt p=68020` before any code or data.'
            }
        })
        //cas2 is the 68020's in all of it: its positions say nothing more
        const cas2 = (await parameters('    cas2.l '))!
        expect(cas2.label).toBe('cas2.l Dx:Dy, Dx:Dy, (Rx):(Ry)')
        expect(cas2.parameters.map((parameter) => parameter.documentation)).toEqual([
            undefined,
            undefined,
            undefined
        ])
    })

    it('says in its hover that a bit field is the 68020’s, or 68000 with opt bit, once', async () => {
        const provider = createM68kHoverProvider(monacoStub)
        const hover = await provider.provideHover(
            { getLineContent: () => '    bfextu d0{0:8},d1' } as never,
            { lineNumber: 1, column: 6 } as never,
            {} as never
        )
        const [header, , , rows] = hover!.contents.map((content) => content.value)
        expect(header.split('\n\n')[1]).toBe(
            '*Logic · Select `opt p=68020`, or use `opt bit` with the 68000 or 68010, before any code or data*'
        )
        expect(rows).toBe('`bfextu <ea>{offset:width}, Dn`')
    })
})
