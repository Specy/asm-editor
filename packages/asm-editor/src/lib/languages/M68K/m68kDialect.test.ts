/**
 * The program's **Processor dialect** and what follows it
 * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36): the one rule of
 * what a processor choice shows, and completion and hovers, which leave out what a later processor
 * brought in a Project whose live analysis knows the program's processor, and keep everything where
 * it is unknown.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { MonacoType } from '#lib/monaco/Monaco.ts'
import { normalizeBuildInput } from '#lib/projectFiles.ts'
import { registerLanguageSession } from '#lib/languages/service/sessionRegistry.ts'
import { analyzeM68kProject } from '#lib/languages/service/adapters/m68kAdapter.ts'
import { projectSourceUri } from '#lib/languages/service/uri.ts'
import { createM68KCompletion, createM68kHoverProvider } from './M68K-language'
import {
    m68kDialectHas,
    m68kDialectKey,
    m68kFormShown,
    m68kLookAhead,
    type M68kDialect
} from './m68kDialect'

const M68000: M68kDialect = { processor: '68000', bitFields: false }
const M68000_BIT: M68kDialect = { processor: '68000', bitFields: true }
const M68010: M68kDialect = { processor: '68010', bitFields: false }
const M68020: M68kDialect = { processor: '68020', bitFields: true }

describe('what a processor choice shows', () => {
    it('is what the processor and the ones before it brought, and the bit fields under opt bit', () => {
        expect(m68kDialectHas(M68000, { processor: '68000' })).toBe(true)
        expect(m68kDialectHas(M68000, { processor: '68010' })).toBe(false)
        expect(m68kDialectHas(M68010, { processor: '68010' })).toBe(true)
        expect(m68kDialectHas(M68010, { processor: '68020' })).toBe(false)
        expect(m68kDialectHas(M68020, { processor: '68010' })).toBe(true)
        //`opt bit` gives the bit fields, and nothing else of the 68020
        const bitField = { processor: '68020', bitField: true } as const
        expect(m68kDialectHas(M68000, bitField)).toBe(false)
        expect(m68kDialectHas(M68000_BIT, bitField)).toBe(true)
        expect(m68kDialectHas(M68000_BIT, { processor: '68020' })).toBe(false)
        expect(m68kDialectHas(M68020, bitField)).toBe(true)
    })

    it('reads a form of the instruction table by its processor and its bit field', () => {
        const bftst = { processor: '68020' as const, operands: [['Dn', '{offset:width}']] }
        const extb = { processor: '68020' as const, operands: [['Dn']] }
        expect(m68kFormShown(bftst, M68000)).toBe(false)
        expect(m68kFormShown(bftst, M68000_BIT)).toBe(true)
        expect(m68kFormShown(extb, M68000_BIT)).toBe(false)
        expect(m68kFormShown(extb, M68020)).toBe(true)
    })

    it('keys a dialect by what it shows, the 68020 having its bit fields anyway', () => {
        expect(m68kDialectKey(M68000)).toBe('68000')
        expect(m68kDialectKey(M68000_BIT)).toBe('68000+bit')
        expect(m68kDialectKey(M68020)).toBe('68020')
        expect(m68kDialectKey({ processor: '68020', bitFields: false })).toBe('68020')
    })

    it('looks ahead to a picked processor, keeping the opt bit of an earlier program', () => {
        expect(m68kLookAhead(M68000, '68020')).toEqual(M68020)
        expect(m68kLookAhead(M68000, '68010')).toEqual(M68010)
        expect(m68kLookAhead(M68000_BIT, '68010')).toEqual({ processor: '68010', bitFields: true })
        //a 68020 program's bit fields are the 68020's own, which an earlier processor has not
        expect(m68kLookAhead(M68020, '68000')).toEqual(M68000)
    })
})

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
    Uri: {
        from: (parts: { scheme: string; authority: string; path: string }) => parts
    },
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

let unregister = () => {}
afterEach(() => unregister())

/**
 * The URI of a model of a Project whose program starts with `header` and has `line` after it, and
 * whose live analysis the session holds; with no header, none, as a Playground's model has none.
 */
function projectModelUri(line: string, header?: string): unknown {
    const sessionId = 'dialect-test'
    let uri: unknown
    if (header !== undefined) {
        //the program as typed so far, the half-written line and an error with it
        const sources = normalizeBuildInput({
            entry: 'main.x68',
            files: { 'main.x68': { encoding: 'plain', content: `${header}\n${line}\n` } }
        })
        const snapshot = analyzeM68kProject(sources, sessionId, 1)
        unregister = registerLanguageSession({
            sessionId,
            sources,
            snapshot,
            sourcesFor: () => sources
        })
        uri = projectSourceUri(monacoStub, { sessionId, sourceKind: 'live', path: 'main.x68' })
    }
    return uri
}

/** What completion offers at the end of `line`, in a model as `projectModelUri` makes it. */
async function completions(line: string, header?: string) {
    const uri = projectModelUri(line, header)
    const position = { lineNumber: 1, column: line.length + 1 }
    const model = {
        uri,
        getValueInRange: () => line,
        getWordUntilPosition: () => {
            const word = /[A-Za-z0-9_]+$/.exec(line)?.[0] ?? ''
            return { word, startColumn: position.column - word.length, endColumn: position.column }
        }
    }
    const result = await createM68KCompletion(monacoStub).provideCompletionItems(
        model as never,
        position as never,
        {} as never,
        {} as never
    )
    return (result?.suggestions ?? []).map((suggestion) => suggestion.label as string)
}

describe('completion in a program whose processor is known', () => {
    it('leaves out the instructions a later processor brought', async () => {
        const for68000 = await completions('    ext', '')
        expect(for68000).toContain('ext')
        expect(for68000).not.toContain('extb')
        expect(await completions('    movec', '')).not.toContain('movec')
        expect(await completions('    bf', '')).toEqual([])
        expect(await completions('    bf', '    opt bit')).toContain('bfextu')
        const for68010 = await completions('    m', '    opt p=68010')
        expect(for68010).toContain('movec')
        expect(for68010).toContain('moves')
        expect(await completions('    ext', '    opt p=68010')).not.toContain('extb')
        expect(await completions('    ext', '    opt p=68020')).toContain('extb')
    })

    it('leaves out the sizes and the modes only a later processor’s forms take', async () => {
        expect(await completions('    chk.', '')).toEqual(['w'])
        expect(await completions('    chk.', '    opt p=68020')).toEqual(['l', 'w'])
        expect(await completions('    link.', '')).toEqual([])
        //`move ccr,<ea>` is the 68010's; `move <ea>,ccr` the 68000's
        expect(await completions('    move ', '')).not.toContain('ccr')
        expect(await completions('    move d0,', '')).toContain('ccr')
        expect(await completions('    move ', '    opt p=68010')).toContain('ccr')
        //the 68020's indexed modes, a register pair and its control registers
        const lea = await completions('    lea ', '')
        expect(lea).toContain('d(An,Xn)')
        expect(lea).not.toContain('(bd,An,Xn*k)')
        expect(await completions('    lea ', '    opt p=68020')).toContain('(bd,An,Xn*k)')
        expect(await completions('    muls.l d0,', '    opt bit')).not.toContain('Dx:Dy')
        expect(await completions('    muls.l d0,', '    opt p=68020')).toContain('Dx:Dy')
        const movec = await completions('    movec d0,', '    opt p=68010')
        expect(movec).toEqual(expect.arrayContaining(['vbr', 'sfc', 'dfc']))
        expect(movec).not.toContain('msp')
        expect(await completions('    movec d0,', '    opt p=68020')).toContain('msp')
    })

    it('gives a bit field under opt bit the 68000’s modes only', async () => {
        const bitField = await completions('    bfextu ', '    opt bit')
        expect(bitField).toContain('(An){offset:width}')
        expect(bitField).not.toContain('(bd,An,Xn*k){offset:width}')
    })

    it('follows the processor the source chose while the code has an error', async () => {
        //the half-written line is an error, and the processor is still the one chosen
        expect(await completions('    ext', '    opt p=68020\n    move.l #1')).toContain('extb')
    })

    it('offers everything where no analysis knows the processor', async () => {
        expect(await completions('    ext')).toContain('extb')
        expect(await completions('    move ')).toContain('ccr')
        expect(await completions('    lea ')).toContain('(bd,An,Xn*k)')
    })
})

/** The rows of the forms the hover of `line`'s operation lists, in a model as `projectModelUri` makes it. */
async function hoverRows(line: string, header?: string) {
    const hover = await createM68kHoverProvider(monacoStub).provideHover(
        { uri: projectModelUri(line, header), getLineContent: () => line } as never,
        { lineNumber: 1, column: 6 } as never,
        {} as never
    )
    return (hover?.contents ?? []).map((content) => content.value).join('\n')
}

describe('hovers in a program whose processor is known', () => {
    it('leave out the forms and the privilege a later processor brought', async () => {
        const for68000 = await hoverRows('    move.w sr,d0', '')
        expect(for68000).toContain('| `move sr, <ea>` | Size .w |')
        expect(for68000).not.toContain('Privileged on the 68010')
        expect(for68000).not.toContain('`move ccr, <ea>`')
        const for68010 = await hoverRows('    move.w sr,d0', '    opt p=68010')
        expect(for68010).toContain(
            '| `move sr, <ea>` | Size .w · Privileged on the 68010 and 68020 |'
        )
    })

    it('keep the whole of an instruction the program cannot write, which says what it needs', async () => {
        expect(await hoverRows('    extb.l d0', '')).toContain('68020 only')
    })

    it('keep everything where no analysis knows the processor', async () => {
        expect(await hoverRows('    move.w sr,d0')).toContain('Privileged on the 68010 and 68020')
    })
})
