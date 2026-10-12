/**
 * The memory region of a program's Arguments, through each Emulator and its real Core: where the
 * Core stored them at the start, above the stack, named part by part as data labels
 * ([memory-regions.md](../../../../../docs/design/memory-regions.md), decision 15).
 */
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { BuildSources } from '#lib/projectFiles.ts'
import { MIPSEmulator } from './MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from './RISC-V/RISC-VEmulator.svelte'
import { X86Emulator } from './X86/X86Emulator.svelte'
import { memoryHover, regionChunkStart } from './memoryRegions'
import type { Emulator } from './Emulator'

const ARGUMENTS = 'hello "two words"'
const STACK_POINTER = 0x7fffeffcn
const STACK_BASE = 0x7ffffffcn
const X86_STACK_TOP = 0x7ffffffff000n

const emulators: { dispose(): void }[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))

const plain = (code: string, entry: string): BuildSources => ({
    entry,
    files: { [entry]: { encoding: 'plain', content: code } }
})

function argumentsRegion(emulator: Emulator) {
    return emulator.memoryRegions.find((region) => region.kind === 'arguments')
}
function argumentLabels(emulator: Emulator) {
    const region = argumentsRegion(emulator)
    return emulator.dataLabels.filter((label) => label.section === region?.name)
}
const qword = (emulator: Emulator, address: bigint) => {
    const bytes = emulator.readMemoryBytes(address, 8)
    return new DataView(bytes.buffer, bytes.byteOffset, 8).getBigUint64(0, true)
}

type Target = 'MIPS' | 'RISC-V' | 'RISC-V-64'
/** Overwrites argv[0]'s pointer and argv[1]'s first byte, then exits. */
const OVERWRITE: Record<Target, string> = {
    MIPS: 'main: lw $t0, 4($a1)\n      sb $zero, 0($t0)\n      sw $zero, 0($a1)\n      li $v0, 10\n      syscall\n',
    'RISC-V':
        'main: lw t0, 4(a1)\n      sb zero, 0(t0)\n      sw zero, 0(a1)\n      li a7, 10\n      ecall\n',
    'RISC-V-64':
        'main: ld t0, 8(a1)\n      sb zero, 0(t0)\n      sd zero, 0(a1)\n      li a7, 10\n      ecall\n'
}

describe.each(['MIPS', 'RISC-V', 'RISC-V-64'] as const)('%s', (target) => {
    async function emulatorFor(sources: BuildSources, programArguments?: string) {
        const options = { automaticChecking: false, programArguments }
        const emulator =
            target === 'MIPS'
                ? MIPSEmulator(sources, options)
                : RISCVEmulator(sources, { ...options, language: target })
        emulators.push(emulator)
        return emulator as Emulator
    }
    const argv = target === 'RISC-V-64' ? 0x7fffffc0n : 0x7fffffd4n

    it('shows the Arguments above the stack, labelled argv and argv[i], and keeps them', async () => {
        const sources = plain(OVERWRITE[target], 'main.s')
        const emulator = await emulatorFor(sources, ARGUMENTS)
        expect(emulator.memoryRegions).toEqual([])
        await emulator.compile(100, sources)
        const region = argumentsRegion(emulator)!
        expect(region).toMatchObject({ name: 'Arguments', start: argv, end: STACK_BASE })
        expect(argumentLabels(emulator).map((label) => [label.name, label.address])).toEqual([
            ['argv', argv],
            ['argv[0]', 0x7fffffe5n],
            ['argv[1]', 0x7fffffecn],
            ['argv[2]', 0x7ffffff2n]
        ])
        expect(argumentLabels(emulator).map((label) => label.preview)).toEqual([
            undefined,
            './main',
            'hello',
            'two words'
        ])
        expect(argumentLabels(emulator).every((label) => !label.fromLibrary)).toBe(true)
        const hover = (address: bigint) =>
            memoryHover(emulator.memoryRegions, emulator.dataLabels, address)
        expect(hover(0x7fffffecn)).toBe('Arguments · argv[1]')
        expect(hover(0x7fffffeen)).toBe('Arguments · argv[1]+2')
        expect(hover(argv + 4n)).toBe('Arguments · argv+4')
        expect(regionChunkStart(region, emulator.dataLabels, 0x7ffffff0n)).toBe(0x7fffffecn)
        expect(emulator.resolveMemoryLabel('argv[2]')).toBe(0x7ffffff2n)
        //the stack stays from the stack pointer to its top, the 16 bytes above it in neither
        const stack = emulator.memoryRegions.find((candidate) => candidate.kind === 'stack')!
        expect([stack.start, stack.end]).toEqual([STACK_POINTER, STACK_POINTER])
        expect(hover(STACK_POINTER + 8n)).toBe('')

        await emulator.run(1000)
        expect(emulator.terminated).toBe(true)
        expect(emulator.readMemoryBytes(0x7fffffecn, 1)[0]).toBe(0)
        expect(argumentsRegion(emulator)).toEqual(region)
        expect(argumentLabels(emulator).map((label) => label.preview)[2]).toBe('hello')
        emulator.clear()
        expect(argumentsRegion(emulator)).toBeUndefined()
        expect(emulator.dataLabels).toEqual([])
    })

    it('names argv[0] alone without Arguments, and follows the next Build', async () => {
        const sources = plain(OVERWRITE[target], 'src/game.s')
        const emulator = await emulatorFor(sources)
        await emulator.compile(0, sources)
        expect(argumentLabels(emulator).map((label) => [label.name, label.preview])).toEqual([
            ['argv', undefined],
            ['argv[0]', './src/game']
        ])
        emulator.setProgramArguments('again')
        await emulator.compile(0, sources)
        expect(argumentLabels(emulator).map((label) => label.preview)).toEqual([
            undefined,
            './src/game',
            'again'
        ])
    })
})

describe('x86', () => {
    const fixture = (name: string) =>
        readFileSync(
            new URL(`../../../../x86/blink-js/tests/fixtures/elf/${name}`, import.meta.url)
        )
    async function emulatorFor(sources: BuildSources, programArguments?: string) {
        const emulator = await X86Emulator(sources, { automaticChecking: false, programArguments })
        emulators.push(emulator)
        return emulator as Emulator
    }
    const NAMES = [
        'argc',
        'argv',
        'envp',
        'auxv',
        'argv[0]',
        'argv[1]',
        'argv[2]',
        ...Array.from({ length: 8 }, (_, i) => `envp[${i}]`),
        'AT_EXECFN',
        'AT_RANDOM',
        'filename'
    ]

    it('shows the process-start block of an assembled program above its stack', async () => {
        const sources = plain(
            'global _start\nsection .text\n_start:\n    mov rsi, [rsp+16]\n    mov byte [rsi], 0\n    mov eax, 60\n    xor edi, edi\n    syscall\n',
            'main.asm'
        )
        const emulator = await emulatorFor(sources, ARGUMENTS)
        await emulator.compile(100, sources)
        const region = argumentsRegion(emulator)!
        expect(region).toMatchObject({
            name: 'Arguments and environment',
            start: emulator.sp,
            end: X86_STACK_TOP
        })
        expect(qword(emulator, region.start)).toBe(3n)
        const labels = argumentLabels(emulator)
        expect(labels.map((label) => label.name)).toEqual(NAMES)
        const named = (name: string) => labels.find((label) => label.name === name)!
        expect(named('argc').address).toBe(region.start)
        expect(named('argv').address).toBe(region.start + 8n)
        expect(named('envp').address).toBe(region.start + 40n)
        expect(qword(emulator, named('argv').address + 8n)).toBe(named('argv[1]').address)
        expect(
            ['argv[0]', 'argv[1]', 'argv[2]', 'envp[0]', 'AT_EXECFN', 'filename'].map(
                (name) => named(name).preview
            )
        ).toEqual([
            './main',
            'hello',
            'two words',
            'PATH=/usr/local/bin:/usr…',
            '/program',
            '/program'
        ])
        expect(named('AT_RANDOM').preview).toBeUndefined()
        const hover = (address: bigint) =>
            memoryHover(emulator.memoryRegions, emulator.dataLabels, address)
        expect(hover(named('argv[1]').address + 2n)).toBe('Arguments and environment · argv[1]+2')
        expect(hover(region.start)).toBe('Arguments and environment · argc')
        expect(hover(named('envp').address + 8n)).toBe('Arguments and environment · envp+8')
        //the stack's top is where the block starts
        const stack = emulator.memoryRegions.find((candidate) => candidate.kind === 'stack')!
        expect(stack.end).toBe(region.start)

        await emulator.run(1000)
        expect(emulator.terminated).toBe(true)
        expect(argumentsRegion(emulator)).toEqual(region)
        expect(named('argv[1]').preview).toBe('hello')
    })

    it('shows the block an Executable started with after its Build ran it to main', async () => {
        const content = Buffer.from(fixture('argv-env')).toString('base64')
        const sources: BuildSources = {
            entry: 'argv-env',
            files: { 'argv-env': { encoding: 'base64', content } }
        }
        const emulator = await emulatorFor(sources, ARGUMENTS)
        await emulator.compile(0, sources)
        const region = argumentsRegion(emulator)!
        expect(region.name).toBe('Arguments and environment')
        expect(region.end).toBe(X86_STACK_TOP)
        //main runs on a stack the C library's start has already used
        expect(emulator.sp).toBeLessThan(region.start)
        expect(qword(emulator, region.start)).toBe(3n)
        const labels = argumentLabels(emulator)
        expect(labels.map((label) => label.name)).toEqual(NAMES)
        expect(labels.slice(4, 7).map((label) => label.preview)).toEqual([
            './argv-env',
            'hello',
            'two words'
        ])
        await emulator.run(1_000_000)
        expect(emulator.stdOut).toContain('argv[2]=two words\n')
        expect(argumentsRegion(emulator)).toEqual(region)
        emulator.clear()
        expect(argumentsRegion(emulator)).toBeUndefined()
    })
})
