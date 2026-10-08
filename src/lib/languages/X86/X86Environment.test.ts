import { describe, expect, it, vi } from 'vitest'
import type { X86Emulator as CoreX86Emulator } from '@specy/x86'
import { X86Emulator } from './X86Emulator.svelte'
import { RandomSource } from '../peripherals/RandomSource'
import { FileSystem } from '../peripherals/FileSystem'
import { ProgramClock } from '../peripherals/ProgramClock'
import type { Testcase } from '$lib/Project.svelte'

const exit = ['mov eax, 60', 'xor edi, edi', 'syscall']
const sys = (number: number, ...args: (string | number)[]) => [
    `mov eax, ${number}`,
    ...args.map(
        (value, index) => `mov ${['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9'][index]}, ${value}`
    ),
    'syscall'
]
function program(body: string[], data: string[] = []) {
    return [
        'bits 64',
        'global _start',
        'section .bss',
        'buf: resb 4096',
        'section .data',
        ...data,
        'section .text',
        '_start:',
        ...body
    ].join('\n')
}
const sources = (code: string) => ({
    entry: 'main.asm',
    files: { 'main.asm': { encoding: 'plain' as const, content: code } }
})
const testcase = (registers: Record<string, bigint> = {}, input: string[] = []): Testcase => ({
    input,
    startingRegisters: {},
    startingMemory: [],
    expectedRegisters: registers,
    expectedMemory: [],
    expectedOutput: ''
})
const cpu = (emulator: Awaited<ReturnType<typeof X86Emulator>>, name: string) =>
    emulator.registers.find((r) => r.name === name)!.value
const native = (emulator: Awaited<ReturnType<typeof X86Emulator>>) =>
    (emulator as unknown as { core: CoreX86Emulator }).core
const pauseUntil = async (predicate: () => boolean) => {
    for (let i = 0; i < 200; i++) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 2))
    }
    throw new Error('condition did not become true')
}
const word = (bytes: Uint8Array) =>
    new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getBigUint64(0, true)

describe('x86 selected environment and native transport', () => {
    it('loads with a fresh session and selected loader entropy; Undo replays instruction random draws', async () => {
        const random = new RandomSource({ mode: 'seeded' })
        const input = sources(program([...sys(318, 'buf', 8, 0), 'rdrand r12', ...exit]))
        const emulator = await X86Emulator(input, {
            automaticChecking: false,
            peripherals: { random }
        })
        try {
            await emulator.compile(30, input)
            expect(random.position).toBe(16) // only loader AT_RANDOM; tools use their own entropy.
            await emulator.run(5) // getrandom's four register loads and syscall.
            const afterRead = random.position
            expect(afterRead).toBe(24)
            expect(emulator.undo(1)).toBe(1)
            expect(random.position).toBe(16)
            await emulator.step()
            expect(random.position).toBe(afterRead)
            await emulator.step()
            const drawn = cpu(emulator, 'r12')
            expect(random.position).toBe(32)
            expect(emulator.undo(1)).toBe(1)
            expect(random.position).toBe(24)
            await emulator.step()
            expect(cpu(emulator, 'r12')).toBe(drawn)
        } finally {
            emulator.dispose()
        }
    })

    it('keeps random checkpoints bounded without fetching history during a run, including after branching', async () => {
        const random = new RandomSource({ mode: 'seeded' })
        const input = sources(program(['again:', 'rdrand r12', 'inc rbx', 'jmp again']))
        const emulator = await X86Emulator(input, {
            automaticChecking: false,
            peripherals: { random }
        })
        try {
            await emulator.compile(8, input)
            const history = vi.spyOn(native(emulator), 'getUndoHistory')
            const range = vi.spyOn(native(emulator), 'getUndoHistoryRange')
            await emulator.run(1000)
            // Inspection is bounded by the displayed history and last-instruction lookback.
            expect(history.mock.calls.every(([max]) => max <= 32)).toBe(true)
            expect(range.mock.calls.every(([, max]) => max <= 32)).toBe(true)
            expect(
                (emulator as unknown as { randomPositions: Map<string, number> }).randomPositions
                    .size
            ).toBeLessThanOrEqual(8)
            const position = random.position
            expect(emulator.undo(3)).toBe(3)
            expect(random.position).toBe(position - 8)
            await emulator.run(3)
            expect(random.position).toBe(position)
        } finally {
            emulator.dispose()
        }
    })
    it('keeps history0 random loops outside the bounded Undo journal', async () => {
        const input = sources(program(['again:', 'rdrand r12', 'jmp again']))
        const emulator = await X86Emulator(input, { automaticChecking: false })
        try {
            await emulator.compile(0, input)
            await emulator.run(10_000)
            expect(
                (emulator as unknown as { randomPositions: Map<string, number> }).randomPositions
                    .size
            ).toBe(0)
            expect(emulator._getInstructionsExecuted()).toBeGreaterThanOrEqual(10_000n)
            await emulator.compile(8, input)
            await emulator.run(10_000)
            expect(
                (emulator as unknown as { randomPositions: Map<string, number> }).randomPositions
                    .size
            ).toBeLessThanOrEqual(8)
        } finally {
            emulator.dispose()
        }
    })

    it('normalizes an unbounded history request to native zero before collecting random positions', async () => {
        const input = sources(program(['rdrand r12', ...exit]))
        const emulator = await X86Emulator(input, { automaticChecking: false })
        try {
            await emulator.compile(Number.POSITIVE_INFINITY, input)
            await emulator.run(20)
            expect(native(emulator).getUndoDepth()).toBe(0)
            expect(
                (emulator as unknown as { randomPositions: Map<string, number> }).randomPositions
                    .size
            ).toBe(0)
        } finally {
            emulator.dispose()
        }
    })

    it('selects seeded sources before loader and presets in test() and standalone runTestcase()', async () => {
        const input = sources(
            program([
                // Walk argv/environment to auxv, then find AT_RANDOM.
                'mov rcx, [rsp]',
                'lea rbx, [rsp+rcx*8+16]',
                'env:',
                'cmp qword [rbx], 0',
                'lea rbx, [rbx+8]',
                'jne env',
                'aux:',
                'cmp qword [rbx], 25',
                'je found',
                'add rbx, 16',
                'jmp aux',
                'found:',
                'mov rbx, [rbx+8]',
                'mov r12, [rbx]',
                ...sys(318, 'buf', 8, 0),
                'mov r13, [buf]',
                ...exit
            ])
        )
        const expected = new RandomSource({ mode: 'seeded' })
        const loader = expected.bytes(16)
        const cases = testcase({ r12: word(loader), r13: word(expected.bytes(8)) })
        cases.startingRegisters.r15 = 55n
        const emulator = await X86Emulator(input, { automaticChecking: false })
        const hostRandom = emulator.peripherals.random
        const hostClock = emulator.peripherals.clock
        try {
            await emulator.compile(20, input) // preload interactively; standalone must start afresh.
            await emulator.runTestcase(cases, 1000)
            expect(cpu(emulator, 'r12')).toBe(cases.expectedRegisters.r12)
            expect(cpu(emulator, 'r13')).toBe(cases.expectedRegisters.r13)
            const results = await emulator.test(input, [cases, cases], 1000)
            expect(results.map((r) => r.errors)).toEqual([[], []])
            expect(emulator.peripherals.random).toBe(hostRandom)
            expect(emulator.peripherals.clock).toBe(hostClock)
            const invalid = testcase()
            invalid.startingRegisters.wrong = 1n
            await emulator.runTestcase(invalid, 1000)
            expect(emulator.peripherals.random).toBe(hostRandom)
            expect(emulator.peripherals.clock).toBe(hostClock)
            await expect(emulator.test(sources('invalid!'), [cases], 1000)).resolves.toEqual([])
            expect(emulator.peripherals.random).toBe(hostRandom)
        } finally {
            emulator.dispose()
        }
    }, 15000)

    it('shares readv/dup queues, splits UTF8 bytes, and delivers EOF once', async () => {
        const input = sources(
            program(
                [
                    ...sys(32, 0),
                    'mov r14, rax',
                    ...sys(19, 'r14', 'iov', 2),
                    'mov r12, rax',
                    ...sys(1, 1, 'buf', 1),
                    ...sys(1, 2, 'buf+1', 1),
                    ...sys(0, 'r14', 'buf', 1),
                    'mov r13, rax',
                    ...sys(1, 1, 'buf', 1),
                    ...sys(0, 0, 'buf', 5),
                    'mov r15, rax',
                    ...exit
                ],
                ['iov: dq buf, 1, buf+1, 1']
            )
        )
        const emulator = await X86Emulator(input, { automaticChecking: false })
        try {
            await emulator.compile(50, input)
            emulator.peripherals.terminal.useScriptedInput(['é'])
            const before = emulator._getInstructionsExecuted()
            await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            expect(emulator.stdOut).toBe('é\n')
            expect([cpu(emulator, 'r12'), cpu(emulator, 'r13'), cpu(emulator, 'r15')]).toEqual([
                2n,
                1n,
                0n
            ])
            expect(emulator._getInstructionsExecuted() - before).toBe(40n)
            const history = emulator._getUndoHistory(50)
            expect(history.filter((row) => row.undoable === false).length).toBeGreaterThanOrEqual(4)
        } finally {
            emulator.dispose()
        }
    })

    it('advances virtual time only through waits and handles indefinite waits with a clear error', async () => {
        const input = sources(
            program(
                [
                    ...sys(228, 1, 'buf'),
                    'mov r12, [buf+8]',
                    ...sys(35, 'delay', 0),
                    ...sys(228, 1, 'buf'),
                    'mov r13, [buf+8]',
                    ...exit
                ],
                ['delay: dq 0, 5000000']
            )
        )
        const emulator = await X86Emulator(input, { automaticChecking: false })
        try {
            expect(
                (await emulator.test(input, [testcase({ r12: 0n, r13: 5_000_000n })], 1000))[0]
                    .errors
            ).toEqual([])
            const paused = sources(program([...sys(34), ...exit]))
            const results = await emulator.test(paused, [testcase()], 1000)
            expect(results[0].passed).toBe(false)
            expect(results[0].errors[0]).toMatchObject({ type: 'runtime-error' })
            expect(emulator.errors.join(' ')).toContain('no external wake source')
            expect(emulator.peripherals.clock.isVirtual).toBe(false)
        } finally {
            emulator.dispose()
        }
    })

    it('advances the virtual clock by the requested nanoseconds', async () => {
        const input = sources(
            program(
                [...sys(35, 'delay', 0), ...sys(228, 1, 'buf'), 'mov r12, [buf+8]', ...exit],
                ['delay: dq 0, 500']
            )
        )
        const emulator = await X86Emulator(input, { automaticChecking: false })
        try {
            const [result] = await emulator.test(input, [testcase({ r12: 500n })], 1000)
            expect(result.errors).toEqual([])
        } finally {
            emulator.dispose()
        }
    })

    it('fails clearly when a nanosecond wait cannot advance a large virtual time', async () => {
        const clock = new ProgramClock({ mode: 'virtual' })
        const input = sources(program(exit))
        const emulator = await X86Emulator(input, {
            automaticChecking: false,
            peripherals: { clock }
        })
        try {
            await clock.wait(1e12) // Construction clears the selected clock.
            const adapter = emulator as unknown as {
                waitForClock: (
                    request: { deadlineNanoseconds: bigint; acceptsInput: boolean },
                    signal: AbortSignal
                ) => Promise<void>
            }
            await expect(
                adapter.waitForClock(
                    {
                        deadlineNanoseconds: 1000000000000000001n,
                        acceptsInput: false
                    },
                    new AbortController().signal
                )
            ).rejects.toThrow('virtual clock precision')
        } finally {
            emulator.dispose()
        }
    })

    it('cancels a host wait on Stop, then builds and runs a replacement', async () => {
        const clock = new ProgramClock()
        const input = sources(program([...sys(35, 'delay', 0), ...exit], ['delay: dq 60, 0']))
        const emulator = await X86Emulator(input, {
            automaticChecking: false,
            peripherals: { clock }
        })
        try {
            await emulator.compile(20, input)
            const run = emulator.run(100)
            await pauseUntil(() => clock.pendingWaits === 1)
            emulator.clear()
            await run
            expect(clock.pendingWaits).toBe(0)
            const replacement = sources(program([...exit]))
            await emulator.compile(20, replacement)
            await emulator.run(10)
            expect(emulator.termination).toEqual({ kind: 'exit', code: 0 })
        } finally {
            emulator.dispose()
        }
    })

    it('defers guarded native cleanup when clear supersedes an awaited Build', async () => {
        const input = sources(program([...exit]))
        const emulator = await X86Emulator(input, { automaticChecking: false })
        try {
            const core = native(emulator)
            const original = core.compileProject.bind(core)
            let release!: () => void
            const pending = new Promise<void>((resolve) => {
                release = resolve
            })
            const spy = vi.spyOn(core, 'compileProject').mockImplementationOnce(async (project) => {
                await pending
                return original(project)
            })
            const building = emulator.compile(20, input)
            await pauseUntil(() => spy.mock.calls.length === 1)
            expect(() => emulator.clear()).not.toThrow()
            const replacement = emulator.compile(20, input)
            release()
            await building
            await replacement
            await emulator.run(20)
            expect(emulator.errors).toEqual([])
            expect(emulator.termination).toEqual({ kind: 'exit', code: 0 })
        } finally {
            emulator.dispose()
        }
    })
})

describe('x86 timer handlers and Files', () => {
    it.each([false, true])(
        'retains the canonical draft through a timer handler, restart=%s',
        async (restart) => {
            let now = 0
            const clock = new ProgramClock({ now: () => now })
            const input = sources(
                program(
                    [
                        ...sys(13, 14, 'act', 0, 8),
                        ...sys(38, 0, 'timer', 0),
                        ...sys(0, 0, 'buf', 1),
                        'mov r12, rax',
                        ...(!restart ? sys(0, 0, 'buf', 1) : []),
                        'movzx r13, byte [buf]',
                        ...exit,
                        'handler:',
                        'nop',
                        'ret',
                        'restorer:',
                        ...sys(15)
                    ],
                    [
                        `act: dq handler, ${restart ? '0x14000000' : '0x04000000'}, restorer, 0`,
                        'timer: dq 0, 0, 0, 20000'
                    ]
                )
            )
            const emulator = await X86Emulator(input, {
                automaticChecking: false,
                peripherals: { clock }
            })
            try {
                await emulator.compile(100, input)
                emulator.toggleBreakpoint(
                    input.files['main.asm'].content.split('\n').indexOf('nop')
                )
                const run = emulator.run(1000)
                await pauseUntil(() => emulator.peripherals.terminal.pendingRead !== null)
                emulator.peripherals.terminal.insertText('é')
                await pauseUntil(() => emulator.peripherals.terminal.pendingRead?.line === 'é')
                now = 20
                await run
                expect(emulator.peripherals.terminal.pendingRead?.line).toBe('é')
                expect(emulator.interrupt).toBeUndefined()
                expect(emulator.canPoke).toBe(true)
                const before = emulator._getInstructionsExecuted()
                await emulator.step() // handler nop remains an ordinary Step.
                expect(emulator._getInstructionsExecuted() - before).toBe(1n)
                const finishing = emulator.run(1000)
                await pauseUntil(() => emulator.interrupt !== undefined)
                emulator.peripherals.terminal.pressEnter()
                await finishing
                expect(cpu(emulator, 'r12')).toBe(restart ? 1n : BigInt.asUintN(64, -4n))
                expect(cpu(emulator, 'r13')).toBe(0xc3n)
                expect(emulator.errors).toEqual([])
            } finally {
                emulator.dispose()
            }
        }
    )

    it('mounts actual Project Files, preserves changes on Stop, and isolates every Testcase', async () => {
        const input = sources(
            program(
                [
                    ...sys(2, 'path', 2, 0),
                    'mov r14, rax',
                    ...sys(1, 'r14', 'text', 3),
                    ...sys(8, 'r14', 0, 0),
                    ...sys(0, 'r14', 'buf', 3),
                    ...sys(1, 1, 'buf', 3),
                    ...exit
                ],
                ["path: db 'file.txt',0", "text: db 'new'"]
            )
        )
        Object.assign(input.files, { 'file.txt': { encoding: 'plain', content: 'old' } })
        const emulator = await X86Emulator(input, {
            automaticChecking: false,
            peripherals: { fileSystem: new FileSystem(input.files) }
        })
        try {
            await emulator.compile(100, input)
            await emulator.run(1000)
            expect(emulator.stdOut).toBe('new')
            emulator.clear()
            expect(emulator.peripherals.fileSystem.files['file.txt'].content).toBe('new')
            const readInput = sources(
                program(
                    [
                        ...sys(2, 'path', 0, 0),
                        'mov r14, rax',
                        ...sys(0, 'r14', 'buf', 3),
                        ...sys(1, 1, 'buf', 3),
                        ...exit
                    ],
                    ["path: db 'file.txt',0"]
                )
            )
            Object.assign(readInput.files, { 'file.txt': { encoding: 'plain', content: 'old' } })
            const expected = testcase()
            expected.expectedOutput = 'old'
            expect(
                (await emulator.test(readInput, [expected, expected], 1000)).every((r) => r.passed)
            ).toBe(true)
            expect(emulator.peripherals.fileSystem.files['file.txt'].content).toBe('new')
        } finally {
            emulator.dispose()
        }
    })
})
