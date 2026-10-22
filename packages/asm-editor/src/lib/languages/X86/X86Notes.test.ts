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
        //AVX-512, which the Core does not run: AVX and AVX2 it does
        const emulator = await ranInto('vaddps zmm0, zmm1, zmm2')
        expect(emulator.termination).toMatchObject({ kind: 'signal', name: 'SIGILL' })
        expect(texts(emulator)).toEqual([
            `The program ran \`vaddps zmm0, zmm1, zmm2\` at \`0x${emulator.pc.toString(16)}\`. AVX-512 instructions are not currently supported.`
        ])
        expect(emulator.notes[0].tone).toBe('warning')
        expect(emulator.termination).toMatchObject({
            unsupported: 'AVX-512 instructions are not currently supported'
        })
    })

    it('is noted when a Step ends the program there, and again after an Undo and a Step', async () => {
        const sources = assembledSources(
            'global _start\nsection .text\n_start:\n    nop\n    vaddps zmm0, zmm1, zmm2\n'
        )
        const emulator = await emulatorFor(sources)
        await emulator.compile(100, sources)
        await emulator.step()
        expect(emulator.notes).toEqual([])
        await emulator.step()
        expect(emulator.termination).toMatchObject({ kind: 'signal', name: 'SIGILL' })
        const note = `The program ran \`vaddps zmm0, zmm1, zmm2\` at \`0x${emulator.pc.toString(16)}\`. AVX-512 instructions are not currently supported.`
        expect(texts(emulator)).toEqual([note])
        //an Undo takes the end back, and the Step that ends it again says it again, once
        emulator.undo()
        expect(emulator.terminated).toBe(false)
        await emulator.step()
        expect(emulator.terminated).toBe(true)
        expect(texts(emulator)).toEqual([note, note])
    })

    /** A Run of a program whose first instruction is this one. */
    async function ranInto(instruction: string) {
        const sources = assembledSources(
            `global _start\nsection .text\n_start:\n    ${instruction}\n`
        )
        const emulator = await emulatorFor(sources)
        await emulator.compile(0, sources)
        await emulator.run(0)
        return emulator
    }

    it('says AVX-512 for an EVEX encoding, after segment and address-size prefixes too', async () => {
        //each as written, and as the note names it
        const instructions = [
            ['vaddps zmm0, zmm1, zmm2', 'vaddps zmm0, zmm1, zmm2'],
            ['vmovdqu32 zmm0, [rax]', 'vmovdqu32 zmm0, zword [rax]'],
            //64 62 and 65 67 62
            ['fs vaddps zmm0, zmm1, zmm2', 'vaddps zmm0, zmm1, zmm2'],
            ['gs a32 vmovdqu32 zmm0, [eax]', 'vmovdqu32 zmm0, zword gs:[eax]']
        ]
        for (const [source, decoded] of instructions) {
            const emulator = await ranInto(source)
            expect(emulator.termination, source).toEqual({
                kind: 'signal',
                number: 4,
                name: 'SIGILL',
                description: 'Illegal instruction',
                unsupported: 'AVX-512 instructions are not currently supported'
            })
            expect(texts(emulator), source).toEqual([
                `The program ran \`${decoded}\` at \`0x${emulator.pc.toString(16)}\`. AVX-512 instructions are not currently supported.`
            ])
        }
    })

    it('says APX for an APX instruction, in EVEX map 4 or after REX2', async () => {
        //push2 and the three-operand mul are EVEX map 4, jmpabs is D5 (REX2)
        for (const source of ['push2 rax, rbx', 'mul eax, ebx, ecx', 'jmpabs 0x401000']) {
            const emulator = await ranInto(source)
            expect(emulator.termination, source).toEqual({
                kind: 'signal',
                number: 4,
                name: 'SIGILL',
                description: 'Illegal instruction',
                unsupported: 'APX instructions are not currently supported'
            })
            //the decoder reads no APX instruction, so the Log has no text to name one by
            expect(emulator.notes, source).toEqual([])
        }
    })

    it('names the extension of a VEX instruction the Core does not run', async () => {
        //each as written, as the note names it, and its extension
        const instructions = [
            //VAES: the 128-bit vaesenc runs
            [
                'vaesenc ymm0, ymm1, ymm2',
                'vaesenc ymm0, ymm1, ymm2',
                '256-bit AES and carry-less multiplication instructions are not currently supported'
            ],
            //the AVX-512 mask instructions are VEX
            ['kmovw k1, eax', 'kmovw k1, eax', 'AVX-512 instructions are not currently supported'],
            [
                'vgf2p8affineqb xmm0, xmm1, xmm2, 0',
                'vgf2p8affineqb xmm0, xmm1, xmm2, 0x00',
                'GFNI instructions are not currently supported'
            ]
        ]
        for (const [source, decoded, unsupported] of instructions) {
            const emulator = await ranInto(source)
            expect(emulator.termination, source).toMatchObject({ name: 'SIGILL', unsupported })
            expect(texts(emulator), source).toEqual([
                `The program ran \`${decoded}\` at \`0x${emulator.pc.toString(16)}\`. ${unsupported}.`
            ])
        }
    })

    it('runs the VEX instructions, and keeps the signal for an encoding no processor accepts', async () => {
        const emulator = await ranInto('vaddps ymm0, ymm1, ymm2')
        //it runs, and the program then falls off the end of its code
        expect(emulator.termination).toMatchObject({ name: 'SIGSEGV' })
        //66 0F 38 00 is pshufb; as VEX with no prefix it is nothing
        const invalid = await ranInto('db 0xc4, 0xe2, 0x78, 0x00, 0xc1')
        expect(invalid.termination).toEqual({
            kind: 'signal',
            number: 4,
            name: 'SIGILL',
            description: 'Illegal instruction'
        })
    })

    it('keeps the signal for an instruction of another extension', async () => {
        //AES-NI, which the Core does not run either: 66 0F 38 DC
        const emulator = await ranInto('aesenc xmm0, xmm1')
        expect(emulator.termination).toEqual({
            kind: 'signal',
            number: 4,
            name: 'SIGILL',
            description: 'Illegal instruction'
        })
        expect(texts(emulator)).toEqual([
            `The program ran \`aesenc xmm0, xmm1\` at \`0x${emulator.pc.toString(16)}\`, which the emulator does not support`
        ])
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
            const emulator = await ranInto(instruction)
            expect(emulator.termination, instruction).toEqual({
                kind: 'signal',
                number: 4,
                name: 'SIGILL',
                description: 'Illegal instruction'
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
