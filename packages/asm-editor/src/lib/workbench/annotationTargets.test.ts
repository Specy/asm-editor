/**
 * What Rename… and Comment… act on and refuse in an Executable's Listing and Pseudocode
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 6,
 * 7, 11 and 12), on crackme's and the decompiler package's FactCheck-like C++ program's real
 * Listings.
 */
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it } from 'vite-plus/test'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { LINE_KIND, lineOfAddress, type Listing } from '#lib/listing/listing.ts'
import {
    commentTarget,
    labelToRename,
    namedLocals,
    renameProblem,
    renameTarget,
    variableRenameProblem,
    variableRenameTarget
} from './annotationTargets'

//relative to the package, where the tests run
const crackmeBytes = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
const factcheckBytes = new Uint8Array(readFileSync('../decompiler/js/tests/fixtures/elf/factcheck'))
const BASE = 0x555555554000
const MAIN = 0x11e9

let decoder: ListingDecoder
let demangler: Demangler
beforeAll(async () => {
    decoder = await loadDecoder()
    demangler = await loadDemangler()
})

function crackme(names?: Map<number, string>): Listing {
    return generateListing(decoder, {
        bytes: crackmeBytes,
        name: 'crackme',
        base: BASE,
        version: 'v1',
        ...(names ? { annotations: { names } } : {})
    })
}

const labelNamed = (listing: Listing, name: string) =>
    listing.labels.find((label) => label.name === name)!

describe('Comment… on a label line', () => {
    it('is not offered on a name just past a region, which no line of bytes holds', () => {
        const listing = crackme()
        const lines = listing.text.split('\n')
        const uncovered = listing.labels.filter(
            (label) => lineOfAddress(listing, label.address) < 0
        )
        //`_end` closes the image
        expect(uncovered.map((label) => label.name)).toEqual(['_end'])
        for (const label of uncovered) {
            expect(listing.lines.kinds[label.line], label.name).toBe(LINE_KIND.label)
            expect(commentTarget(listing, label.line), lines[label.line]).toBeUndefined()
        }
        //a name of bytes takes one, a function's its function comment
        const main = labelNamed(listing, 'main')
        expect(commentTarget(listing, main.line)).toMatchObject({
            kind: 'function comment',
            address: MAIN
        })
        const string = labelNamed(listing, 's_hunter2')
        expect(commentTarget(listing, string.line)).toEqual({
            kind: 'comment',
            address: string.address
        })
    })
})

describe('Rename… on a label line', () => {
    it("renames the name operands use, also on an alias's line", () => {
        const listing = crackme()
        const lines = listing.text.split('\n')
        //`__data_start` is an alias of `data_start`, and `_edata` one of `stdin@GLIBC_2.2.5`
        for (const [line, used] of [
            ['__data_start:', 'data_start'],
            ['data_start:', 'data_start'],
            ['_edata:', 'stdin@GLIBC_2.2.5']
        ]) {
            const at = lines.findIndex((text) => text.startsWith(line))
            expect(labelToRename(listing, at, 0)?.name, line).toBe(used)
        }
    })
})

describe('a global rename', () => {
    it("keeps a renamed library datum's name taken, as the Listing settles it", () => {
        const datum = labelNamed(crackme(), 'stdin@GLIBC_2.2.5')
        const named = crackme(new Map([[datum.address, 'my_in']]))
        const dummy = labelNamed(named, 'frame_dummy')
        const problem = renameProblem(renameTarget(named, dummy), 'stdin')
        expect(problem).toBe(
            `“stdin” is already used by stdin@GLIBC_2.2.5, which was renamed to my_in (at 0x${(datum.address + BASE).toString(16)}).`
        )
        //the Listing would not apply it either
        const both = crackme(
            new Map([
                [datum.address, 'my_in'],
                [dummy.address, 'stdin']
            ])
        )
        expect(labelNamed(both, 'frame_dummy').renameConflict).toBe('stdin')
    })

    it('differs from the variables the person named in the Pseudocode', () => {
        const listing = crackme()
        const target = renameTarget(listing, labelNamed(listing, 's_hunter2'))
        const locals = namedLocals(listing, {
            locals: {
                [`0x${MAIN.toString(16)}`]: { 'stack:-0x98': 'password' },
                '0x99999': { 'stack:-0x8': 'orphan' }
            }
        })
        expect(locals).toEqual([
            { name: 'password', owner: 'main' },
            { name: 'orphan', owner: `the function at 0x${(0x99999 + BASE).toString(16)}` }
        ])
        expect(renameProblem(target, 'password', locals)).toBe(
            '“password” is already a variable defined in main. Choose another name.'
        )
        expect(renameProblem(target, 'the_password', locals)).toBeUndefined()
    })
})

describe('a local rename', () => {
    const variables = [
        { id: 'stack:-0x98', kind: 'local' as const, name: 'acStack_98', storage: 'Stack[-0x98]' },
        { id: 'register:0x0:4@+0x8e', kind: 'local' as const, name: 'iVar1', storage: 'EAX' }
    ]

    it('differs from what the Pseudocode prints for a C++ global, not its mangled name', () => {
        const listing = generateListing(decoder, {
            bytes: factcheckBytes,
            name: 'factcheck',
            base: 0,
            version: 'v1',
            demangler
        })
        expect(labelNamed(listing, '_ZL8greetingv').demangled?.pseudocode.name).toBe('greeting')
        const main = listing.functions.find((fn) => fn.name === 'main')!
        const target = variableRenameTarget(listing, main, variables, 'stack:-0x98', {
            printed: 'acStack_98'
        })
        expect(variableRenameProblem(target, 'greeting')).toBe(
            'The name “greeting” is already used as a function or global variable. Choose another name.'
        )
        //and a renamed one's names before, which its symbol keeps
        const renamed = generateListing(decoder, {
            bytes: factcheckBytes,
            name: 'factcheck',
            base: 0,
            version: 'v1',
            demangler,
            annotations: {
                names: new Map([[labelNamed(listing, '_ZL8greetingv').address, 'hello']])
            }
        })
        const again = variableRenameTarget(renamed, main, variables, 'stack:-0x98', {
            printed: 'acStack_98'
        })
        for (const name of ['hello', 'greeting', '_ZL8greetingv'])
            expect(variableRenameProblem(again, name), name).toBe(
                `The name “${name}” is already used as a function or global variable. Choose another name.`
            )
    })

    it('differs from the names saved for its function, which a Pseudocode under way does not print yet', () => {
        const listing = crackme()
        const main = listing.functions.find((fn) => fn.address === MAIN)!
        const target = variableRenameTarget(listing, main, variables, 'stack:-0x98', {
            printed: 'acStack_98'
        })
        expect(variableRenameProblem(target, 'result')).toBeUndefined()
        //`iVar1` was just named `result`, and main is being decompiled again
        const saved = { 'register:0x0:4@+0x8e': 'result' }
        expect(variableRenameProblem(target, 'result', saved)).toBe(
            'Another variable in this function is already called “result”.'
        )
        //its own saved name is no clash
        expect(variableRenameProblem(target, 'buffer', { 'stack:-0x98': 'buffer' })).toBeUndefined()
    })
})
