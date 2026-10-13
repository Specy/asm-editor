import { readFileSync } from 'node:fs'
import { expect, it } from 'vite-plus/test'
import { bytesFile } from './projectFiles'
import { executableKind, startsWithElfMagic } from './executables'
import { importFile, makeProjectFromExecutable } from './executableImport'
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
        'timedwait',
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
        // the Build ran the dynamic linker and stopped at main, in the program at gdb's PIE base
        expect(emulator.pc).toBe(0x5555555551e9n)
        expect(emulator.currentFile).toBe('crackme')
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

it('recognises an ELF from its first bytes, whatever the encoding, and only then analyses it', () => {
    const crackme = fixture('crackme')
    expect(startsWithElfMagic(crackme)).toBe(true)
    expect(startsWithElfMagic(bytesFile(crackme))).toBe(true)
    // A File that happens to be text, starting with the magic, is still read by its bytes.
    expect(startsWithElfMagic({ encoding: 'plain', content: '\x7fELF' })).toBe(true)
    expect(executableKind({ encoding: 'plain', content: '\x7fELF' })).toMatchObject({
        unsupported: expect.stringContaining('truncated')
    })
    expect(startsWithElfMagic(bytesFile(new TextEncoder().encode('mov eax, 1')))).toBe(false)
    expect(startsWithElfMagic({ encoding: 'base64', content: 'f0VM' })).toBe(false)
    expect(executableKind(crackme)).toBe('supported')
    // The same content in a new File object, as a snapshot makes, is the same answer.
    const file = bytesFile(crackme)
    expect(executableKind({ ...file })).toBe(executableKind(file))
})

it('reads an import as an Executable before a Project archive or text, by its bytes', async () => {
    const crackme = await importFile(fixture('crackme'), 'chall.zip')
    expect(crackme).toMatchObject({ executable: true, archive: false })
    expect(crackme.imported.project.entry).toBe('chall.zip')
    const text = await importFile(new TextEncoder().encode('mov eax, 1'), 'main.asm')
    expect(text).toMatchObject({ executable: false, archive: false })
    await expect(importFile(fixture('crackme').subarray(0, 25), 'broken')).rejects.toThrow(
        /truncated/
    )
})

it('refuses an import that is no text, Project archive or Executable', async () => {
    //a PNG's signature and header: not UTF-8, and no ELF or zip
    const png = Uint8Array.from([
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d, 0x49, 0x48, 0x44, 0x52
    ])
    await expect(importFile(png, 'picture.png')).rejects.toThrow(
        'picture.png is not a Project: it is neither text, a Project archive nor an x86-64 Linux executable'
    )
    //valid UTF-8 that holds NUL characters is no text either
    await expect(importFile(new Uint8Array([0x6d, 0, 0, 0x6f]), 'data.bin')).rejects.toThrow(
        /not a Project/
    )
    //text that is not ASCII still imports
    const text = await importFile(new TextEncoder().encode('; héllo\nmov eax, 1'), 'main.asm')
    expect(text.imported.project.files[text.imported.project.entry]).toMatchObject({
        encoding: 'plain'
    })
})

it('builds an Executable Entry even when assembly sources could not be resolved', async () => {
    const sources = {
        entry: 'crackme',
        files: { crackme: bytesFile(fixture('crackme')) },
        assemblyError: 'Generated assembly needs a Runtime library x86 does not have'
    }
    const snapshot = await analyzeX86Project(sources, 'test', 1)
    expect(snapshot.diagnostics).toEqual([])
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    try {
        await emulator.compile(100, sources)
        expect(emulator.compilerErrors).toEqual([])
        expect(emulator.canExecute).toBe(true)
    } finally {
        emulator.dispose()
    }
})

it('warns about each library the Executable needs that is not bundled', async () => {
    const bytes = fixture('crackme').slice()
    const name = new TextEncoder().encode('libc.so.6')
    const at = bytes.findIndex((_, i) => name.every((byte, j) => bytes[i + j] === byte))
    bytes.set(new TextEncoder().encode('libx.so.6'), at)
    const sources = { entry: 'chall', files: { chall: bytesFile(bytes) } }
    const emulator = await X86Emulator(sources, { automaticChecking: false })
    try {
        await emulator.compile(100, sources)
        expect(emulator.compilerErrors).toEqual([])
        expect(emulator.compilerDiagnostics).toEqual([
            expect.objectContaining({
                severity: 'warning',
                message: 'libx.so.6 is not one of the bundled libraries'
            })
        ])
    } finally {
        emulator.dispose()
    }
})
