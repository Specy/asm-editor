/**
 * An editor kept on the same addresses when its Listing is made again with a person's comments
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 22), over crackme's real Listings.
 */
import { readFileSync } from 'node:fs'
import type monaco from 'monaco-editor'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import type { Listing, ListingAnnotations } from '#lib/listing/listing.ts'
import {
    moveListingViewState,
    movedListingLine,
    noteViewStateListing,
    viewStateFor
} from './listingViewState'

const bytes = new Uint8Array(
    readFileSync(new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url))
)
const MAIN = 0x11e9

let decoder: ListingDecoder
let plain: Listing
beforeAll(async () => {
    decoder = await loadDecoder()
    plain = listingWith()
})

function listingWith(annotations?: ListingAnnotations): Listing {
    return generateListing(decoder, {
        bytes,
        name: 'crackme',
        base: 0x555555554000,
        version: 'v1',
        ...(annotations ? { annotations } : {})
    })
}

const lineOf = (listing: Listing, text: string) =>
    listing.text.split('\n').findIndex((row) => row.split(';')[0].trim() === text)

describe('a line of a Listing made again', () => {
    it('is the line of the same address, below the comment lines added above it', () => {
        const call = lineOf(plain, 'call strcmp@plt')
        const commented = listingWith({
            comments: new Map([[plain.lines.addresses[call], 'one\ntwo']]),
            functionComments: new Map([[MAIN, 'checks the password']])
        })
        expect(movedListingLine(plain, commented, call)).toBe(lineOf(commented, 'call strcmp@plt'))
        expect(movedListingLine(plain, commented, call)).toBe(call + 3)
        //a label's line, and an instruction before the comment, move by the function comment only
        const main = lineOf(plain, 'main:')
        expect(movedListingLine(plain, commented, main)).toBe(main + 1)
        expect(movedListingLine(plain, commented, main + 1)).toBe(main + 2)
        //a blank line before a function moves with the line after it
        expect(movedListingLine(plain, commented, main - 1)).toBe(main)
        //and back again: a comment line that goes moves to the line it annotated
        expect(movedListingLine(commented, plain, call + 1)).toBe(call)
        //a line of the same Listing stays
        expect(movedListingLine(plain, plain, call)).toBe(call)
    })

    it('moves a view state’s cursors, selections and first visible line', () => {
        const call = lineOf(plain, 'call strcmp@plt')
        const commented = listingWith({
            comments: new Map([[plain.lines.addresses[call], 'one\ntwo']])
        })
        const state = {
            cursorState: [
                {
                    inSelectionMode: true,
                    selectionStart: { lineNumber: call - 1, column: 3 },
                    position: { lineNumber: call + 1, column: 9 }
                }
            ],
            viewState: {
                scrollLeft: 4,
                firstPosition: { lineNumber: call - 9, column: 1 },
                firstPositionDeltaTop: -6
            },
            contributionsState: {}
        } as monaco.editor.ICodeEditorViewState
        const moved = moveListingViewState(state, plain, commented)
        expect(moved.cursorState[0]).toEqual({
            inSelectionMode: true,
            selectionStart: { lineNumber: call - 1, column: 3 },
            position: { lineNumber: call + 3, column: 9 }
        })
        expect(moved.viewState).toEqual({
            scrollLeft: 4,
            firstPosition: { lineNumber: call - 9, column: 1 },
            firstPositionDeltaTop: -6
        })
        //a state saved over a Listing is moved when restored over another, and kept over its own
        noteViewStateListing(state, plain)
        expect(viewStateFor(state, commented)).toEqual(moved)
        expect(viewStateFor(state, plain)).toBe(state)
        expect(viewStateFor(state, undefined)).toBe(state)
    })
})
