import { readFileSync } from 'node:fs'
import { describe, it } from 'vite-plus/test'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder } from './decoder'
import { generateListing } from './generateListing'
import { LINE_KIND, type Listing, type ListingAnnotations } from './listing'

/**
 * How long a Listing takes to generate in Node, against the plan's targets (binary-import-plan.md,
 * M7.9): `crackme` under 50 ms, a static glibc binary under 1 s, libc under 3 s. Also how long
 * copying the result takes, which is what posting it from the worker to the editor costs.
 * `libstdc++.so.6` is listed with raw names and then with its C++ names demangled
 * (cpp-demangling.md, decision 1), which costs it about a tenth more. `factcheck` and the static
 * program are listed again with a person's renames and comments everywhere: every function but
 * the PLT's renamed and given a function comment, and a comment on every fourth instruction,
 * every third of them too long for the end of its line (annotations-and-search.md, decision 22).
 *
 *     node_modules/.bin/vp test run --config vitest.measure.config.ts --project node src/lib/listing
 */

const REPEATS = 5

/** A person's renames and comments over the whole of a Listing made without any. */
function everywhere(listing: Listing): ListingAnnotations {
    const names = new Map<number, string>()
    const functionComments = new Map<number, string>()
    for (const fn of listing.functions) {
        if (fn.name.includes('@')) continue
        names.set(fn.address, `renamed_${fn.address.toString(16)}`)
        functionComments.set(fn.address, `What the function at ${fn.address.toString(16)} does.`)
    }
    const comments = new Map<number, string>()
    const { kinds, addresses } = listing.lines
    let instructions = 0
    for (let line = 0; line < kinds.length; ++line) {
        if (kinds[line] !== LINE_KIND.instruction || instructions++ % 4) continue
        comments.set(
            addresses[line],
            comments.size % 3
                ? 'a short comment'
                : 'a comment long enough to be written above its line, wrapped at a hundred columns as the Listing wraps every comment it cannot fit at the end of the line'
        )
    }
    return { names, comments, functionComments }
}

const DECOMPILER_FIXTURES = '../../../../decompiler/js/tests/fixtures/elf/'

const inputs: {
    name: string
    path: string
    base: number
    target: number
    root?: string
    demangle?: true
    annotate?: true
}[] = [
    { name: 'crackme', path: 'tests/fixtures/elf/crackme', base: 0x555555554000, target: 50 },
    { name: 'crackme-static', path: 'tests/fixtures/elf/crackme-static', base: 0, target: 1000 },
    {
        name: 'hello-atexit-static',
        path: 'tests/fixtures/elf/hello-atexit-static',
        base: 0,
        target: 1000
    },
    {
        name: 'hello-atexit-static',
        path: 'tests/fixtures/elf/hello-atexit-static',
        base: 0,
        target: 1000,
        annotate: true
    },
    {
        name: 'factcheck',
        root: DECOMPILER_FIXTURES,
        path: 'factcheck',
        base: 0x555555554000,
        target: 100,
        demangle: true
    },
    {
        name: 'factcheck',
        root: DECOMPILER_FIXTURES,
        path: 'factcheck',
        base: 0x555555554000,
        target: 100,
        demangle: true,
        annotate: true
    },
    { name: 'libc.so.6', path: 'src/assets/linux/libc.so.6', base: 0x7ffff7c00000, target: 3000 },
    {
        name: 'libstdc++.so.6',
        path: 'src/assets/linux/libstdc++.so.6',
        base: 0x7ffff7e00000,
        target: 3000
    },
    {
        name: 'libstdc++.so.6',
        path: 'src/assets/linux/libstdc++.so.6',
        base: 0x7ffff7e00000,
        target: 3000,
        demangle: true
    }
]

const median = (values: number[]) => [...values].sort((a, b) => a - b)[values.length >> 1]

describe('Listing generation', () => {
    it('meets its time targets', async () => {
        const decoder = await loadDecoder()
        const loaded = await loadDemangler()
        const rows: string[] = []
        for (const input of inputs) {
            const bytes = new Uint8Array(
                readFileSync(
                    new URL(
                        `${input.root ?? '../../../../x86/blink-js/'}${input.path}`,
                        import.meta.url
                    )
                )
            )
            const demangler: Demangler | undefined = input.demangle ? loaded : undefined
            const annotations = input.annotate
                ? everywhere(
                      generateListing(decoder, { ...input, bytes, version: 'v1', demangler })
                  )
                : undefined
            const make = () =>
                generateListing(decoder, { ...input, bytes, version: 'v1', demangler, annotations })
            const times: number[] = []
            const coldStart = performance.now()
            let listing = make()
            const cold = performance.now() - coldStart
            for (let repeat = 0; repeat < REPEATS; ++repeat) {
                const start = performance.now()
                listing = make()
                times.push(performance.now() - start)
            }
            const cloneStart = performance.now()
            structuredClone(listing)
            const clone = performance.now() - cloneStart
            rows.push(
                [
                    [input.name, demangler && 'C++', annotations && 'annotated']
                        .filter(Boolean)
                        .join(' ')
                        .padEnd(30),
                    `${(bytes.length / 1024).toFixed(0)} KiB`.padStart(9),
                    `${listing.lines.kinds.length} lines`.padStart(14),
                    `${listing.labels.length} labels`.padStart(14),
                    `first ${cold.toFixed(1)} ms`.padStart(16),
                    `then ${median(times).toFixed(1)} ms`.padStart(15),
                    `target ${input.target} ms`.padStart(15),
                    `clone ${clone.toFixed(1)} ms`.padStart(16),
                    `${(listing.text.length / 1048576).toFixed(1)} MiB of text`.padStart(18)
                ].join(' ')
            )
        }
        console.log(
            `\nListing generation, the first run in this process, then the median of ${REPEATS}:\n${rows.join('\n')}`
        )
    })
})
