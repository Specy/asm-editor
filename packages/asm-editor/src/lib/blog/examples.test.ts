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
import totalsC from './fixtures/totals-c.json'
import totalsCpp from './fixtures/totals-cpp.json'

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

    it.each([
        ['A', 'Accepted'],
        ['B', 'Try again']
    ])(
        'practice executable: %s produces %s',
        async (input, output) => {
            const bytes = readFileSync(
                new URL('../../../static/downloads/blog/first-branch', import.meta.url)
            )
            const project = makeProject({
                language: 'X86',
                entry: 'first-branch',
                files: { 'first-branch': { encoding: 'base64', content: bytes.toString('base64') } }
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
                            expectedOutput: `Type a letter: ${output}\n`,
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
