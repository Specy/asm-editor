/**
 * What an x86 Build says it waits for, phase by phase, and a Build whose download fails
 * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md), decision 2).
 * Each test file has the Core to itself, so the downloads here are the first of its life.
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { ResourceDownloadError, type X86Emulator as CoreX86Emulator } from '@specy/x86'
import { BuildDownloadError } from '#lib/languages/BaseEmulator.svelte.ts'
import { GenericEmulator } from '#lib/languages/GenericEmulator.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'
import { X86Emulator } from './X86Emulator.svelte'

const crackme = readFileSync(
    new URL('../../../../../x86/blink-js/tests/fixtures/elf/crackme', import.meta.url)
)

const executable: BuildSources = {
    entry: 'crackme',
    files: { crackme: { encoding: 'base64', content: Buffer.from(crackme).toString('base64') } }
}

const assembly: BuildSources = {
    entry: 'main.asm',
    files: {
        'main.asm': {
            encoding: 'plain',
            content: ['global _start', 'section .text', '_start:', 'mov eax, 60', 'syscall'].join(
                '\n'
            )
        }
    }
}

const emulators: { dispose(): void }[] = []
afterEach(() => {
    emulators.splice(0).forEach((emulator) => emulator.dispose())
    vi.restoreAllMocks()
})

async function emulatorFor(sources: BuildSources) {
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    emulators.push(emulator)
    return emulator
}

/** Every phase the Emulator says while the test runs, in order. */
function phases() {
    const reported = vi.spyOn(
        GenericEmulator.prototype as unknown as { reportBuildPhase(phase?: string): void },
        'reportBuildPhase'
    )
    return () => reported.mock.calls.map(([phase]) => phase)
}

describe('an x86 Build', () => {
    it("says what an Executable's Build waits for: its libraries, its load and its start", async () => {
        const emulator = await emulatorFor(executable)
        const said = phases()
        await emulator.compile(0, executable)
        expect(said()).toEqual([
            'Loading the program…',
            'Downloading ld-linux-x86-64.so.2…',
            'Downloading libc.so.6…',
            'Loading the program…',
            'Starting the program…'
        ])
        expect(emulator.buildPhase).toBeUndefined()
        expect(emulator.canExecute).toBe(true)
        //the libraries are kept for the next
        emulator.clear()
        await emulator.compile(0, executable)
        expect(said().slice(5)).toEqual([
            'Loading the program…',
            'Loading the program…',
            'Starting the program…'
        ])
    })

    it('says when it downloads the assembler, then that it assembles and links', async () => {
        const emulator = await emulatorFor(assembly)
        const said = phases()
        await emulator.compile(0, assembly)
        expect(emulator.canExecute).toBe(true)
        expect(said()).toEqual(['Downloading the assembler…', 'Assembling…', 'Linking…'])
        emulator.clear()
        await emulator.compile(0, assembly)
        expect(said().slice(3)).toEqual(['Assembling…', 'Linking…'])
    })

    it('ends with what could not be downloaded and to Build again, and builds the next time', async () => {
        const emulator = await emulatorFor(executable)
        const core = (emulator as unknown as { core: CoreX86Emulator }).core
        const load = vi
            .spyOn(core, 'loadExecutable')
            .mockRejectedValueOnce(new ResourceDownloadError('libc.so.6', 'no data for 20 s'))
        const failed = emulator.compile(0, executable)
        await expect(failed).rejects.toBeInstanceOf(BuildDownloadError)
        await expect(failed).rejects.toThrow(
            'Could not download libc.so.6: no data for 20 s. Check the connection and Build again.'
        )
        expect(emulator.errors).toEqual([
            'Could not download libc.so.6: no data for 20 s. Check the connection and Build again.'
        ])
        expect(emulator.canExecute).toBe(false)
        expect(emulator.buildPhase).toBeUndefined()

        await emulator.compile(0, executable)
        expect(load).toHaveBeenCalledTimes(2)
        expect(emulator.errors).toEqual([])
        expect(emulator.canExecute).toBe(true)
    })

    it('says to reload the page when the server refused a download', async () => {
        const emulator = await emulatorFor(executable)
        const core = (emulator as unknown as { core: CoreX86Emulator }).core
        //a site updated since the page loaded no longer has the files it names
        vi.spyOn(core, 'loadExecutable').mockRejectedValueOnce(
            new ResourceDownloadError('libc.so.6', '404 Not Found', { status: 404 })
        )
        await expect(emulator.compile(0, executable)).rejects.toThrow(
            'Could not download libc.so.6: 404 Not Found. Reload the page and Build again.'
        )
    })
})

/**
 * A Build that Cancel ended, `clear()` here as the Workbench's Cancel calls it, while it waited:
 * whatever it waited for, however that ends, it writes nothing into the Emulator, and the Build
 * pressed next does not wait for anything only the editor was waiting on.
 */
describe('a cancelled x86 Build', () => {
    /** The Core's `loadExecutable` for the next load, which ends when the test says. */
    function heldLoad(core: CoreX86Emulator) {
        const load = { finish: (_info: unknown) => {} }
        vi.spyOn(core, 'loadExecutable').mockImplementationOnce(
            () => new Promise((resolve) => (load.finish = resolve)) as never
        )
        return load
    }

    it('says nothing in the Log of the program it was loading', async () => {
        const emulator = await emulatorFor(executable)
        const core = (emulator as unknown as { core: CoreX86Emulator }).core
        const load = heldLoad(core)
        const cancelled = emulator.compile(0, executable)
        await vi.waitFor(() => expect(core.loadExecutable).toHaveBeenCalledOnce())
        emulator.clear()
        //the download ends later, for a program that needs a library x86 does not bundle
        load.finish({
            pie: true,
            interpreter: '/lib64/ld-linux-x86-64.so.2',
            needed: ['libc.so.6', 'libfoo.so.1'],
            missing: ['libfoo.so.1']
        })
        await cancelled
        //a Build still current says it (X86Notes.test.ts)
        expect(emulator.notes).toEqual([])
        expect(emulator.canExecute).toBe(false)
    })

    it('lends the debugger no start code it was linking', async () => {
        const sources = { ...assembly, x86Support: true }
        const emulator = await emulatorFor(sources)
        const core = (emulator as unknown as { core: CoreX86Emulator }).core
        const build = { finish: (_result: unknown) => {} }
        const compiled = vi
            .spyOn(core, 'compileProject')
            .mockImplementationOnce(
                () => new Promise((resolve) => (build.finish = resolve)) as never
            )
        const cancelled = emulator.compile(0, sources)
        await vi.waitFor(() => expect(compiled).toHaveBeenCalledOnce())
        emulator.clear()
        build.finish({ ok: true, diagnostics: [], report: '' })
        await cancelled
        expect(emulator.buildLibraryFiles).toBeUndefined()
        expect(emulator.canExecute).toBe(false)
    })

    it('holds no later Build while it waits on an import that never ends', async () => {
        const emulator = await emulatorFor(executable)
        const core = (emulator as unknown as { core: CoreX86Emulator }).core
        const loads = vi.spyOn(core, 'loadExecutable')
        //Zydis's chunk, which never arrives
        const adapter = emulator as unknown as {
            programStartOf(bytes: Uint8Array): Promise<unknown>
        }
        adapter.programStartOf = () => new Promise(() => {})
        let settled = false
        void emulator.compile(0, executable).finally(() => (settled = true))
        await vi.waitFor(() => expect(loads).toHaveBeenCalledOnce())
        emulator.clear()
        await vi.waitFor(() => expect(settled).toBe(true))
        //the chunk arrives for the next one
        delete (adapter as { programStartOf?: unknown }).programStartOf
        await emulator.compile(0, executable)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.notes).toEqual([])
    })

    it('holds no later Build while it waits on the Runtime library', async () => {
        const emulator = await emulatorFor(assembly)
        const adapter = emulator as unknown as {
            _prepareBuild(sources: BuildSources): Promise<void>
        }
        const prepare = adapter._prepareBuild
        const hung = vi.fn(() => new Promise<void>(() => {}))
        adapter._prepareBuild = hung
        let settled = false
        void emulator.compile(0, assembly).finally(() => (settled = true))
        await vi.waitFor(() => expect(hung).toHaveBeenCalledOnce())
        emulator.clear()
        await vi.waitFor(() => expect(settled).toBe(true))
        adapter._prepareBuild = prepare
        await emulator.compile(0, assembly)
        expect(emulator.canExecute).toBe(true)
    })
})
