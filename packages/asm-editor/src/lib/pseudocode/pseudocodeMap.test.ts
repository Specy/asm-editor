/**
 * The map between a function's Pseudocode and its Listing (the plan's decision 14), from
 * crackme's real Listing and the real decompiler's lines in Node.
 */
import { readFileSync } from 'node:fs'
import { loadDecompiler, type DecompiledLine, type Decompiler } from '@specy/decompiler'
import glibc from '@specy/decompiler/prototypes/glibc'
import { afterAll, beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder } from '../listing/decoder'
import { generateListing } from '../listing/generateListing'
import { LINE_KIND, lineOfAddress, type Listing, type ListingFunction } from '../listing/listing'
import { plannedLoadBase } from '../listing/listingPaths'
import { programImage } from './programImage'
import {
    colorPseudocodeMap,
    defaultPseudocodeFunction,
    functionAt,
    listingLineOfTarget,
    listingLinesOfLocations,
    listingNameOfTarget,
    pseudocodeBreakpointAddresses,
    pseudocodeBreakpointLines,
    pseudocodeBreakpointsOn,
    pseudocodeLineOfAddress,
    pseudocodeLinesOf,
    pseudocodeLocationsOf,
    pseudocodeMap,
    pseudocodeTargetAt,
    type PseudocodeMap
} from './pseudocodeMap'

/** The document lines before the decompiler's: the header and a blank line. */
const FIRST = 2

let decompiler: Decompiler
let listing: Listing
let main: ListingFunction
let lines: DecompiledLine[]
let map: PseudocodeMap

/** The document line whose text holds `text`. */
const row = (text: string) => lines.findIndex((line) => line.text.includes(text)) + FIRST
/** The Listing line whose text is `text`, inside `main`. */
const listingRow = (text: string) => {
    const rows = listing.text.split('\n')
    return rows.findIndex((line, index) => index >= main.line && line.trim() === text)
}

beforeAll(async () => {
    const decoder = await loadDecoder()
    decompiler = await loadDecompiler({ architecture: 'x86-64' })
    const bytes = new Uint8Array(
        readFileSync(
            new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url)
        )
    )
    const analysis = decoder.analyze(bytes)
    listing = generateListing(decoder, {
        bytes,
        name: 'crackme',
        base: plannedLoadBase(analysis.pie),
        version: 'v1'
    })
    const program = decompiler.openProgram(
        programImage({ bytes, listing, analysis, prototypes: glibc })
    )
    main = listing.functions.find((fn) => fn.name === 'main')!
    const result = program.decompile(main.address + listing.base)
    if ('error' in result) throw new Error(result.error)
    // The image is at the Listing's addresses; the map reads link-time ones, as the client gives.
    lines = result.lines.map((line) => ({
        ...line,
        addresses: line.addresses.map((address) => address - listing.base),
        tokens: line.tokens.map((token) => ({
            ...token,
            ...(token.target === undefined ? {} : { target: token.target - listing.base })
        }))
    }))
    map = pseudocodeMap(listing, main, lines, FIRST)
    program.dispose()
})

afterAll(() => decompiler.dispose())

describe('the Pseudocode map', () => {
    it("covers the function's Listing lines and no others", () => {
        expect([map.listingStart, map.listingEnd]).toEqual([main.line, main.endLine])
        expect(map.pseudocodeLines).toHaveLength(main.endLine - main.line)
        //the header and the declarations have no instructions
        expect(map.listingLines.slice(0, row('lStack_10 ='))).toSatisfy((mapped: number[][]) =>
            mapped.every((lines) => !lines.length)
        )
        expect(map.addresses).toHaveLength(FIRST + lines.length)
    })

    it('links the strcmp line and its call both ways', () => {
        const strcmp = row('strcmp(acStack_98,"hunter2")')
        const call = listingRow('call strcmp@plt')
        expect(map.listingLines[strcmp]).toContain(call)
        expect(map.listingLines[strcmp]).toEqual(
            map.addresses[strcmp].map((address) => lineOfAddress(listing, address))
        )
        expect(pseudocodeLinesOf(map, call)).toEqual([strcmp])
        //the call's address, and a byte inside it
        const address = listing.lines.addresses[call]
        expect(pseudocodeLineOfAddress(map, listing, address)).toBe(strcmp)
        expect(pseudocodeLineOfAddress(map, listing, address + 2)).toBe(strcmp)
        //main's endbr64, which the decompiler folds into nothing
        expect(pseudocodeLineOfAddress(map, listing, main.address)).toBe(-1)
        //a Listing line outside the function maps to nothing, without looking further
        expect(pseudocodeLinesOf(map, main.line - 1)).toEqual([])
        expect(pseudocodeLinesOf(map, -1)).toEqual([])
    })

    it('turns selections into the other side’s lines', () => {
        const strcmp = row('strcmp(acStack_98,"hunter2")')
        const branch = row('if (iVar1 == 0)')
        const call = listingRow('call strcmp@plt')
        expect(pseudocodeLocationsOf(map, 'crackme', [call, call])).toEqual([
            { path: 'crackme', line: strcmp }
        ])
        const both = listingLinesOfLocations(map, 'crackme', [
            { path: 'crackme', line: branch },
            { path: 'crackme', line: strcmp },
            { path: 'other', line: strcmp }
        ])
        expect(both).toEqual([...map.listingLines[strcmp], ...map.listingLines[branch]])
        //the `if` is the test and the jne after the call
        expect(
            map.listingLines[branch].map((line) => listing.text.split('\n')[line].trim())
        ).toEqual(['test eax, eax', 'jne .LAB_2'])
    })

    it("colours each mapped line, and its instructions with it, inside the function's lines", () => {
        const coloring = colorPseudocodeMap(map, 'crackme')
        const strcmp = row('strcmp(acStack_98,"hunter2")')
        const index = coloring.indices.get('crackme')!.get(strcmp)!
        expect(coloring.source.get('crackme')!.ranges).toContainEqual({
            startLine: strcmp,
            endLine: strcmp,
            colorIndex: index
        })
        const call = listingRow('call strcmp@plt')
        const range = coloring.assembly.ranges.find(
            (item) => item.startLine <= call && call <= item.endLine
        )
        expect(range?.colorIndex).toBe(index)
        for (const item of coloring.assembly.ranges) {
            expect(item.startLine).toBeGreaterThanOrEqual(main.line)
            expect(item.endLine).toBeLessThan(main.endLine)
        }
        //one colour for each line with instructions
        const mapped = map.listingLines.filter((lines) => lines.length).length
        expect(coloring.assembly.colors).toHaveLength(mapped)
    })
})

describe('Breakpoints on Pseudocode lines', () => {
    /** The link-time address of the instruction on a Listing line of `main`. */
    const addressOf = (text: string) => listing.lines.addresses[listingRow(text)]

    it("go on the first instruction of the `if`'s block, its test", () => {
        const branch = row('if (iVar1 == 0)')
        expect(pseudocodeBreakpointAddresses(map, listing, branch)).toEqual([
            addressOf('test eax, eax')
        ])
        //the call's line is the lea that loads its argument, then the call
        expect(pseudocodeBreakpointAddresses(map, listing, row('strcmp(acStack_98'))).toEqual([
            listing.lines.addresses[map.listingLines[row('strcmp(acStack_98')][0]]
        ])
        //a declaration, a brace and the header have no instructions
        expect(pseudocodeBreakpointAddresses(map, listing, row('int iVar1;'))).toEqual([])
        expect(pseudocodeBreakpointAddresses(map, listing, 0)).toEqual([])
        expect(pseudocodeBreakpointAddresses(map, listing, -1)).toEqual([])
    })

    it('go on each block of a line whose instructions are apart, as a C line’s do', () => {
        //made-up lines over main's instructions: the first line holds the test, the jne and the
        //call of puts after them, the second the instruction between, the first's jne too
        const test = listingRow('test eax, eax')
        expect([...listing.lines.kinds.slice(test, test + 4)]).toEqual(
            new Array(4).fill(LINE_KIND.instruction)
        )
        const at = (line: number) => listing.lines.addresses[line]
        const made = pseudocodeMap(
            listing,
            main,
            [
                { text: 'a', tokens: [], addresses: [at(test), at(test + 1), at(test + 3)] },
                { text: 'b', tokens: [], addresses: [at(test + 1), at(test + 2)] }
            ],
            FIRST
        )
        //the jne belongs to both, so it ends neither line's block; the instruction after it,
        //on the second line only, ends the first's
        expect(pseudocodeBreakpointAddresses(made, listing, FIRST)).toEqual([
            at(test),
            at(test + 3)
        ])
        expect(pseudocodeBreakpointAddresses(made, listing, FIRST + 1)).toEqual([at(test + 1)])
    })

    it('mark every line whose instructions carry one, wherever it was set', () => {
        const branch = row('if (iVar1 == 0)')
        const strcmp = row('strcmp(acStack_98')
        const jne = addressOf('jne .LAB_2')
        const call = addressOf('call strcmp@plt')
        //the jne, set in the Listing, marks the `if`; a byte inside the call, its line
        expect(pseudocodeBreakpointLines(map, listing, [jne, call + 1])).toEqual([strcmp, branch])
        expect(pseudocodeBreakpointsOn(map, listing, branch, [jne, call])).toEqual([jne])
        expect(pseudocodeBreakpointsOn(map, listing, row('int iVar1;'), [jne, call])).toEqual([])
        //main's endbr64 is on no line, nor is an address outside the Listing
        expect(pseudocodeBreakpointLines(map, listing, [main.address, 0])).toEqual([])
    })
})

describe('the names in a Pseudocode', () => {
    it('finds a name’s target under a column, and none for a local', () => {
        const strcmp = row('strcmp(acStack_98')
        const text = lines[strcmp - FIRST].text
        const at = text.indexOf('strcmp')
        const strcmpPlt = listing.functions.find((fn) => fn.name === 'strcmp@plt')!
        expect(pseudocodeTargetAt(lines, FIRST, strcmp, at)?.target).toBe(strcmpPlt.address)
        //just after the name, where a click past its last letter leaves the cursor
        expect(pseudocodeTargetAt(lines, FIRST, strcmp, at + 'strcmp'.length)?.target).toBe(
            strcmpPlt.address
        )
        expect(pseudocodeTargetAt(lines, FIRST, strcmp, text.indexOf('iVar1'))).toBeUndefined()
        expect(pseudocodeTargetAt(lines, FIRST, 0, 0)).toBeUndefined()
    })

    it("goes to a function's label, a string's or a global's, in the Listing", () => {
        const rows = listing.text.split('\n')
        const strcmpPlt = listing.functions.find((fn) => fn.name === 'strcmp@plt')!
        expect(rows[listingLineOfTarget(listing, strcmpPlt.address)]).toBe('strcmp@plt:')
        expect(listingNameOfTarget(listing, strcmpPlt.address)).toBe('strcmp@plt')
        const string = lines[row('"hunter2"') - FIRST].tokens.find(
            (token) => token.kind === 'constant' && token.target !== undefined
        )!
        expect(rows[listingLineOfTarget(listing, string.target!)]).toMatch(/^s_hunter2:/)
        //printed without its version, which the Listing's name for it keeps
        const stdin = lines[row('0x80,stdin)') - FIRST].tokens.find(
            (token) => token.target !== undefined && token.kind === 'variable'
        )!
        expect(listingNameOfTarget(listing, stdin.target!)).toBe('stdin@GLIBC_2.2.5')
        expect(rows[listingLineOfTarget(listing, stdin.target!)]).toMatch(/^stdin@GLIBC_2\.2\.5:/)
    })

    it('opens main when nothing chose a function', () => {
        expect(defaultPseudocodeFunction(listing)).toBe(main)
        expect(functionAt(listing, main.address)).toBe(main)
        expect(functionAt(listing, main.address + 1)).toBeUndefined()
    })
})
