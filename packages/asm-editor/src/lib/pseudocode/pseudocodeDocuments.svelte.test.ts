/**
 * The Pseudocode documents with a File's Annotations
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
 * 22): a function's document is made again when its own locals or comments change, and keeps its
 * variables; the Search panel's cache decompiles through the same client.
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { loadDecoder, type ListingDecoder } from '../listing/decoder'
import { generateListing } from '../listing/generateListing'
import type { Listing } from '../listing/listing'
import { ListingDocument } from '../listing/listingDocuments.svelte'
import { plannedLoadBase } from '../listing/listingPaths'
import { encodeBase64, type Annotations, type ProjectFile } from '../projectFiles'
import { inThreadWorker } from './inThreadWorker'
import { PseudocodeClient } from './pseudocodeClient'
import { PseudocodeDocuments, type PseudocodeDocument } from './pseudocodeDocuments.svelte'

const bytes = new Uint8Array(
    readFileSync(new URL('../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url))
)
const MAIN = 0x11e9
const START = 0x1100

let decoder: ListingDecoder
let listing: Listing
let listingDocument: ListingDocument

beforeAll(async () => {
    decoder = await loadDecoder()
    listing = generateListing(decoder, {
        bytes,
        name: 'crackme',
        base: plannedLoadBase(decoder.analyze(bytes).pie),
        version: 'v1'
    })
    listingDocument = new ListingDocument('crackme', listing.base, bytes, async () => listing)
    await listingDocument.ready
})

const documents: PseudocodeDocuments[] = []
afterEach(() => documents.splice(0).forEach((made) => made.dispose()))

const fileWith = (annotations?: Annotations): ProjectFile => ({
    encoding: 'base64',
    content: encodeBase64(bytes),
    ...(annotations ? { annotations } : {})
})

async function ready(document: PseudocodeDocument | undefined) {
    await vi.waitFor(() => expect(document?.status).toBe('ready'))
    return document!
}

describe('the Pseudocode documents with Annotations', () => {
    it("make a function's document again when its own locals or comments change", async () => {
        const clients: PseudocodeClient[] = []
        const made = new PseudocodeDocuments(() => {
            const client = new PseudocodeClient(inThreadWorker())
            clients.push(client)
            return client
        })
        documents.push(made)
        const main = listing.functions.find((fn) => fn.address === MAIN)!
        const plain = await ready(made.open('crackme', fileWith(), listingDocument, main))
        expect(plain.text).toContain('acStack_98')
        expect(plain.variables.map((variable) => variable.id)).toContain('stack:-0x98')

        //another function's comment leaves main's document as it is
        const elsewhere = fileWith({ comments: { [`0x${START.toString(16)}`]: 'the entry' } })
        expect(made.open('crackme', elsewhere, listingDocument, main)).toBe(plain)

        const named = fileWith({
            locals: { [`0x${MAIN.toString(16)}`]: { 'stack:-0x98': 'password' } },
            functionComments: { [`0x${MAIN.toString(16)}`]: 'Reads the password' }
        })
        const renamed = await ready(made.open('crackme', named, listingDocument, main))
        expect(renamed).not.toBe(plain)
        expect(renamed.annotations).toEqual({
            locals: [{ id: 'stack:-0x98', name: 'password' }],
            comments: [],
            functionComment: 'Reads the password'
        })
        //the header, then the decompiler's text with the function comment above the declaration
        expect(renamed.text.split('\n').slice(2, 5)).toEqual([
            '/* Reads the password */',
            '',
            'undefined8 main(void)'
        ])
        expect(renamed.text).toContain('fgets(password,0x80,stdin)')
        expect(renamed.variables.find((variable) => variable.id === 'stack:-0x98')?.name).toBe(
            'password'
        )
        //the Annotations given, rather than the File's, when a caller has others
        expect(made.open('crackme', named, listingDocument, main, {})).toBe(plain)
        expect(made.open('crackme', fileWith(), listingDocument, main, named)).toBe(renamed)

        //the search decompiles through the same client
        const done = new Promise<void>((resolve) =>
            made.search.subscribe((change) => {
                if (change.type === 'progress' && !change.progress.running) resolve()
            })
        )
        made.search.start('crackme', named, listing)
        await done
        expect(clients).toHaveLength(1)
        expect(
            made.search.entries('crackme').find((entry) => entry.address === MAIN)?.text
        ).toContain('fgets(password,0x80,stdin)')
    })
})
