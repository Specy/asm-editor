/**
 * Navigation in a Listing (go to definition, references, hovers, symbols and folds) on crackme's
 * Listing, through the Monaco providers the x86 language registers.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import type { MonacoType } from './Monaco'
import { loadDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { listingTokenAt } from '#lib/listing/listingNavigation.ts'
import { PIE_LOAD_BASE } from '#lib/listing/listingPaths.ts'
import {
    listingLineNumbers,
    listingLineNumberWidth,
    sharedAddressDigits,
    modelListing,
    setModelListing
} from './listingModels'
import { createListingProviders, withoutListings } from './listingProviders'

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
    languages: { SymbolKind: { Function: 11 }, FoldingRangeKind: { Region: 'region' } }
} as unknown as MonacoType

const URI = 'asm-editor://session/build-1/crackme'
const crackme = new Uint8Array(
    readFileSync(new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url))
)

let listing: Listing
let lines: string[]

beforeAll(async () => {
    listing = generateListing(await loadDecoder(), {
        bytes: crackme,
        name: 'crackme',
        base: PIE_LOAD_BASE,
        version: 'v1'
    })
    lines = listing.text.split('\n')
    setModelListing(URI, { listing, bytes: crackme, library: false })
})

function model(uri = URI) {
    return {
        uri: { toString: () => uri },
        getLineContent: (lineNumber: number) => lines[lineNumber - 1],
        getLineMaxColumn: (lineNumber: number) => lines[lineNumber - 1].length + 1
    } as unknown as monaco.editor.ITextModel
}

/** The 0-based line whose trimmed text is `text`, the first one at or after `from`. */
function lineOf(text: string, from = 0): number {
    const line = lines.findIndex((candidate, i) => i >= from && candidate.trim() === text)
    expect(line, text).toBeGreaterThanOrEqual(0)
    return line
}

/** The position of `token` on a 0-based line. */
function at(line: number, token: string): monaco.Position {
    const column = lines[line].indexOf(token)
    expect(column, `${token} on line ${line}`).toBeGreaterThanOrEqual(0)
    return { lineNumber: line + 1, column: column + 2 } as monaco.Position
}

const providers = () => createListingProviders(monacoStub)
const token = {} as monaco.CancellationToken

function definitionLine(position: monaco.Position): number | undefined {
    const result = providers().definition.provideDefinition(
        model(),
        position,
        token
    ) as monaco.languages.Location | null
    return result ? result.range.startLineNumber - 1 : undefined
}

describe('go to definition in a Listing', () => {
    it('goes to a PLT stub, a string and a function from an operand', () => {
        const main = lineOf('main:')
        const call = lineOf('call strcmp@plt', main)
        expect(definitionLine(at(call, 'strcmp@plt'))).toBe(lineOf('strcmp@plt:'))
        const string = lineOf('lea rdx, [rel s_hunter2]            ; "hunter2"', main)
        expect(definitionLine(at(string, 's_hunter2'))).toBe(
            lines.findIndex((line) => line.startsWith('s_hunter2:'))
        )
        expect(definitionLine(at(lineOf('jmp register_tm_clones'), 'register_tm_clones'))).toBe(
            lineOf('register_tm_clones:')
        )
    })

    it("goes to a bare .LAB_n in the function it is written in, not another's", () => {
        const main = lineOf('main:')
        const jump = lineOf('jne .LAB_1', main)
        expect(definitionLine(at(jump, '.LAB_1'))).toBe(lineOf('.LAB_1:', main))
        const other = lineOf('je .LAB_1', lineOf('deregister_tm_clones:'))
        expect(definitionLine(at(other, '.LAB_1'))).toBe(
            lineOf('.LAB_1:', lineOf('deregister_tm_clones:'))
        )
    })

    it('reads FUN_x.LAB_n, label+0xN and a run-time address', () => {
        const registered = modelListing(URI)!
        const main = lineOf('main:')
        const block = registered.index.label('main.LAB_3', 0)
        expect(block?.line).toBe(lineOf('.LAB_3:', main))
        const offset = listingTokenAt('    lea rdi, [rel s_hunter2+0x2]', 22)
        expect(offset?.text).toBe('s_hunter2')
        const callLine = lineOf('call strcmp@plt', main)
        const address = `0x${(listing.lines.addresses[callLine] + PIE_LOAD_BASE).toString(16)}`
        expect(registered.index.addressLine(address)).toBe(callLine)
        // A word inside a string is text, not a name.
        expect(listingTokenAt('s_hunter2: db "hunter2", 0', 16)).toBeUndefined()
    })
})

describe('references in a Listing', () => {
    it('lists every line naming a label, and a block only inside its own function', () => {
        const main = lineOf('main:')
        const references = providers().references.provideReferences(
            model(),
            at(lineOf('call strcmp@plt', main), 'strcmp@plt'),
            { includeDeclaration: true },
            token
        ) as monaco.languages.Location[]
        expect(references.map((reference) => reference.range.startLineNumber - 1)).toEqual([
            lineOf('strcmp@plt:'),
            lineOf('call strcmp@plt', main)
        ])

        const blocks = providers().references.provideReferences(
            model(),
            at(lineOf('jne .LAB_1', main), '.LAB_1'),
            { includeDeclaration: false },
            token
        ) as monaco.languages.Location[]
        expect(blocks.map((reference) => reference.range.startLineNumber - 1)).toEqual([
            lineOf('jne .LAB_1', main)
        ])
    })
})

describe('hovers in a Listing', () => {
    it("shows an instruction's run-time address and bytes, and a label's origin", () => {
        const main = lineOf('main:')
        const call = lineOf('call strcmp@plt', main)
        const hover = providers().hover.provideHover(model(), at(call, 'strcmp@plt'), token)
        const text = (hover as monaco.languages.Hover).contents.map((part) => part.value).join('\n')
        const address = listing.lines.addresses[call] + PIE_LOAD_BASE
        expect(text).toContain(
            `**strcmp@plt** at \`0x${(listing.lines.addresses[lineOf('strcmp@plt:')] + PIE_LOAD_BASE).toString(16)}\``
        )
        expect(text).toContain('A PLT stub')
        expect(text).toContain(`Address \`0x${address.toString(16)}\` · Bytes \`e8 `)
        // A line with no bytes, a label's, shows only the label.
        const label = providers().hover.provideHover(model(), at(main, 'main'), token)
        expect((label as monaco.languages.Hover).contents).toHaveLength(1)
        expect(providers().hover.provideHover(model(), at(0, 'crackme'), token)).toBeNull()
    })

    it('says when a line was patched, and what the Executable has there', () => {
        const check = lineOf('jne .LAB_2', lineOf('call strcmp@plt'))
        const patchedUri = 'asm-editor://session/build-2/crackme'
        const offset = listing.lines.offsets[check]
        const original = crackme.slice(offset, offset + 2)
        const dispose = setModelListing(patchedUri, {
            listing,
            bytes: crackme,
            library: false,
            patches: new Map([
                [
                    check,
                    {
                        text: '    je .LAB_2',
                        instruction: 'je .LAB_2',
                        bytes: Uint8Array.of(0x74, original[1]),
                        original,
                        originalText: 'jne .LAB_2'
                    }
                ]
            ])
        })
        const hover = providers().hover.provideHover(model(patchedUri), at(check, 'jne'), token)
        const text = (hover as monaco.languages.Hover).contents.map((part) => part.value).join('\n')
        const hex = (byte: number) => byte.toString(16).padStart(2, '0')
        expect(text).toContain(`Bytes \`74 ${hex(original[1])}\``)
        expect(text).toContain(
            `Patched in this Debug session. The Executable has \`75 ${hex(original[1])}\` here, \`jne .LAB_2\`; Undo takes the patch back.`
        )
        dispose()
    })

    it('answers nothing for a model that is no Listing', () => {
        const other = model('asm-editor://session/live/main.asm')
        expect(providers().hover.provideHover(other, at(0, 'crackme'), token)).toBeNull()
        expect(providers().definition.provideDefinition(other, at(0, 'crackme'), token)).toBeNull()
    })
})

describe('the Listing in the editor', () => {
    it("prints each line's run-time address in the gutter, and nothing on other lines", () => {
        const numbers = listingLineNumbers(listing)
        const call = lineOf('call strcmp@plt', lineOf('main:'))
        expect(numbers(call + 1)).toBe((listing.lines.addresses[call] + PIE_LOAD_BASE).toString(16))
        expect(numbers(1)).toBe('')
        expect(numbers(lines.length)).toBe('')
        expect(listingLineNumberWidth(listing)).toBe(12)
    })

    it('prints the low eight digits on a phone, which every address of the Listing shares the rest of', () => {
        const short = listingLineNumbers(listing, true)
        const call = lineOf('call strcmp@plt', lineOf('main:'))
        const full = (listing.lines.addresses[call] + PIE_LOAD_BASE).toString(16)
        expect(sharedAddressDigits(listing)).toBe(4)
        expect(short(call + 1)).toBe(full.slice(4))
        expect(short(1)).toBe('')
        expect(listingLineNumberWidth(listing, true)).toBe(8)
        //addresses that fit in eight digits, or that differ in the high ones, stay whole
        const fixed = { ...listing, base: 0 }
        expect(sharedAddressDigits(fixed)).toBe(0)
        expect(listingLineNumbers(fixed, true)(call + 1)).toBe(
            listing.lines.addresses[call].toString(16)
        )
        const spread = { ...listing, base: 0xfffff000 }
        expect(sharedAddressDigits(spread)).toBe(0)
    })

    it('outlines functions and folds functions and sections', () => {
        const symbols = providers().documentSymbols.provideDocumentSymbols(
            model(),
            token
        ) as monaco.languages.DocumentSymbol[]
        const main = symbols.find((symbol) => symbol.name === 'main')!
        expect(main.range.startLineNumber - 1).toBe(lineOf('main:'))
        const folds = providers().folding.provideFoldingRanges(
            model(),
            {},
            token
        ) as monaco.languages.FoldingRange[]
        expect(folds).toContainEqual({
            start: lineOf('main:') + 1,
            end: lineOf('ret', lineOf('main:')) + 1
        })
        expect(folds.filter((fold) => lines[fold.start - 1].startsWith('section'))).not.toEqual([])
        expect(listing.lines.kinds[lineOf('section .text')]).toBe(LINE_KIND.section)
    })

    it('keeps the providers that read Project Files away from a Listing', () => {
        const provideDefinition = vi.fn((_model: monaco.editor.ITextModel) => 'project')
        const wrapped = withoutListings(
            { provideDefinition, displayName: 'project' },
            'provideDefinition'
        )
        expect(wrapped.provideDefinition(model('asm-editor://session/live/main.asm'))).toBe(
            'project'
        )
        expect(wrapped.provideDefinition(model())).toBeNull()
        expect(provideDefinition).toHaveBeenCalledTimes(1)
        expect(wrapped.displayName).toBe('project')
    })
})
