import { readFileSync } from 'node:fs'
import { describe, it } from 'vite-plus/test'
import { loadDemangler, type Demangler } from '#lib/languages/demangle/loadDemangler.ts'
import { loadDecoder } from './decoder'
import { generateListing } from './generateListing'

/**
 * How long a Listing takes to generate in Node, against the plan's targets (binary-import-plan.md,
 * M7.9): `crackme` under 50 ms, a static glibc binary under 1 s, libc under 3 s. Also how long
 * copying the result takes, which is what posting it from the worker to the editor costs.
 * `libstdc++.so.6` is listed with raw names and then with its C++ names demangled
 * (cpp-demangling.md, decision 1), which costs it about a tenth more.
 *
 *     node_modules/.bin/vp test run --config vitest.measure.config.ts --project node src/lib/listing
 */

const REPEATS = 5
const inputs = [
    { name: 'crackme', path: 'tests/fixtures/elf/crackme', base: 0x555555554000, target: 50 },
    { name: 'crackme-static', path: 'tests/fixtures/elf/crackme-static', base: 0, target: 1000 },
    {
        name: 'hello-atexit-static',
        path: 'tests/fixtures/elf/hello-atexit-static',
        base: 0,
        target: 1000
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
                readFileSync(new URL(`../../../../x86/blink-js/${input.path}`, import.meta.url))
            )
            const demangler: Demangler | undefined = 'demangle' in input ? loaded : undefined
            const times: number[] = []
            const coldStart = performance.now()
            let listing = generateListing(decoder, { ...input, bytes, version: 'v1', demangler })
            const cold = performance.now() - coldStart
            for (let repeat = 0; repeat < REPEATS; ++repeat) {
                const start = performance.now()
                listing = generateListing(decoder, { ...input, bytes, version: 'v1', demangler })
                times.push(performance.now() - start)
            }
            const cloneStart = performance.now()
            structuredClone(listing)
            const clone = performance.now() - cloneStart
            rows.push(
                [
                    (demangler ? `${input.name} C++` : input.name).padEnd(20),
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
