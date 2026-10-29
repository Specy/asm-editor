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
import { M68KLanguage } from './M68K-grammar'
import type { MemoryRange } from '@specy/s68k'
import { tokenizeAssembly } from '#lib/content/assemblyHighlight.ts'

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
    'moves'
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

    //the 68010's control registers are coloured as `usp` is, in the editor and in the code blocks
    it('colours sfc, dfc and vbr as usp, and completes them as movec’s operands', async () => {
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
        for (const name of ['usp', 'sfc', 'dfc', 'vbr', 'VBR'])
            expect(predefined.test(name), name).toBe(true)
        expect(predefined.test('vbrx')).toBe(false)
        for (const name of ['sfc', 'dfc', 'vbr']) {
            expect(kindOf(`    movec d0,${name}`, name)).toBe(kindOf('    move.l a0,usp', 'usp'))
        }
        expect((await completions('    movec ')).map((item) => item.label)).toEqual([
            'An',
            'Dn',
            'usp',
            'vbr',
            'sfc',
            'dfc'
        ])
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
            '*Arithmetic · Size .l · 68020 only: write `opt p=68020` at the top of the program*'
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
            value: 'Sign extends the low byte of a data register directly to a long.\n\n68020 only: write `opt p=68020` at the top of the program.'
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
            'Trace exception: vector 9 at $000024 holds no handler (the T bit of SR is set, so the processor stops after every instruction)'
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
            'The CPU halted at line 4: a double bus fault while taking TRAP #0 (vector 32), as pushing its frame raised an address error, writing a word at the odd address $4FFF'
        )
    })

    it('reads every new cause of an error on its own, as the toasts show it', () => {
        expect(getM68kErrorMessage({ type: 'PrivilegeViolation' }, 3)).toBe(
            'Error at line 3: Privilege violation: the instruction runs only in supervisor mode, and the program is in user mode'
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
            "Error at line 4: Bus error: writing a word at $9000, where the program's memory read line makes $9000-$9FFF read only"
        )
        expect(
            getM68kErrorMessage(busError(0xa002, 'Byte', 'Read', 'protected'), 5, undefined, map)
        ).toBe(
            "Error at line 5: Bus error: reading a byte at $A002 in user mode, where the program's memory protected line keeps $A000-$AFFF for supervisor mode"
        )
        expect(
            getM68kErrorMessage(
                busError(0x200, 'Word', 'Program', 'invalid'),
                undefined,
                0x200,
                map
            )
        ).toBe(
            "Error at $200: Bus error: fetching code at $200, where the program's memory invalid line makes $0-$3FF invalid"
        )
        //without the Program's map, as a toast has it, the line is named alone
        expect(getM68kErrorMessage(busError(0x9000, 'Long', 'Write', 'read'))).toBe(
            "Bus error: writing a long word at $9000, which the program's memory read line makes read only"
        )
        const ended = {
            type: 'Exception',
            value: { cause: busError(0x9000, 'Word', 'Write', 'read'), vector: 2 }
        } as Parameters<typeof getM68kTerminationMessage>[0]
        expect(getM68kTerminationMessage(ended, 4, undefined, map)).toBe(
            "Bus error at line 4: vector 2 at $000008 holds no handler (writing a word at $9000, where the program's memory read line makes $9000-$9FFF read only)"
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
            "The CPU halted at line 3: a double bus fault while taking Divide by zero (vector 5), as reading its vector at $000014 raised a bus error, where the program's memory invalid line makes $0-$3FF invalid"
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
            "The CPU halted at line 3: a double bus fault while taking Bus error (vector 2), as pushing its frame raised a bus error, writing a word at $FFFFFE, where the program's memory read line makes $F00000-$FFFFFF read only"
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
