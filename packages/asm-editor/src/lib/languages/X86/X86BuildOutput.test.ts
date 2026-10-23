/**
 * The Build output: the program an x86 Build links, which a person's Build hands its host to save
 * as a File of the Project at the path the Command line names, and which the run's FileSystem keeps
 * from the running program
 * ([ADR 0056](../../../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md),
 * [file-views.md](../../../../../../docs/design/file-views.md) decisions 16 to 18).
 */
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import type { BuildOutputClaim, BuildOutputHost } from '#lib/buildOutput.ts'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import { fileBytes, type BuildSources, type ProjectFiles } from '#lib/projectFiles.ts'
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

/**
 * A host that saves the program in the Emulator's FileSystem, as the Workbench saves it in the
 * Project's, once `claim` says so: at once by default.
 */
function savingHost(
    emulator: Awaited<ReturnType<typeof emulatorFor>>,
    claim: (path: string, signal: AbortSignal) => Promise<BuildOutputClaim> = async () => 'save'
) {
    const host = {
        claim: vi.fn(claim),
        save: vi.fn((_sources: BuildSources, path: string, bytes: Uint8Array) =>
            emulator.peripherals.fileSystem.writeBytes(path, bytes, true, 'base64')
        ),
        isBuildOutput: vi.fn((_path: string) => false)
    } satisfies BuildOutputHost
    emulator.setBuildOutputHost(host)
    return host
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
    it('has its host save the program it linked as `main`, an Executable whose Listing names `_start`', async () => {
        const sources = assembledSources(NOTHING)
        const emulator = await emulatorFor(sources)
        const host = savingHost(emulator)
        await emulator.compile(100, sources)
        expect(host.claim).toHaveBeenCalledWith('main', expect.any(AbortSignal))
        expect(host.save).toHaveBeenCalledWith(sources, 'main', expect.any(Uint8Array))
        const saved = emulator.peripherals.fileSystem.files.main
        expect([...fileBytes(saved).subarray(0, 4)]).toEqual(ELF_MAGIC)
        //the Debug session shows it as one of the Build's Files
        expect(emulator.buildSources?.files.main).toBe(saved)
        expect(emulator.buildSources?.files['main.asm']).toEqual(sources.files['main.asm'])
        expect(emulator.notes).toEqual([])
        const listings = new ListingDocuments((order) =>
            Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
        )
        const listing = await listings.openExecutable('main', saved)!.ready
        expect(listing.labels.map((label) => label.name)).toContain('_start')
    })

    it('keeps the saved program from itself: it reads it but cannot write, remove or rename it', async () => {
        const sources = assembledSources(READS_ITSELF)
        const emulator = await emulatorFor(sources)
        savingHost(emulator)
        await emulator.compile(100, sources)
        const saved = emulator.peripherals.fileSystem.files.main
        await emulator.run(0)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(signed(emulator, 'r15')).toBe(0x464c457fn)
        expect(signed(emulator, 'r14')).toBe(BigInt(-ETXTBSY))
        expect(signed(emulator, 'r13')).toBe(BigInt(-EBUSY))
        expect(signed(emulator, 'r12')).toBe(BigInt(-EBUSY))
        expect(emulator.peripherals.fileSystem.files.main).toBe(saved)
    })

    it('without a host, only shows the program its own File, which is no File of the Project', async () => {
        const sources = assembledSources(READS_ITSELF)
        const emulator = await emulatorFor(sources)
        await emulator.compile(100, sources)
        await emulator.run(0)
        expect(emulator.errors).toEqual([])
        expect(signed(emulator, 'r15')).toBe(0x464c457fn)
        expect(signed(emulator, 'r14')).toBe(BigInt(-ETXTBSY))
        expect(signed(emulator, 'r13')).toBe(BigInt(-EBUSY))
        expect(signed(emulator, 'r12')).toBe(BigInt(-EBUSY))
        expect(Object.keys(emulator.peripherals.fileSystem.files)).toEqual(['main.asm'])
    })

    it('saves nothing when its host says not to, and the Log says why', async () => {
        const sources = assembledSources(READS_ITSELF, { main: plain('a note') })
        const emulator = await emulatorFor(sources)
        const host = savingHost(emulator, async (path) => ({ note: `\`${path}\` was kept` }))
        await emulator.compile(100, sources)
        expect(host.save).not.toHaveBeenCalled()
        expect(emulator.notes.map((note) => note.text)).toEqual(['`main` was kept'])
        await emulator.run(0)
        //the File is the program's to read, and to write: it is not the program
        expect(signed(emulator, 'r15')).toBe(0x6f6e2061n) //"a no"
        expect(signed(emulator, 'r14')).toBeGreaterThanOrEqual(3n)
    })

    it('runs the program it could not save, which the Log says, showing it to itself', async () => {
        const sources = assembledSources(READS_ITSELF)
        const emulator = await emulatorFor(sources)
        const host = savingHost(emulator)
        host.save.mockImplementation(() => {
            throw new Error('Project exceeds the 16 MiB file limit')
        })
        await emulator.compile(100, sources)
        expect(emulator.notes.map((note) => note.text)).toEqual([
            'The built program could not be saved as `main`: Project exceeds the 16 MiB file limit'
        ])
        expect(emulator.canExecute).toBe(true)
        await emulator.run(0)
        expect(signed(emulator, 'r15')).toBe(0x464c457fn)
        expect(Object.keys(emulator.peripherals.fileSystem.files)).toEqual(['main.asm'])
    })

    it('only shows the program to itself when its host says to present it', async () => {
        const sources = assembledSources(READS_ITSELF)
        const emulator = await emulatorFor(sources)
        const host = savingHost(emulator, async () => 'present')
        await emulator.compile(100, sources)
        expect(host.save).not.toHaveBeenCalled()
        expect(emulator.notes).toEqual([])
        await emulator.run(0)
        expect(signed(emulator, 'r15')).toBe(0x464c457fn)
        expect(Object.keys(emulator.peripherals.fileSystem.files)).toEqual(['main.asm'])
    })

    it('takes its question back and saves nothing when the Build is cancelled while it asks', async () => {
        const sources = assembledSources(NOTHING)
        const emulator = await emulatorFor(sources)
        let asked!: AbortSignal
        let answer!: (claim: BuildOutputClaim) => void
        const host = savingHost(emulator, (_path, signal) => {
            asked = signal
            return new Promise((resolve) => (answer = resolve))
        })
        const building = emulator.compile(100, sources)
        await vi.waitFor(() => expect(host.claim).toHaveBeenCalled(), { timeout: 20_000 })
        emulator.clear()
        await building
        expect(asked.aborted).toBe(true)
        answer('save')
        await Promise.resolve()
        expect(host.save).not.toHaveBeenCalled()
        expect(emulator.canExecute).toBe(false)
    }, 30_000)

    it("presents each Testcase's program in that Testcase's FileSystem too, saving nothing", async () => {
        const sources = assembledSources(READS_ITSELF)
        const emulator = await emulatorFor(sources)
        const host = savingHost(emulator)
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
        expect(host.claim).not.toHaveBeenCalled()
        expect(host.save).not.toHaveBeenCalled()
        expect(Object.keys(emulator.peripherals.fileSystem.files)).toEqual(['main.asm'])
    })

    it("puts a Testcase's program in place of the Build output in its own FileSystem", async () => {
        //an earlier Build's program, stale: the Testcase must read its own instead
        const sources = assembledSources(READS_ITSELF, { main: plain('a note') })
        const emulator = await emulatorFor(sources)
        const host = savingHost(emulator)
        host.isBuildOutput.mockImplementation((path) => path === 'main')
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
        expect(emulator.peripherals.fileSystem.files.main).toEqual(plain('a note'))
    })

    it.each([
        ['folder', { 'main/notes.txt': plain('a note') }, 'is a folder of the Project'],
        ['File', { main: plain('a note') }, 'was kept']
    ])(
        'without a host, places none where a %s of the Project is, and the Log says why',
        async (_kind, files, why) => {
            const sources = assembledSources(READS_ITSELF, files)
            const emulator = await emulatorFor(sources)
            await emulator.compile(100, sources)
            expect(emulator.notes.map((note) => note.text)).toEqual([
                expect.stringContaining(`\`main\` ${why}`)
            ])
        }
    )

    it('saves nothing over the Entry itself, when it has no extension', async () => {
        const sources = assembledSources(NOTHING, {}, 'main')
        const emulator = await emulatorFor(sources)
        const host = savingHost(emulator)
        await emulator.compile(100, sources)
        expect(host.claim).not.toHaveBeenCalled()
        expect(emulator.peripherals.fileSystem.files.main).toEqual(plain(NOTHING))
        expect(emulator.notes.map((note) => note.text)).toEqual([
            "`main` is the program's own source, so the built program is not saved; give it an extension, such as `main.asm`."
        ])
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
        const host = savingHost(emulator)
        await emulator.compile(100, sources)
        expect(emulator.canExecute).toBe(true)
        expect(host.claim).not.toHaveBeenCalled()
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
        savingHost(emulator)
        await emulator.compile(100, sources)
        expect(emulator.errors).toEqual([])
        expect(fixture.sourcePath).toBe('src/main.c')
        const saved = emulator.peripherals.fileSystem.files['src/main']
        expect([...fileBytes(saved).subarray(0, 4)]).toEqual(ELF_MAGIC)
    }, 30_000)
})

describe('a MIPS Build', () => {
    it('links no program, so it has no Build output', async () => {
        const emulator = MIPSEmulator('li $v0, 10\nsyscall', {})
        emulators.push(emulator)
        const host = { claim: vi.fn(), save: vi.fn(), isBuildOutput: vi.fn() }
        emulator.setBuildOutputHost(host)
        await emulator.compile(100, undefined)
        expect(emulator.canExecute).toBe(true)
        expect(host.claim).not.toHaveBeenCalled()
    })
})
