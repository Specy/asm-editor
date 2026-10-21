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
})
