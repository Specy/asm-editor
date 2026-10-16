/**
 * The Build output: the program an x86 Build links, kept beside the Project's Files and present in
 * its own FileSystem at the path the Command line names
 * ([ADR 0050](../../../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md),
 * [file-views.md](../../../../../../docs/design/file-views.md) decisions 16 to 18, the plan's E7).
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { buildOutputFile } from '#lib/buildOutput.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { BuildSources, ProjectFiles } from '#lib/projectFiles.ts'
import { compileSource } from '#lib/sourceCompilation/compilerExplorer.ts'
import { generatedAssemblyPath } from '#lib/sourceCompilation/records.ts'
import { X86Emulator } from './X86Emulator.svelte'

const plain = (content: string) => ({ encoding: 'plain' as const, content })

function assembledSources(
    code: string,
    files: ProjectFiles = {},
    entry = 'main.asm'
): BuildSources {
    return { entry, files: { ...files, [entry]: plain(code) } }
}

const EXIT = ['    mov eax, 60', '    xor edi, edi', '    syscall']

/** A program that does nothing but end. */
const NOTHING = ['global _start', 'section .text', '_start:', ...EXIT].join('\n')

/**
 * A program that reads the first four bytes of its own File, `./main`, into r15, then tries to open
 * it for writing (r14), to remove it (r13) and to rename it (r12), keeping each result.
 */
const READS_ITSELF = [
    'global _start',
    'section .data',
    'self: db "./main", 0',
    'other: db "./renamed", 0',
    'section .bss',
    'head: resb 4',
    'section .text',
    '_start:',
    '    mov eax, 2', //open(self, O_RDONLY)
    '    lea rdi, [rel self]',
    '    xor esi, esi',
    '    syscall',
    '    mov edi, eax',
    '    xor eax, eax', //read(fd, head, 4)
    '    lea rsi, [rel head]',
    '    mov edx, 4',
    '    syscall',
    '    mov r15d, [rel head]',
    '    mov eax, 2', //open(self, O_WRONLY)
    '    lea rdi, [rel self]',
    '    mov esi, 1',
    '    syscall',
    '    mov r14, rax',
    '    mov eax, 87', //unlink(self)
    '    lea rdi, [rel self]',
    '    syscall',
    '    mov r13, rax',
    '    mov eax, 82', //rename(self, other)
    '    lea rdi, [rel self]',
    '    lea rsi, [rel other]',
    '    syscall',
    '    mov r12, rax',
    ...EXIT
].join('\n')

const ELF_MAGIC = [0x7f, 0x45, 0x4c, 0x46]
/** Linux's errno values, as a system call returns them negated. */
const ETXTBSY = 26
const EBUSY = 16

const emulators: { dispose(): void }[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

/** An Emulator whose FileSystem holds the Project's Files, as the Workbench's does. */
async function emulatorFor(sources: BuildSources) {
    const emulator = await X86Emulator(sources, {
        automaticChecking: false,
        peripherals: { fileSystem: new FileSystem(sources.files) }
    })
    emulators.push(emulator)
    return emulator
}

/** A register's value as the signed number a system call returned in it. */
function signed(emulator: Awaited<ReturnType<typeof emulatorFor>>, name: string): bigint {
    const value = emulator.registers.find((register) => register.name === name)!.value
    return BigInt.asIntN(64, BigInt(value))
}

let decoder: ListingDecoder
beforeAll(async () => {
    decoder = await loadDecoder()
})

describe('an x86 Build of main.asm', () => {
    it('keeps the program it linked as `main`, an Executable whose Listing names `_start`', async () => {
        const sources = assembledSources(NOTHING)
        const emulator = await emulatorFor(sources)
        expect(emulator.buildOutput).toBeUndefined()
        await emulator.compile(100, sources)
        const output = emulator.buildOutput!
        expect(output.path).toBe('main')
        expect([...output.bytes.subarray(0, 4)]).toEqual(ELF_MAGIC)
        expect(output.sources.files).toEqual(sources.files)
        expect(emulator.notes).toEqual([])
        const listings = new ListingDocuments((order) =>
            Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
        )
        const listing = await listings.openExecutable('main', buildOutputFile(output))!.ready
        expect(listing.labels.map((label) => label.name)).toContain('_start')
    })

    it('keeps it after Stop and replaces it at the next Build, which leaves none if it fails', async () => {
        const sources = assembledSources(NOTHING)
        const emulator = await emulatorFor(sources)
        await emulator.compile(100, sources)
        const first = emulator.buildOutput!
        emulator.clear()
        expect(emulator.buildOutput).toBe(first)
        await emulator.compile(100, sources)
        expect(emulator.buildOutput!.generation).toBeGreaterThan(first.generation)
        const broken = assembledSources('global _start\n_start:\n    mov eax,')
        await expect(emulator.compile(100, broken)).rejects.toThrow()
        expect(emulator.buildOutput).toBeUndefined()
    })

    it('shows the program its own File, which it reads but cannot write, remove or rename', async () => {
        const sources = assembledSources(READS_ITSELF)
        const emulator = await emulatorFor(sources)
        await emulator.compile(100, sources)
        await emulator.run(0)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(signed(emulator, 'r15')).toBe(0x464c457fn)
        expect(signed(emulator, 'r14')).toBe(BigInt(-ETXTBSY))
        expect(signed(emulator, 'r13')).toBe(BigInt(-EBUSY))
        expect(signed(emulator, 'r12')).toBe(BigInt(-EBUSY))
        //and it is no File of the Project, which is as it was
        expect(Object.keys(emulator.peripherals.fileSystem.files)).toEqual(['main.asm'])
    })

    it("presents each Testcase's program in that Testcase's FileSystem too", async () => {
        const sources = assembledSources(READS_ITSELF)
        const emulator = await emulatorFor(sources)
        const testcase: Testcase = {
            input: [],
            expectedOutput: '',
            startingRegisters: {},
            expectedRegisters: { r15: 0x464c457fn, r14: BigInt.asUintN(64, BigInt(-ETXTBSY)) },
            startingMemory: [],
            expectedMemory: []
        }
        const [result] = await emulator.test(sources, [testcase], 100_000)
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
        //a test run builds the program for each Testcase, which is no Build of the person's
        expect(emulator.buildOutput).toBeUndefined()
    })

    it.each([
        ['File', { main: plain('a note') }],
        ['folder', { 'main/notes.txt': plain('a note') }]
    ])('places none where a %s of the Project is, and the Log says why', async (kind, files) => {
        const sources = assembledSources(READS_ITSELF, files)
        const emulator = await emulatorFor(sources)
        await emulator.compile(100, sources)
        expect(emulator.buildOutput).toBeUndefined()
        expect(emulator.notes.map((note) => note.text)).toEqual([
            `\`main\` is already a ${kind} of the Project, so the built program is not shown; rename one of them.`
        ])
        await emulator.run(0)
        //the File is the program's to read, and to write: it is not the program
        if (kind === 'File') {
            expect(signed(emulator, 'r15')).toBe(0x6f6e2061n) //"a no"
            expect(signed(emulator, 'r14')).toBeGreaterThanOrEqual(3n)
        }
    })

    it('has none for an Executable Entry, which is a File already', async () => {
        const content = readFileSync(
            new URL('../../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url)
        ).toString('base64')
        const sources: BuildSources = {
            entry: 'crackme',
            files: { crackme: { encoding: 'base64', content } }
        }
        const emulator = await emulatorFor(sources)
        await emulator.compile(100, sources)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.buildOutput).toBeUndefined()
    })
})

describe('a C program compiled with the Start unit', () => {
    it('gets its program at the source File path without its extension', async () => {
        const fixture = JSON.parse(
            readFileSync(
                'src/lib/sourceRuntime/fixtures/sim/x86/linux-calls-x86-gcc-O0.json',
                'utf8'
            )
        ) as {
            sourcePath: string
            source: string
            optimization: '0'
            response: { code: number; stderr: { text: string }[]; lines: [string][] }
        }
        const outputPath = generatedAssemblyPath(fixture.sourcePath, 'X86')
        const files: ProjectFiles = { [fixture.sourcePath]: plain(fixture.source) }
        const response = {
            code: fixture.response.code,
            stderr: fixture.response.stderr,
            asm: fixture.response.lines.map(([text]) => ({ text, source: null }))
        }
        const compiled = await compileSource(
            {
                sourcePath: fixture.sourcePath,
                outputPath,
                files,
                target: 'X86',
                optimization: fixture.optimization
            },
            undefined,
            vi.fn(async () => new Response(JSON.stringify(response)))
        )
        const sources: BuildSources = {
            entry: outputPath,
            entrySymbol: '_start',
            entrySource: fixture.sourcePath,
            files: { ...files, [outputPath]: plain(compiled.assembly) }
        }
        const emulator = await emulatorFor(sources)
        await emulator.compile(100, sources)
        expect(emulator.errors).toEqual([])
        expect(fixture.sourcePath).toBe('src/main.c')
        expect(emulator.buildOutput?.path).toBe('src/main')
        expect([...emulator.buildOutput!.bytes.subarray(0, 4)]).toEqual(ELF_MAGIC)
    }, 30_000)
})

describe('a MIPS Build', () => {
    it('links no program, so it has no Build output', async () => {
        const emulator = MIPSEmulator('li $v0, 10\nsyscall', {})
        emulators.push(emulator)
        await emulator.compile(100, undefined)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.buildOutput).toBeUndefined()
    })
})
