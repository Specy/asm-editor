import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { extractPlaygrounds } from '#lib/content/playgrounds.ts'
import { createEmulator } from '#lib/languages/Emulator.ts'
import { makeProject } from '#lib/Project.svelte.ts'
import { programBuildSources } from '#lib/buildSources.ts'
import { compileProjectSource } from '#lib/sourceCompilation/compileProjectSource.ts'
import { compileSource } from '#lib/sourceCompilation/compilerExplorer.ts'
import { loadDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { programImage } from '#lib/pseudocode/programImage.ts'
import { loadDecompiler } from '@specy/decompiler'
import glibc from '@specy/decompiler/prototypes/glibc'
import totalsC from './fixtures/totals-c.json'
import totalsCpp from './fixtures/totals-cpp.json'
import lzstring from 'lz-string'

const blog = new URL('../../blog/', import.meta.url)
const examples = readdirSync(blog, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap(({ name: slug }) =>
        extractPlaygrounds(readFileSync(new URL(`${slug}/index.md`, blog), 'utf8'))
            .filter((example) => !example.sourceLanguage)
            .map((example) => ({ slug, example }))
    )

describe('blog worked examples', () => {
    for (const fixture of [totalsC, totalsCpp]) {
        it(`runs the exact ${fixture.sourcePath} example with recorded live GCC output`, async () => {
            const article = readFileSync(new URL('c-cpp-to-assembly/index.md', blog), 'utf8')
            expect(article).toContain(fixture.source.trim())
            const project = makeProject({
                language: 'MIPS',
                entry: fixture.sourcePath,
                files: { [fixture.sourcePath]: { encoding: 'plain', content: fixture.source } }
            })
            await compileProjectSource(project, fixture.sourcePath, '0', {
                compiler: 'gcc',
                confirm: async () => false,
                compile: (request, signal) =>
                    compileSource(
                        request,
                        signal,
                        async () => new Response(JSON.stringify(fixture.response))
                    )
            })
            const emulator = await createEmulator('MIPS', programBuildSources(project), {
                language: 'MIPS',
                automaticChecking: false
            })
            try {
                const results = await emulator.test(
                    programBuildSources(project),
                    [
                        {
                            input: [],
                            expectedOutput: '1\n3\n6\n',
                            startingRegisters: {},
                            expectedRegisters: {},
                            startingMemory: [],
                            expectedMemory: []
                        }
                    ],
                    10000
                )
                expect(results[0].passed).toBe(true)
                expect(emulator.errors).toEqual([])
                expect(emulator.stdOut).toContain('1\n3\n6\n')
                expect(emulator.terminated).toBe(true)
            } finally {
                emulator.dispose()
            }
        }, 30000)
    }

    it('keeps the practice Listing searchable with the input symbol and compare instruction', async () => {
        const bytes = new Uint8Array(
            readFileSync(new URL('../../../static/downloads/blog/first-branch', import.meta.url))
        )
        const listing = generateListing(await loadDecoder(), {
            bytes,
            name: 'first-branch',
            base: 0,
            version: 'v1'
        })
        expect(listing.text).toContain('answer')
        expect(listing.text).toMatch(/cmp\s+byte \[rel answer\]/)
        expect(listing.text).toContain('main:')
    }, 30000)

    it('reveals the flag comparison and success branch in the practice Pseudocode', async () => {
        const bytes = new Uint8Array(
            readFileSync(new URL('../../../static/downloads/blog/find-the-flag', import.meta.url))
        )
        const decoder = await loadDecoder()
        const analysis = decoder.analyze(bytes)
        const listing = generateListing(decoder, {
            bytes,
            name: 'find-the-flag',
            base: 0,
            version: 'v1'
        })
        const main = listing.functions.find((fn) => fn.name === 'main')
        expect(main).toBeDefined()
        const decompiler = await loadDecompiler({ architecture: 'x86-64' })
        try {
            const program = decompiler.openProgram(
                programImage({ bytes, listing, analysis, prototypes: glibc })
            )
            const result = program.decompile(main!.address)
            program.dispose()
            if ('error' in result) throw new Error(result.error)
            const text = result.lines.map((line) => line.text).join('\n')
            expect(text).toMatch(/strcmp\([^,\n]+,"flag\{read_the_pseudocode\}"\)/)
            expect(text).toMatch(/if \(\w+ == 0\)/)
            expect(text).toContain('puts("Flag accepted");')
            expect(text).toContain('puts("Wrong flag");')
        } finally {
            decompiler.dispose()
        }
    }, 30000)

    for (const { slug, example } of examples) {
        it(`${slug} playground ${example.index}`, async () => {
            const sources = {
                entry: 'main.s',
                files: { 'main.s': { encoding: 'plain' as const, content: example.code } }
            }
            const emulator = await createEmulator(example.settings.language, sources, {
                language: example.settings.language,
                automaticChecking: false
            })
            try {
                const testcase = example.testcase ?? {
                    input: slug.includes('browser') ? ['21'] : [],
                    expectedOutput: '',
                    startingRegisters: {},
                    expectedRegisters: {},
                    startingMemory: [],
                    expectedMemory: []
                }
                if (slug === 'getting-started') testcase.expectedOutput = '42\n'
                if (slug.endsWith('browser'))
                    testcase.expectedOutput = 'Give me a number: \nTwice that is 42'
                const results = await emulator.test(sources, [testcase], 10000)
                expect(results[0].passed).toBe(!example.isExercise)
                expect(emulator.errors).toEqual([])
                if (slug === 'getting-started') expect(emulator.stdOut).toContain('42\n')
                if (slug.endsWith('browser')) expect(emulator.stdOut).toContain('Twice that is 42')
                for (const [name, value] of Object.entries(testcase.expectedRegisters)) {
                    const actual = emulator.registers.find(
                        (register) => register.name.toLowerCase() === name.toLowerCase()
                    )?.value
                    if (example.isExercise) expect(actual).not.toBe(BigInt(value))
                    else expect(actual).toBe(BigInt(value))
                }
            } finally {
                emulator.dispose()
            }
        }, 30000)
    }

    it('opens the flag executable from the Try ASM Editor link, its testcases passing', async () => {
        const article = readFileSync(
            new URL('first-x86-reverse-engineering/index.md', blog),
            'utf8'
        )
        const payload = /class="blog-try-button" href="\/projects\/share\?project=([^"]+)"/.exec(
            article
        )
        expect(payload).not.toBeNull()
        const shared = JSON.parse(lzstring.decompressFromEncodedURIComponent(payload![1]))
        const bytes = readFileSync(
            new URL('../../../static/downloads/blog/find-the-flag', import.meta.url)
        )
        expect(shared.entry).toBe('find-the-flag')
        expect(shared.files['find-the-flag'].content).toBe(bytes.toString('base64'))
        expect(shared.testcases.map((testcase: { input: string[] }) => testcase.input)).toEqual([
            ['flag{read_the_pseudocode}'],
            ['flag{guess}']
        ])
        const project = makeProject(shared)
        const emulator = await createEmulator('X86', programBuildSources(project), {
            language: 'X86',
            automaticChecking: false
        })
        try {
            const results = await emulator.test(
                programBuildSources(project),
                shared.testcases,
                10000
            )
            expect(results.map((result) => result.passed)).toEqual([true, true])
            expect(emulator.errors).toEqual([])
        } finally {
            emulator.dispose()
        }
    }, 30000)

    it.each([
        ['first-branch', 'A', 'Type a letter: Accepted\n'],
        ['first-branch', 'B', 'Type a letter: Try again\n'],
        ['find-the-flag', 'flag{read_the_pseudocode}', 'Enter the flag:\nFlag accepted\n'],
        ['find-the-flag', 'wrong', 'Enter the flag:\nWrong flag\n']
    ])(
        'practice executable %s: %s produces %s',
        async (name, input, output) => {
            const bytes = readFileSync(
                new URL(`../../../static/downloads/blog/${name}`, import.meta.url)
            )
            const project = makeProject({
                language: 'X86',
                entry: name,
                files: { [name]: { encoding: 'base64', content: bytes.toString('base64') } }
            })
            const emulator = await createEmulator('X86', programBuildSources(project), {
                language: 'X86',
                automaticChecking: false
            })
            try {
                const results = await emulator.test(
                    programBuildSources(project),
                    [
                        {
                            input: [input],
                            expectedOutput: output,
                            startingRegisters: {},
                            expectedRegisters: {},
                            startingMemory: [],
                            expectedMemory: []
                        }
                    ],
                    10000
                )
                expect(results[0].passed).toBe(true)
                expect(emulator.errors).toEqual([])
                expect(emulator.stdOut).toContain(output)
                expect(emulator.terminated).toBe(true)
            } finally {
                emulator.dispose()
            }
        },
        30000
    )
})
