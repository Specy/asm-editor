import { readFileSync } from 'node:fs'
import { expect, it } from 'vite-plus/test'
import { bytesFile } from './projectFiles'
import { executableKind } from './executables'
import { makeProjectFromExecutable } from './executableImport'
import { X86Emulator } from './languages/X86/X86Emulator.svelte'
import { analyzeX86Project } from './languages/service/adapters/x86Adapter'

const fixture = (name: string) =>
    new Uint8Array(
        readFileSync(new URL(`../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url))
    )

it('recognises every executable fixture regardless of file name', () => {
    for (const name of [
        'crackme',
        'crackme-stripped',
        'crackme-static',
        'crackme-static-pie',
        'hello-atexit',
        'hello-atexit-static',
        'hello-atexit-static-pie',
        'math',
        'cpp',
        'argv-env',
        'ptrace',
        'self-write',
        'crackme-argv',
        'overflow',
        'avx'
    ])
        expect(executableKind(bytesFile(fixture(name))), name).toBe('supported')
    expect(executableKind(bytesFile(Uint8Array.of(1, 2, 3)))).toBe('none')
    const bytes = fixture('crackme')
    expect(executableKind(bytesFile(bytes.subarray(0, 25)))).toEqual({
        unsupported: 'a truncated ELF file'
    })
    const arm = bytes.slice()
    new DataView(arm.buffer).setUint16(18, 40, true)
    expect(executableKind(bytesFile(arm))).toMatchObject({
        unsupported: expect.stringContaining('ARM')
    })
    const class32 = bytes.slice()
    class32[4] = 1
    expect(executableKind(bytesFile(class32))).toMatchObject({
        unsupported: expect.stringContaining('32-bit')
    })
})

it('imports an extensionless Executable as the sole File and Entry of an x86 Project', () => {
    const bytes = fixture('crackme')
    const imported = makeProjectFromExecutable(bytes, 'chall')!
    expect(imported.project.language).toBe('X86')
    expect(imported.project.name).toBe('chall')
    expect(imported.project.entry).toBe('chall')
    expect(Object.keys(imported.project.files)).toEqual(['chall'])
    expect(makeProjectFromExecutable(new TextEncoder().encode('nop'), 'source.asm')).toBeUndefined()
    expect(() => makeProjectFromExecutable(bytes.subarray(0, 25), 'broken')).toThrow(/truncated/)
})

it('keeps live checking free of NASM diagnostics and builds the crackme on the Core', async () => {
    const sources = { entry: 'crackme', files: { crackme: bytesFile(fixture('crackme')) } }
    const snapshot = await analyzeX86Project(sources, 'test', 1)
    expect(snapshot.diagnostics).toEqual([])
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    try {
        await emulator.compile(100, sources)
        expect(emulator.errors).toEqual([])
        expect(emulator.pc).toBeGreaterThan(0x7ffff0000000n)
        expect(emulator.canExecute).toBe(true)
    } finally {
        emulator.dispose()
    }
})

it('reports the same unsupported reason during live checking and Build', async () => {
    const sources = {
        entry: 'broken',
        files: { broken: bytesFile(fixture('crackme').subarray(0, 25)) }
    }
    expect((await analyzeX86Project(sources, 'test', 1)).diagnostics[0].message).toContain(
        'truncated'
    )
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    try {
        await expect(emulator.compile(100, sources)).rejects.toThrow(/truncated/)
        expect(emulator.compilerErrors[0].message).toContain('truncated')
    } finally {
        emulator.dispose()
    }
})
