/**
 * What a Pseudocode's hover says about its numbers, Ghidra's own words and the Listing's invented
 * names, and the names a double-click follows there
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decisions 5
 * to 7), on crackme-stripped's real Listing and Pseudocode in Node.
 */
import { readFileSync } from 'node:fs'
import { loadDecompiler, type DecompiledLine, type Decompiler } from '@specy/decompiler'
import glibc from '@specy/decompiler/prototypes/glibc'
import type monaco from 'monaco-editor'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import type { Listing } from '#lib/listing/listing.ts'
import { plannedLoadBase } from '#lib/listing/listingPaths.ts'
import { programImage } from '#lib/pseudocode/programImage.ts'
import { PSEUDOCODE_LINK } from '#lib/pseudocode/pseudocodeHovers.ts'
import { numberMarkdown } from './assemblyInsights'
import { followableNameAt } from './followNames'
import type { MonacoType } from './Monaco'
import { setModelPseudocode } from './pseudocodeModels'
import { createPseudocodeProviders } from './pseudocodeProviders'

/** The document lines before the decompiler's: the header and a blank line. */
const FIRST = 2

class Range {
    constructor(
        readonly startLineNumber: number,
        readonly startColumn: number,
        readonly endLineNumber: number,
        readonly endColumn: number
    ) {}
}
const monacoStub = { Range, Uri: { from: (parts: object) => parts } } as unknown as MonacoType

let decompiler: Decompiler
let listing: Listing
/** Each function's Pseudocode lines, by the function's name, at link-time addresses. */
const decompiled = new Map<string, DecompiledLine[]>()

beforeAll(async () => {
    const decoder = await loadDecoder()
    decompiler = await loadDecompiler({ architecture: 'x86-64' })
    const bytes = new Uint8Array(
        readFileSync(
            new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme-stripped', import.meta.url)
        )
    )
    const analysis = decoder.analyze(bytes)
    listing = generateListing(decoder, {
        bytes,
        name: 'crackme-stripped',
        base: plannedLoadBase(analysis.pie),
        version: 'v1'
    })
    const program = decompiler.openProgram(
        programImage({ bytes, listing, analysis, prototypes: glibc })
    )
    for (const name of ['main', 'FUN_peachy_anteater', 'FUN_winged_scarab', '_start']) {
        const fn = listing.functions.find((candidate) => candidate.name === name)!
        const result = program.decompile(fn.address + listing.base)
        if ('error' in result) throw new Error(result.error)
        decompiled.set(
            name,
            result.lines.map((line) => ({
                ...line,
                tokens: line.tokens.map((token) => ({
                    ...token,
                    ...(token.target === undefined ? {} : { target: token.target - listing.base })
                }))
            }))
        )
    }
    program.dispose()
})

afterAll(() => decompiler.dispose())

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

/** A model of a function's Pseudocode, as the editor registers one. */
function pseudocodeModel(name: string) {
    const uri = `pseudocode-${name}`
    disposers.push(
        setModelPseudocode(uri, {
            lines: decompiled.get(name)!,
            firstLine: FIRST,
            listing,
            listingIdentity: {
                sessionId: 'session',
                sourceKind: 'live',
                path: 'crackme-stripped',
                view: 'listing'
            }
        })
    )
    return { uri: { toString: () => uri } } as unknown as monaco.editor.ITextModel
}

/** The position `offset` characters into the first `text` of a function's Pseudocode. */
function at(name: string, text: string, offset = 1): monaco.Position {
    const lines = decompiled.get(name)!
    const line = lines.findIndex((candidate) => candidate.text.includes(text))
    expect(line, text).toBeGreaterThanOrEqual(0)
    const column = lines[line].text.indexOf(text) + offset
    return { lineNumber: line + FIRST + 1, column: column + 1 } as monaco.Position
}

/** What the hover says at the first `text` of a function's Pseudocode. */
function hover(name: string, text: string, offset = 1): string[] {
    const result = createPseudocodeProviders(monacoStub).hover.provideHover(
        pseudocodeModel(name),
        at(name, text, offset),
        {} as never
    ) as monaco.languages.Hover | null
    return result?.contents.map((content) => content.value) ?? []
}

describe('the hover of a Pseudocode', () => {
    it("gives a number the Listing's card", () => {
        expect(hover('main', '0x80')).toEqual([numberMarkdown(0x80n, 64)])
        expect(hover('main', '0x80')[0]).toContain('Decimal: `128`')
    })

    it("explains Ghidra's words, with the Pseudocode's section", () => {
        const [stack] = hover('main', 'acStack_98')
        expect(stack).toContain(
            '**acStack_98**: a variable the decompiler found in the stack frame'
        )
        expect(stack).toContain('array of char')
        expect(stack.endsWith(PSEUDOCODE_LINK)).toBe(true)
        expect(hover('main', 'in_FS_OFFSET')[0]).toContain('stack canary')
        expect(hover('main', 'undefined8')[0]).toContain('8 bytes whose type')
        expect(hover('_start', 'unaff_retaddr')[0]).toContain('return address')
        //punctuation has nothing to say
        expect(hover('main', 'acStack_98,0x80', 10)).toEqual([])
    })

    it('says a name is invented, as the Listing does', () => {
        const name = listing.labels.find(
            (label) => label.origin === 'invented' && label.kind === 'function'
        )
        expect(name).toBeDefined()
        const call = hover('FUN_peachy_anteater', 'FUN_moonlit_vole')
        expect(call[0]).toMatch(/^`FUN_moonlit_vole` at `0x[\da-f]+` in the Listing/)
        expect(call[1]).toBe(
            `An invented name: nothing in the file names this function, so the Listing made one up from its address.\n\n${PSEUDOCODE_LINK}`
        )
        //a name the decompiler reads more bytes of than its label covers is still the Listing's
        const [widened] = hover('FUN_winged_scarab', '_DAT_epic_cicada')
        expect(widened).toMatch(/^`DAT_epic_cicada` at `0x[\da-f]+` in the Listing, read here/)
        expect(widened).toContain('An invented name: nothing in the file names this data')
        expect(widened.endsWith(PSEUDOCODE_LINK)).toBe(true)
    })
})

describe('the names a double-click follows in a Pseudocode', () => {
    it('follows a function or data name to its line in the Listing, nothing else', () => {
        const model = pseudocodeModel('FUN_peachy_anteater')
        const rows = listing.text.split('\n')
        const call = followableNameAt(
            monacoStub,
            model,
            at('FUN_peachy_anteater', 'FUN_moonlit_vole')
        )
        expect(call?.resource).toMatchObject({
            path: '/live/crackme-stripped',
            fragment: 'listing'
        })
        expect(rows[call!.line - 1]).toBe('FUN_moonlit_vole:')
        const position = at('FUN_peachy_anteater', 'FUN_moonlit_vole', 0)
        expect(call?.range).toMatchObject({
            startLineNumber: position.lineNumber,
            startColumn: position.column,
            endColumn: position.column + 'FUN_moonlit_vole'.length
        })
        const data = followableNameAt(
            monacoStub,
            model,
            at('FUN_peachy_anteater', 'DAT_perky_tapir')
        )
        expect(rows[data!.line - 1]).toMatch(/^DAT_perky_tapir:/)
        //a constant or a local is no name of the Listing's
        expect(
            followableNameAt(monacoStub, pseudocodeModel('main'), at('main', 'iVar1'))
        ).toBeUndefined()
        expect(
            followableNameAt(monacoStub, pseudocodeModel('main'), at('main', '0x80'))
        ).toBeUndefined()
    })
})
