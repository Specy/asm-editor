/**
 * A C++ Executable whose demangler does not load, offline after a deploy for instance: the Build
 * goes on and the debug tools and the memory view show the raw names, as before demangling
 * ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md), decision 12).
 */
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import type { BuildSources } from '#lib/projectFiles.ts'
import { X86Emulator } from './X86Emulator.svelte'

vi.mock('#lib/languages/demangle/loadDemangler.ts', async (original) => ({
    ...(await original<typeof import('#lib/languages/demangle/loadDemangler.ts')>()),
    loadDemangler: () => Promise.reject(new Error('Failed to fetch dynamically imported module')),
    loadedDemangler: () => undefined
}))

const emulators: { dispose(): void }[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

it('shows raw names when the demangler does not load', async () => {
    const bytes = readFileSync(
        new URL('../../../../../x86/blink-js/tests/fixtures/elf/cpp', import.meta.url)
    )
    const sources: BuildSources = {
        entry: 'cpp',
        files: { cpp: { encoding: 'base64', content: Buffer.from(bytes).toString('base64') } }
    }
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    emulators.push(emulator)
    await emulator.compile(100_000, sources)
    expect(emulator.errors).toEqual([])
    expect(emulator.canExecute).toBe(true)
    await emulator.listings!.session.get('cpp')!.ready
    const cout = emulator.dataLabels.find((label) => label.name === '_ZSt4cout@GLIBCXX_3.4')
    expect(cout).toBeDefined()
    expect(cout!.displayName).toBeUndefined()
    // main's first call, into `std::string`'s constructor, which the Step enters
    const constructor = '_ZNSt7__cxx1112basic_stringIcSt11char_traitsIcESaIcEEC1IS3_EEPKcRKS3_'
    for (let i = 0; i < 100 && emulator.callStack.at(-1)?.name === 'main'; i++)
        await emulator.step()
    expect(emulator.callStack.at(-1)).toMatchObject({ name: constructor, file: 'cpp' })
    expect(emulator.callStack.every((frame) => frame.detail === undefined)).toBe(true)
})
