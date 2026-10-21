/**
 * The Symbols panel's rows
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
 * 18), from crackme's real Listing.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder } from './decoder'
import { generateListing } from './generateListing'
import type { Listing } from './listing'
import {
    filterFunctions,
    filterStrings,
    listingFunctions,
    listingStrings,
    symbolAddress,
    symbolQuery
} from './listingSymbols'

const PIE_BASE = 0x555555554000
const bytes = new Uint8Array(
    readFileSync(new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url))
)
let listing: Listing
beforeAll(async () => {
    const decoder = await loadDecoder()
    listing = generateListing(decoder, { bytes, name: 'crackme', base: PIE_BASE, version: 'v1' })
})

/** The Listing's text on a 0-based line. */
const lineText = (line: number) => listing.text.split('\n')[line]

describe('the functions', () => {
    it("are the Listing's, in address order, at run-time addresses, with their size", () => {
        const functions = listingFunctions(listing)
        expect(functions).toHaveLength(listing.functions.length)
        expect(functions[0]).toMatchObject({ name: '_init', address: 0x555555555000, size: 27 })
        const main = functions.find((fn) => fn.name === 'main')!
        expect(symbolAddress(main.address)).toBe('0x5555555551e9')
        //up to `_fini`, the next function
        expect(main.size).toBe(210)
        expect(lineText(main.line)).toBe('main:')
        expect(functions.map((fn) => fn.address)).toEqual(
            functions.map((fn) => fn.address).sort((a, b) => a - b)
        )
    })

    it('are filtered by name, whatever its case, or by address, with or without 0x', () => {
        const functions = listingFunctions(listing)
        const names = (text: string) =>
            filterFunctions(functions, symbolQuery(text)).map((fn) => fn.name)
        expect(names('  MAIN ')).toEqual(['main'])
        expect(names('0x5555555551e9')).toEqual(['main'])
        expect(names('51e9')).toEqual(['main'])
        expect(names('strcmp')).toEqual(['strcmp@plt_resolver', 'strcmp@plt'])
        expect(names('@plt')).toHaveLength(13)
        //every address starts with it, as typing one does
        expect(names('0x')).toHaveLength(functions.length)
        expect(names('')).toHaveLength(functions.length)
        expect(names('password')).toEqual([])
    })
})

describe('the strings', () => {
    it('are read from the bytes, each once, at their label', () => {
        const strings = listingStrings(listing, bytes)
        expect(strings.map((string) => string.text)).toEqual([
            '/lib64/ld-linux-x86-64.so.2',
            'Enter password: ',
            '\n',
            'hunter2',
            'Correct!',
            'Wrong!'
        ])
        const hunter2 = strings[3]
        expect(symbolAddress(hunter2.address)).toBe('0x555555556017')
        expect(lineText(hunter2.line)).toBe('s_hunter2: db "hunter2", 0')
        expect(hunter2.endLine).toBe(hunter2.line + 1)
        //written as in a C string, as the Listing's comments write it
        expect(strings[2].escaped).toBe('\\n')
        expect(lineText(strings[2].line)).toMatch(/^DAT_\w+: db 10, 0$/)
    })

    it('are filtered by their text, as stored or escaped, or by address', () => {
        const strings = listingStrings(listing, bytes)
        const texts = (text: string) =>
            filterStrings(strings, symbolQuery(text)).map((string) => string.text)
        expect(texts('PASS')).toEqual(['Enter password: '])
        expect(texts('\\n')).toEqual(['\n'])
        expect(texts('6017')).toEqual(['hunter2'])
        expect(texts('main')).toEqual([])
    })

    it('end where the Listing ends them, else at a NUL', () => {
        const unbounded = listingStrings({ ...listing, holders: undefined }, bytes)
        expect(unbounded.map((string) => string.text)).toEqual(
            listingStrings(listing, bytes).map((string) => string.text)
        )
    })
})
