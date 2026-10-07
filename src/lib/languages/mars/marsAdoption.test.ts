import { afterEach, describe, expect, it } from 'vitest'
import { isRuntimeError as isMipsRuntimeError } from '@specy/mips'
import { isRuntimeError as isRiscVRuntimeError } from '@specy/risc-v'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { InterpreterStatus } from '$lib/languages/commonLanguageFeatures.svelte'
import { RandomSource } from '$lib/languages/peripherals/RandomSource'
import { Prompt } from '$stores/promptStore.svelte'
import type { BuildInput } from '$lib/projectFiles'
import type { Testcase } from '$lib/Project.svelte'

/** The editor boundary against the locally linked MARS/RARS 4.0.0 APIs. */
describe.each(['MIPS', 'RISC-V', 'RISC-V-64'] as const)('%s reference services', (language) => {
    const mips = language === 'MIPS'
    const reg = (name: string) => (mips ? `$${name}` : name)
    const call = (code: number) =>
        `li ${mips ? '$v0' : 'a7'}, ${code}\n${mips ? 'syscall' : 'ecall'}\n`
    const exit = call(10)
    const program = (body: string, data = '') =>
        `${data ? `.data\n${data}\n` : ''}.text\nmain:\n${body}`
    const make = (sources: BuildInput, random = new RandomSource({ mode: 'host' })) =>
        mips
            ? MIPSEmulator(sources, { peripherals: { random } })
            : RISCVEmulator(sources, { language, peripherals: { random } })
    type Emulator = ReturnType<typeof make>
    const emulators: Emulator[] = []
    async function built(sources: BuildInput, random?: RandomSource) {
        const emulator = make(sources, random)
        emulators.push(emulator)
        await emulator.check()
        await emulator.compile(200, sources)
        expect(emulator.compilerErrors).toEqual([])
        return emulator
    }
    const value = (emulator: Emulator, name: string) =>
        emulator.registers.find((r) => r.name === reg(name))!.value
    const resultRegister = mips ? 'v0' : 'a0'
    const history = (emulator: Emulator) =>
        emulator._getUndoHistory(200).flatMap((step) => step.mutations)
    afterEach(() => {
        Prompt.cancel()
        for (const emulator of emulators.splice(0)) emulator.dispose()
    })

    it('formats floats and doubles in the Core and carries UTF-8 text', async () => {
        const body = `lwc1 $f12, single\n${call(2)}la $a0, text\n${call(4)}ldc1 $f12, precise\n${call(3)}`
        const rv = `flw fa0, single, t0\n${call(2)}la a0, text\n${call(4)}fld fa0, precise, t0\n${call(3)}`
        const emulator = await built(
            program(
                (mips ? body : rv) + exit,
                'single: .float 0.1\n.align 3\nprecise: .double 1.0e-5\ntext: .asciz " café 😀 "'
            )
        )
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('0.1 café 😀 1.0E-5')
    })

    it('preserves typed RuntimeError identity and its included-file location', async () => {
        const source = call(5)
        const sources = {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain' as const, content: '.include "read.s"\n' },
                'read.s': { encoding: 'plain' as const, content: program(source + exit) }
            }
        }
        const emulator = await built(sources)
        emulator.peripherals.terminal.useScriptedInput(['3.7'])
        await emulator._step()
        const error = await emulator._step().catch((error: unknown) => error)
        expect((mips ? isMipsRuntimeError : isRiscVRuntimeError)(error)).toBe(true)
        expect(error).toMatchObject({
            kind: 'syscall',
            sourcePath: 'read.s',
            line: 4,
            address: 0x400004
        })
        expect(emulator._stringifyError(error)).toContain('Error in read.s line 4:')
        expect(emulator._stringifyError(error)).toContain('invalid integer input (syscall 5)')
        expect(emulator._getLastInstruction()).toMatchObject({ file: 'read.s', lineNumber: 3 })
    })

    it('stops a failed Step at the fault and lets Undo recover it', async () => {
        const emulator = await built(program(call(5) + exit))
        emulator.peripherals.terminal.useScriptedInput([''])
        await emulator.step()
        await expect(emulator.step()).rejects.toThrow('invalid integer input')
        expect(emulator.termination).toEqual({ kind: 'error', message: emulator.errors[0] })
        expect(emulator.line).toBe(3)
        expect(await emulator.step()).toBe(false)
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.terminated).toBe(false)
    })

    it('shows the signed exit code and its own history entry, then undoes and repeats it', async () => {
        const emulator = await built(
            program(`li ${reg('a0')}, -7\n` + call(mips ? 17 : 93) + `li ${reg('s0')}, 99\n`)
        )
        expect(await emulator.run(1000)).toBe(InterpreterStatus.Terminated)
        expect(emulator.termination).toEqual({ kind: 'exit', code: -7 })
        expect(value(emulator, 's0')).toBe(0n)
        expect(history(emulator)).toContainEqual({ type: 'Other', value: 'Exited with code -7' })
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.termination).toBeUndefined()
        await emulator.step()
        expect(emulator.termination).toEqual({ kind: 'exit', code: -7 })
    })

    it('uses service 40 in interactive runs and restores the generator on Undo', async () => {
        const emulator = await built(
            program(
                `li ${reg('a0')}, 7\nli ${reg('a1')}, 42\n${call(40)}li ${reg('a0')}, 7\n${call(41)}` +
                    exit
            )
        )
        // Stop immediately after the draw, leaving exit's register load as the next instruction.
        for (let i = 0; i < 7; i++) await emulator.step()
        expect(value(emulator, 'a0')).toBe(-1170105035n)
        expect(history(emulator)).toContainEqual({
            type: 'Other',
            value: 'Random generator 7 advanced'
        })
        expect(emulator.undo(1)).toBe(1)
        expect(value(emulator, 'a0')).toBe(7n)
        await emulator.step()
        expect(value(emulator, 'a0')).toBe(-1170105035n)
    })

    it('derives unseeded streams from the Testcase source and resets between Testcases', async () => {
        const sources = program(
            `li ${reg('a0')}, 0\n${call(41)}${mips ? 'move' : 'mv'} ${reg('s0')}, ${reg('a0')}\n` +
                exit
        )
        const emulator = await built(sources)
        const testcase: Testcase = {
            input: [],
            expectedOutput: '',
            startingRegisters: {},
            expectedRegisters: { [reg('s0')]: 1616725113n },
            startingMemory: [],
            expectedMemory: []
        }
        const results = await emulator.test(sources, [testcase, testcase], 1000, 200)
        expect(results.map((result) => result.passed)).toEqual([true, true])
    })

    it.each([51, 52, 53, 54])('returns input dialog %s Cancel as -2 without echo', async (code) => {
        const buffer = code === 54 ? `la ${reg('a1')}, buffer\nli ${reg('a2')}, 16\n` : ''
        const emulator = await built(
            program(
                `la ${reg('a0')}, message\n${buffer}${call(code)}${mips ? 'move' : 'mv'} ${reg('s0')}, ${reg('a1')}\n` +
                    exit,
                'message: .asciz "Name?"\nbuffer: .space 16'
            )
        )
        const running = emulator.run(1000)
        await expect.poll(() => Prompt.question).toBe('Name?')
        Prompt.cancel()
        await running
        expect(emulator.errors).toEqual([])
        expect(value(emulator, 's0')).toBe(-2n)
        expect(emulator.stdOut).toBe('')
    })

    it('parses raw integer text using Java rules instead of Number()', async () => {
        const emulator = await built(
            program(
                call(5) + `${mips ? 'move' : 'mv'} ${reg('s0')}, ${reg(resultRegister)}\n` + exit
            )
        )
        emulator.peripherals.terminal.useScriptedInput(['  +١٢  '])
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(value(emulator, 's0')).toBe(12n)
    })

    if (!mips)
        it('writes the Project root through GetCWD and rejects a too-small buffer', async () => {
            const emulator = await built(
                program(
                    `la a0, buffer\nli a1, 2\n${call(17)}lbu s0, 0(a0)\nli a1, 1\n${call(17)}mv s1, a0\n` +
                        exit,
                    'buffer: .space 2'
                )
            )
            await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            expect(value(emulator, 's0')).toBe(47n)
            expect(value(emulator, 's1')).toBe(-1n)
        })
})
