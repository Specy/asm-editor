/**
 * What the Log notes about an x86 program's run beyond its output and its exit: a system call the
 * Core does not implement, an instruction it cannot run, a library it does not bundle, and a start
 * that never reached `main` ([binary-import.md](../../../../../../docs/design/binary-import.md),
 * decision 17, milestone M12 of the plan).
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { analyze } from '@specy/x86/elf'
import type { BuildSources } from '#lib/projectFiles.ts'
import { functionAtLine, instructionAddressAt } from '#lib/listing/listing.ts'
import { PIE_LOAD_BASE } from '#lib/listing/listingPaths.ts'
import { X86Emulator } from './X86Emulator.svelte'

const fixtureBytes = (name: string) =>
    new Uint8Array(
        readFileSync(
            new URL(`../../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
        )
    )

function executableSources(name: string, bytes = fixtureBytes(name)): BuildSources {
    const content = Buffer.from(bytes).toString('base64')
    return { entry: name, files: { [name]: { encoding: 'base64', content } } }
}

function assembledSources(code: string): BuildSources {
    return { entry: 'main.asm', files: { 'main.asm': { encoding: 'plain', content: code } } }
}

const emulators: { dispose(): void }[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

async function emulatorFor(sources: BuildSources, programArguments?: string) {
    const emulator = await X86Emulator(sources, { automaticChecking: false, programArguments })
    emulators.push(emulator)
    return emulator
}

const texts = (emulator: { notes: readonly { text: string }[] }) =>
    emulator.notes.map((note) => note.text)

describe('a system call the Core does not implement', () => {
    //getcpu (309) twice, then a number Linux has never had, then getcpu again
    const code = [
        'global _start',
        'section .text',
        '_start:',
        '    mov eax, 309',
        '    syscall',
        '    mov eax, 309',
        '    syscall',
        '    mov eax, 999',
        '    syscall',
        '    mov r12, rax',
        '    mov eax, 309',
        '    syscall',
        '    mov eax, 60',
        '    xor edi, edi',
        '    syscall'
    ].join('\n')

    it('is noted the first time each number is called in a run', async () => {
        const sources = assembledSources(code)
        const emulator = await emulatorFor(sources)
        await emulator.compile(1000, sources)
        expect(emulator.notes).toEqual([])
        await emulator.run(0)
        expect(emulator.terminated).toBe(true)
        expect(emulator.notes).toEqual([
            {
                id: expect.any(Number),
                tone: 'warning',
                text: '`getcpu` (syscall 309) is not implemented; the call returned ENOSYS'
            },
            {
                id: expect.any(Number),
                tone: 'warning',
                text: '`syscall_999` (syscall 999) is not implemented; the call returned ENOSYS'
            }
        ])
        //the program saw ENOSYS, as Linux answers a call it does not have
        expect(emulator.registers.find((register) => register.name === 'r12')?.value).toBe(
            BigInt.asUintN(64, -38n)
        )
    })

    it('is noted again in the next run, and never by a Step that does not reach it', async () => {
        const sources = assembledSources(code)
        const emulator = await emulatorFor(sources)
        await emulator.compile(1000, sources)
        await emulator.step()
        expect(emulator.notes).toEqual([])
        await emulator.step()
        expect(texts(emulator)).toEqual([
            '`getcpu` (syscall 309) is not implemented; the call returned ENOSYS'
        ])
        const first = emulator.notes[0].id
        await emulator.compile(1000, sources)
        expect(emulator.notes).toEqual([])
        await emulator.run(0)
        expect(emulator.notes).toHaveLength(2)
        //ids keep growing across runs, so a reader knows what is new
        expect(emulator.notes[0].id).toBeGreaterThan(first)
    })
})

describe('an instruction the Core cannot run', () => {
    it('is named with its address when the program ends on SIGILL there', async () => {
        //the fixture calls its AVX2 function only with more than four Arguments
        const sources = executableSources('avx')
        const emulator = await emulatorFor(sources, '1 2 3 4 5')
        await emulator.compile(0, sources)
        await emulator.run(0)
        expect(emulator.termination).toMatchObject({ kind: 'signal', name: 'SIGILL' })
        //the first AVX instruction of `vector_sum`, where the Listing has it
        const listing = emulator.listings!.session.get('avx')!.listing!
        const line = listing.text.split('\n').findIndex((text) => text.trim() === 'vmovd xmm0, edi')
        const address = PIE_LOAD_BASE + instructionAddressAt(listing, line)!
        expect(functionAtLine(listing, line)?.name).toBe('vector_sum')
        expect(emulator.pc).toBe(BigInt(address))
        expect(texts(emulator)).toEqual([
            `The program ran \`vmovd xmm0, edi\` at \`0x${address.toString(16)}\`, which the emulator does not support`
        ])
        expect(emulator.notes[0].tone).toBe('warning')
    })

    it('is noted when a Step ends the program there, and again after an Undo and a Step', async () => {
        const sources = executableSources('avx')
        const emulator = await emulatorFor(sources, '1 2 3 4 5')
        await emulator.compile(100, sources)
        const listing = emulator.listings!.session.get('avx')!.listing!
        const line = listing.text.split('\n').findIndex((text) => text.trim() === 'vmovd xmm0, edi')
        const address = instructionAddressAt(listing, line)!
        const note = `The program ran \`vmovd xmm0, edi\` at \`0x${(PIE_LOAD_BASE + address).toString(16)}\`, which the emulator does not support`
        emulator.toggleAddressBreakpoint(address, 'avx')
        await emulator.run(0)
        expect(emulator.line).toBe(line)
        expect(emulator.notes).toEqual([])
        await emulator.step()
        expect(emulator.termination).toMatchObject({ kind: 'signal', name: 'SIGILL' })
        expect(texts(emulator)).toEqual([note])
        //an Undo takes the end back, and the Step that ends it again says it again, once
        emulator.undo()
        expect(emulator.terminated).toBe(false)
        await emulator.step()
        expect(emulator.terminated).toBe(true)
        expect(texts(emulator)).toEqual([note, note])
    })

    it('is not noted for a program that runs no such instruction', async () => {
        const sources = executableSources('avx')
        const emulator = await emulatorFor(sources)
        await emulator.compile(0, sources)
        await emulator.run(0)
        expect(emulator.termination).toEqual({ kind: 'exit', code: 0 })
        expect(emulator.stdOut).toBe('value=1\n')
        expect(emulator.notes).toEqual([])
    })

    it('is not noted for ud2 or bytes that are no instruction, which fail on any processor', async () => {
        for (const instruction of ['ud2', 'db 0x06']) {
            const sources = assembledSources(
                `global _start\nsection .text\n_start:\n    ${instruction}\n`
            )
            const emulator = await emulatorFor(sources)
            await emulator.compile(0, sources)
            await emulator.run(0)
            expect(emulator.termination, instruction).toMatchObject({
                kind: 'signal',
                name: 'SIGILL'
            })
            expect(emulator.notes, instruction).toEqual([])
        }
    })
})

describe('a library the Core does not bundle', () => {
    it('is noted at Build, beside its warning Diagnostic', async () => {
        //crackme needing libcrypt.so.6 instead of libc.so.6: the same length, so nothing moves
        const bytes = fixtureBytes('crackme')
        const name = new TextEncoder().encode('libc.so.6\0')
        const at = bytes.findIndex((_, i) => name.every((byte, j) => bytes[i + j] === byte))
        bytes.set(new TextEncoder().encode('libz.so.6'), at)
        expect(analyze(bytes).needed).toEqual(['libz.so.6'])
        const sources = executableSources('crackme', bytes)
        const emulator = await emulatorFor(sources)
        await emulator.compile(0, sources)
        expect(texts(emulator)).toEqual(['libz.so.6 is not one of the bundled libraries'])
        expect(emulator.compilerDiagnostics).toEqual([
            expect.objectContaining({
                severity: 'warning',
                message: 'libz.so.6 is not one of the bundled libraries'
            })
        ])
        //the dynamic linker then fails with its own message
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('libz.so.6')
    })
})

describe('a start that never reaches main', () => {
    it('is noted by the Build that ran out of instructions', async () => {
        // `_start` made a loop, `jmp $`, in place of its `endbr64`
        const bytes = fixtureBytes('crackme')
        const info = analyze(bytes)
        const text = info.programHeaders.find(
            (header) =>
                header.type === 1 &&
                info.entry >= header.address &&
                info.entry < header.address + BigInt(header.fileSize)
        )!
        const entry = Number(info.entry - text.address) + text.offset
        bytes.set([0xeb, 0xfe, 0x90, 0x90], entry)
        const sources = executableSources('loop', bytes)
        const emulator = await emulatorFor(sources)
        ;(emulator as unknown as { programStartLimit: number }).programStartLimit = 200_000
        await emulator.compile(0, sources)
        expect(emulator.canExecute).toBe(true)
        expect(emulator.terminated).toBe(false)
        expect(emulator.notes).toEqual([
            {
                id: expect.any(Number),
                tone: 'warning',
                text: 'The program did not reach main within 200,000 instructions'
            }
        ])
    })
})
