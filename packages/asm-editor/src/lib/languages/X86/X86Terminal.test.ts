/**
 * The x86 program's terminal as the adapter wires it to the Terminal
 * ([x86 devices](../../../../../../docs/design/x86-devices.md), "The program's tty is a serial line",
 * "The Terminal's modes", "Input devices in a Testcase", "Input and Undo"): the line mode follows
 * the program's termios, raw mode's keys and the signals typed go to the Core as they are typed,
 * output follows `OPOST` and `ONLCR` in an interactive run and goes through as written in a
 * Testcase, and Undo keeps the Terminal and the Core's input queue in step.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { X86Emulator as CoreX86Emulator } from '@specy/x86'
import type { Testcase } from '#lib/Project.svelte.ts'
import type { TerminalKeyPress } from '../peripherals/terminalKeys'
import { ProgramClock } from '../peripherals/ProgramClock'
import { X86Emulator } from './X86Emulator.svelte'

const exit = ['mov eax, 60', 'xor edi, edi', 'syscall']
const sys = (number: number, ...args: (string | number)[]) => [
    `mov eax, ${number}`,
    ...args.map(
        (value, index) => `mov ${['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9'][index]}, ${value}`
    ),
    'syscall'
]

/** termios's flags (`c_lflag` at 12, `c_oflag` at 4) and `c_cc`'s `VTIME` and `VMIN` (at 17 + 5, 6). */
const ISIG = 0x1
const ICANON = 0x2
const ECHO = 0x8
const OPOST = 0x1

/** `tcgetattr` and `tcsetattr` on standard input, with flags cleared and `VMIN`, `VTIME` set. */
function setTermios(change: { lflag?: number; oflag?: number; vmin?: number; vtime?: number }) {
    return [
        ...sys(16, 0, 0x5401, 'tio'),
        ...(change.lflag ? [`and dword [tio+12], ~${change.lflag}`] : []),
        ...(change.oflag ? [`and dword [tio+4], ~${change.oflag}`] : []),
        ...(change.vtime !== undefined ? [`mov byte [tio+22], ${change.vtime}`] : []),
        ...(change.vmin !== undefined ? [`mov byte [tio+23], ${change.vmin}`] : []),
        ...sys(16, 0, 0x5402, 'tio')
    ]
}

function program(body: string[], data: string[] = []) {
    return [
        'bits 64',
        'global _start',
        'section .bss',
        'buf: resb 4096',
        'tio: resb 64',
        'section .data',
        'db 0',
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
const testcase = (input: string[] = [], expectedOutput = ''): Testcase => ({
    input,
    startingRegisters: {},
    startingMemory: [],
    expectedRegisters: {},
    expectedMemory: [],
    expectedOutput
})

type Emulator = Awaited<ReturnType<typeof X86Emulator>>
const cpu = (emulator: Emulator, name: string) =>
    emulator.registers.find((r) => r.name === name)!.value
const native = (emulator: Emulator) => (emulator as unknown as { core: CoreX86Emulator }).core
/** The line of `text` in the program, for a Breakpoint. */
const lineOf = (input: ReturnType<typeof sources>, text: string) =>
    input.files['main.asm'].content.split('\n').indexOf(text)
const pauseUntil = async (predicate: () => boolean) => {
    for (let i = 0; i < 500; i++) {
        if (predicate()) return
        await new Promise((resolve) => setTimeout(resolve, 2))
    }
    throw new Error('condition did not become true')
}
/** Fails when `promise` has not settled in time: a read that waited instead of taking a key. */
const promptly = <T>(promise: Promise<T>) =>
    Promise.race([
        promise,
        new Promise<never>((_resolve, reject) =>
            setTimeout(() => reject(new Error('the program waited')), 2000)
        )
    ])
const key = (key: string, modifiers: Partial<TerminalKeyPress> = {}): TerminalKeyPress => ({
    key,
    code: /^[a-z]$/.test(key) ? `Key${key.toUpperCase()}` : key,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    metaKey: false,
    ...modifiers
})
/** What the Core sent as output, one write a string, as the Terminal received it. */
function writesOf(emulator: Emulator): string[] {
    const writes: string[] = []
    native(emulator).on('stdout', (bytes) => {
        writes.push(new TextDecoder().decode(bytes))
    })
    return writes
}

const emulators: Emulator[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))
async function emulatorFor(input: ReturnType<typeof sources>, clock?: ProgramClock) {
    const emulator = await X86Emulator(input, {
        automaticChecking: false,
        ...(clock ? { peripherals: { clock } } : {})
    })
    emulators.push(emulator)
    return emulator
}

describe('the x86 Terminal in canonical mode', () => {
    it('reads a typed line as before, and shows the `\\r\\n` ONLCR sends as a line', async () => {
        const input = sources(
            program([...sys(0, 0, 'buf', 64), 'mov r12, rax', ...sys(1, 1, 'buf', 'r12'), ...exit])
        )
        const emulator = await emulatorFor(input)
        const writes = writesOf(emulator)
        await emulator.compile(50, input)
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(1000)
        await pauseUntil(() => terminal.pendingRead?.kind === 'standard-input')
        expect(terminal.lineMode).toMatchObject({ canonical: true, echo: true, signals: true })
        terminal.insertText('hi')
        terminal.pressEnter()
        await running
        expect(emulator.errors).toEqual([])
        expect(cpu(emulator, 'r12')).toBe(3n)
        expect(writes).toEqual(['hi\r\n'])
        expect(emulator.stdOut).toBe('hi\nhi\n')
        //every mode ends with the program
        expect(terminal.lineMode).toBeNull()
    })

    it('sends SIGINT for Ctrl+C, echoed as itself, which ends a program that does not handle it', async () => {
        const input = sources(program([...sys(0, 0, 'buf', 64), ...exit]))
        const emulator = await emulatorFor(input)
        await emulator.compile(50, input)
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(1000)
        await pauseUntil(() => terminal.pendingRead?.kind === 'standard-input')
        terminal.insertText('ab')
        await pauseUntil(() => terminal.pendingRead?.line === 'ab')
        expect(terminal.pressKey(key('c', { ctrlKey: true }))).toBe(true)
        await running
        expect(emulator.errors).toEqual([])
        expect(emulator.termination).toMatchObject({ kind: 'signal', number: 2, name: 'SIGINT' })
        //the serial line has no ECHOCTL as agetty leaves it, so ^C echoes as the byte itself
        expect(emulator.stdOut).toBe('ab\x03')
        expect(terminal.pendingRead).toBeNull()
        expect(terminal.lineMode).toBeNull()
    })
})

describe('the x86 Terminal in raw mode', () => {
    it('hands keys typed while no read waits to the Core, which a later read takes', async () => {
        const input = sources(
            program([
                ...setTermios({ lflag: ICANON | ECHO }),
                'nop ; typed',
                ...sys(0, 0, 'buf', 16),
                'mov r12, rax',
                'mov r13d, dword [buf]',
                ...sys(0, 0, 'buf', 16),
                'mov r14, rax',
                'movzx r15, byte [buf]',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(50, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; typed'))
        await emulator.run(1000)
        const terminal = emulator.peripherals.terminal
        expect(terminal.lineMode).toMatchObject({ canonical: false, echo: false })
        expect(terminal.pendingRead?.kind).toBe('keys')
        terminal.insertText('a')
        expect(terminal.pressKey(key('ArrowUp'))).toBe(true)
        const running = emulator.run(1000)
        //the second read finds nothing queued and waits for a key, as a line read waits
        await pauseUntil(() => emulator.interrupt !== undefined)
        terminal.insertText('z')
        await running
        expect(emulator.errors).toEqual([])
        expect(cpu(emulator, 'r12')).toBe(4n)
        //`a`, then the arrow's `ESC [ A`
        expect(cpu(emulator, 'r13')).toBe(0x415b1b61n)
        expect([cpu(emulator, 'r14'), cpu(emulator, 'r15')]).toEqual([1n, 0x7an])
        //ECHO is off
        expect(emulator.stdOut).toBe('')
        expect(terminal.lineMode).toBeNull()
        expect(terminal.pendingRead).toBeNull()
    })

    it('times a read out by VTIME on a virtual clock', async () => {
        const input = sources(
            program(
                [
                    ...setTermios({ lflag: ICANON | ECHO, vmin: 0, vtime: 5 }),
                    ...sys(228, 1, 'before'),
                    ...sys(0, 0, 'buf', 1),
                    'mov r12, rax',
                    ...sys(228, 1, 'after'),
                    'mov rax, [after]',
                    'sub rax, [before]',
                    'imul rax, rax, 1000000000',
                    'add rax, [after+8]',
                    'sub rax, [before+8]',
                    'mov r13, rax',
                    ...exit
                ],
                ['before: dq 0, 0', 'after: dq 0, 0']
            )
        )
        const emulator = await emulatorFor(input, new ProgramClock({ mode: 'virtual' }))
        await emulator.compile(50, input)
        await promptly(emulator.run(1000))
        expect(emulator.errors).toEqual([])
        expect(cpu(emulator, 'r12')).toBe(0n)
        expect(cpu(emulator, 'r13')).toBe(500_000_000n)
    })

    it('gives a scripted Testcase its input a line at a time, as through a pipe', async () => {
        const input = sources(
            program([
                ...setTermios({ lflag: ICANON | ECHO }),
                ...sys(0, 0, 'buf', 16),
                'mov r12, rax',
                ...sys(1, 1, 'buf', 'r12'),
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        const [result] = await emulator.test(input, [testcase(['abc'], 'abc\n')], 1000)
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
    })
})

describe('x86 output processing', () => {
    const input = sources(
        program(
            [
                ...sys(1, 1, 'first', 4),
                ...setTermios({ oflag: OPOST }),
                ...sys(1, 1, 'second', 4),
                ...exit
            ],
            ["first: db 'a', 10, 'b', 10", "second: db 'c', 10, 'd', 10"]
        )
    )

    it('returns at each line under ONLCR, and steps down without returning once OPOST is off', async () => {
        const emulator = await emulatorFor(input)
        const writes = writesOf(emulator)
        await emulator.compile(50, input)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(writes).toEqual(['a\r\nb\r\n', 'c\nd\n'])
        //the staircase a raw serial line shows
        expect(emulator.stdOut).toBe('a\nb\nc\n d\n  ')
    })

    it('leaves a Testcase output as written, as a pipe does', async () => {
        const emulator = await emulatorFor(input)
        const writes = writesOf(emulator)
        const [result] = await emulator.test(input, [testcase([], 'a\nb\nc\nd\n')], 1000)
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
        expect(writes).toEqual(['a\nb\n', 'c\nd\n'])
    })
})

describe('x86 output with carriage returns and backspaces', () => {
    const input = sources(
        program(
            [...sys(1, 1, 'progress', 21), ...exit],
            ["progress: db 'Hello', 13, 10, '50%', 13, '100%', 10, 'ab', 8, 'c', 10"]
        )
    )

    it('overwrites the line on the serial line of an interactive run', async () => {
        const emulator = await emulatorFor(input)
        await emulator.compile(50, input)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('Hello\n100%\nac\n')
    })

    it('compares a Testcase output as the program wrote it, \\r and \\b included', async () => {
        const emulator = await emulatorFor(input)
        const expected = 'Hello\r\n50%\r100%\nab\bc\n'
        const [result] = await emulator.test(input, [testcase([], expected)], 1000)
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
    })
})

describe('x86 input devices in a Testcase', () => {
    const open = (path: string) => [...sys(2, path, 0, 0), 'mov r14, rax']

    it.each([
        {
            what: 'a blocking read of the keyboard',
            body: [...open('keyboard'), ...sys(0, 'r14', 'buf', 24)],
            message:
                'The program is waiting for a key. Testcases cannot provide keyboard or pointer input.'
        },
        {
            what: 'a poll without a timeout of the keyboard and the tablet',
            body: [
                ...open('keyboard'),
                'mov [fds], r14d',
                ...open('tablet'),
                'mov [fds+8], r14d',
                ...sys(7, 'fds', 2, -1)
            ],
            message:
                'The program is waiting for a key or the pointer. Testcases cannot provide keyboard or pointer input.'
        }
    ])('stops $what with a clear error', async ({ body, message }) => {
        const input = sources(
            program(
                [...body, ...exit],
                [
                    "keyboard: db '/dev/input/event0', 0",
                    "tablet: db '/dev/input/event2', 0",
                    'fds: dd 0',
                    'dw 1, 0',
                    'dd 0',
                    'dw 1, 0'
                ]
            )
        )
        const emulator = await emulatorFor(input)
        const [result] = await emulator.test(input, [testcase()], 1000)
        expect(result.passed).toBe(false)
        expect(result.errors[0]).toMatchObject({ type: 'runtime-error' })
        expect(emulator.errors.join(' ')).toContain(message)
    })
})

describe('x86 devices the machine does not cover', () => {
    it('are named in the Log once a run, with what to use instead', async () => {
        const input = sources(
            program(
                [
                    ...sys(2, 'card', 2, 0),
                    'mov r12, rax',
                    ...sys(2, 'card', 2, 0),
                    ...sys(2, 'mice', 0, 0),
                    ...exit
                ],
                ["card: db '/dev/dri/card0', 0", "mice: db '/dev/input/mice', 0"]
            )
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(50, input)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(cpu(emulator, 'r12')).toBe(BigInt.asUintN(64, -19n))
        expect(emulator.notes.map((note) => [note.tone, note.text])).toEqual([
            [
                'warning',
                'This emulator does not support `/dev/dri/card0` (DRM). Opening it returned ENODEV. Draw on `/dev/fb0` instead.'
            ],
            [
                'warning',
                'This emulator does not support `/dev/input/mice` (PS/2 mouse packets). Opening it returned ENODEV. Read pointer events from the tablet instead. Find its event device with EVIOCGBIT or in `/proc/bus/input/devices`.'
            ]
        ])
    })
})

describe('x86 raw mode under Undo', () => {
    it('follows Undo of tcsetattr, and of the exit that ended raw mode', async () => {
        const input = sources(program([...setTermios({ lflag: ICANON | ECHO }), ...exit]))
        const emulator = await emulatorFor(input)
        await emulator.compile(50, input)
        const terminal = emulator.peripherals.terminal
        //the two ioctls' five instructions each, and the `and` between
        for (let i = 0; i < 11; i++) await emulator.step()
        expect(terminal.lineMode?.canonical).toBe(false)
        expect(emulator.undo(1)).toBe(1)
        expect(terminal.lineMode?.canonical).toBe(true)
        await emulator.run(1000)
        expect(emulator.terminated).toBe(true)
        expect(terminal.lineMode).toBeNull()
        expect(emulator.undo(1)).toBe(1)
        expect(terminal.lineMode?.canonical).toBe(false)
        expect(terminal.pendingRead?.kind).toBe('keys')
    })

    it('puts a typed-ahead key back, and asks again for a key a read waited for', async () => {
        const input = sources(
            program([
                ...setTermios({ lflag: ICANON | ECHO }),
                'nop ; typed',
                ...sys(0, 0, 'buf', 1),
                'mov r12, rax',
                'movzx r13, byte [buf]',
                'nop ; took',
                ...sys(0, 0, 'buf', 1),
                'mov r14, rax',
                'movzx r15, byte [buf]',
                'nop ; waited',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        const terminal = emulator.peripherals.terminal
        for (const text of ['nop ; typed', 'nop ; took', 'nop ; waited'])
            emulator.toggleBreakpoint(lineOf(input, text))
        await emulator.run(1000)
        terminal.insertText('k')
        await promptly(emulator.run(1000))
        expect([cpu(emulator, 'r12'), cpu(emulator, 'r13')]).toEqual([1n, 0x6bn])
        //the read and the two moves after it: the key goes back, and the read takes it at once
        expect(emulator.undo(3)).toBe(3)
        expect(cpu(emulator, 'r13')).toBe(0n)
        await promptly(emulator.run(1000))
        expect([cpu(emulator, 'r12'), cpu(emulator, 'r13')]).toEqual([1n, 0x6bn])

        const running = emulator.run(1000)
        await pauseUntil(() => emulator.interrupt !== undefined)
        terminal.insertText('z')
        await running
        expect([cpu(emulator, 'r14'), cpu(emulator, 'r15')]).toEqual([1n, 0x7an])
        //a read that waited asks again, for another key
        expect(emulator.undo(3)).toBe(3)
        const again = emulator.run(1000)
        await pauseUntil(() => emulator.interrupt !== undefined)
        terminal.insertText('y')
        await again
        expect([cpu(emulator, 'r14'), cpu(emulator, 'r15')]).toEqual([1n, 0x79n])
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
    })

    it('keeps the echo of a key typed during a poll while the Core keeps the key', async () => {
        const input = sources(
            program(
                [
                    ...setTermios({ lflag: ICANON }),
                    ...sys(7, 'fds', 1, -1),
                    'mov r12, rax',
                    ...sys(0, 0, 'buf', 1),
                    'mov r13, rax',
                    ...sys(1, 1, 'buf', 1),
                    'nop ; end',
                    ...exit
                ],
                ['fds: dd 0', 'dw 1, 0']
            )
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; end'))
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(1000)
        await pauseUntil(() => emulator.interrupt !== undefined)
        terminal.insertText('x')
        await running
        expect([cpu(emulator, 'r12'), cpu(emulator, 'r13')]).toEqual([1n, 1n])
        //the echo, then the program writing the key back
        expect(emulator.stdOut).toBe('xx')
        //back before the poll: the read put the key back, so its echo stays with it
        expect(emulator.undo(17)).toBe(17)
        expect(emulator.stdOut).toBe('x')
        await promptly(emulator.run(1000))
        expect([cpu(emulator, 'r12'), cpu(emulator, 'r13')]).toEqual([1n, 1n])
        expect(emulator.stdOut).toBe('xx')
    })

    it('takes back the echo of a key a VTIME read waited for, with the read', async () => {
        const input = sources(
            program([
                ...setTermios({ lflag: ICANON, vmin: 0, vtime: 100 }),
                ...sys(0, 0, 'buf', 1),
                'mov r13, rax',
                ...sys(1, 1, 'buf', 1),
                'nop ; end',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; end'))
        const terminal = emulator.peripherals.terminal
        const read = () => native(emulator).getWaitRequest()?.terminalRead === true
        const running = emulator.run(1000)
        //a read VTIME times waits as a poll does, with a deadline, and the Core says it is a read
        await pauseUntil(read)
        terminal.insertText('x')
        await running
        expect(cpu(emulator, 'r13')).toBe(1n)
        expect(emulator.stdOut).toBe('xx')
        //the write, then the read: the read asks again, so the echo of what it took goes too
        expect(emulator.undo(6)).toBe(6)
        expect(emulator.stdOut).toBe('x')
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.stdOut).toBe('')
        const again = emulator.run(1000)
        await pauseUntil(read)
        terminal.insertText('y')
        await again
        expect(emulator.stdOut).toBe('yy')
    })

    it('hands keys typed ahead to the Core after tcsetattr, so Undo keeps their echo with them', async () => {
        const input = sources(
            program([
                ...setTermios({ lflag: ICANON }),
                'nop ; raw',
                ...sys(0, 0, 'buf', 2),
                'mov r12, rax',
                'movzx r13, word [buf]',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        const terminal = emulator.peripherals.terminal
        emulator.toggleBreakpoint(lineOf(input, 'nop ; raw'))
        expect(terminal.lineMode?.canonical).toBe(true)
        //typed while no read waits, in canonical mode: the Terminal keeps it for a line
        terminal.insertText('ab')
        await emulator.run(1000)
        expect(terminal.lineMode?.canonical).toBe(false)
        //raw mode took it, after the system call: echoed under no instruction, as type-ahead
        expect(emulator.stdOut).toBe('ab')
        expect(emulator.undo(1)).toBe(1)
        expect(terminal.lineMode?.canonical).toBe(true)
        expect(emulator.stdOut).toBe('ab')
        //the Core kept the keys, and the read takes them without waiting
        emulator.toggleBreakpoint(lineOf(input, 'nop ; raw'))
        await promptly(emulator.run(1000))
        expect(emulator.errors).toEqual([])
        expect([cpu(emulator, 'r12'), cpu(emulator, 'r13')]).toEqual([2n, 0x6261n])
        expect(emulator.stdOut).toBe('ab')
    })

    it('hands a line partly typed to the Core when a signal handler turns raw mode on', async () => {
        let now = 0
        const clock = new ProgramClock({ now: () => now })
        const input = sources(
            program(
                [
                    ...sys(13, 14, 'act', 0, 8),
                    ...sys(38, 0, 'timer', 0),
                    ...sys(0, 0, 'buf', 1),
                    'mov r12, rax',
                    'movzx r13, byte [buf]',
                    ...exit,
                    'handler:',
                    ...setTermios({ lflag: ICANON | ECHO | ISIG }),
                    'ret',
                    'restorer:',
                    ...sys(15)
                ],
                ['act: dq handler, 0x14000000, restorer, 0', 'timer: dq 0, 0, 0, 20000']
            )
        )
        const emulator = await emulatorFor(input, clock)
        await emulator.compile(100, input)
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(1000)
        await pauseUntil(() => terminal.pendingRead?.kind === 'standard-input')
        terminal.insertText('xy')
        now = 20
        //the read started over in raw mode finds the line's first key without waiting
        await promptly(running)
        expect(emulator.errors).toEqual([])
        expect([cpu(emulator, 'r12'), cpu(emulator, 'r13')]).toEqual([1n, 0x78n])
        //echoed once, as it was typed
        expect(emulator.stdOut).toBe('xy')
    })

    it('lets go of a line read when a signal handler turns raw mode on, and reads a key', async () => {
        let now = 0
        const clock = new ProgramClock({ now: () => now })
        const input = sources(
            program(
                [
                    ...sys(13, 14, 'act', 0, 8),
                    ...sys(38, 0, 'timer', 0),
                    ...sys(0, 0, 'buf', 1),
                    'mov r12, rax',
                    'movzx r13, byte [buf]',
                    ...exit,
                    'handler:',
                    ...setTermios({ lflag: ICANON | ECHO | ISIG }),
                    'ret',
                    'restorer:',
                    ...sys(15)
                ],
                //SA_RESTORER and SA_RESTART: the read starts over after the handler
                ['act: dq handler, 0x14000000, restorer, 0', 'timer: dq 0, 0, 0, 20000']
            )
        )
        const emulator = await emulatorFor(input, clock)
        await emulator.compile(100, input)
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(1000)
        await pauseUntil(() => terminal.pendingRead?.kind === 'standard-input')
        now = 20
        await pauseUntil(() => terminal.pendingRead?.kind === 'keys')
        await pauseUntil(() => emulator.interrupt !== undefined)
        expect(terminal.signalsTyped).toBe(false)
        terminal.insertText('q')
        await running
        expect(emulator.errors).toEqual([])
        expect([cpu(emulator, 'r12'), cpu(emulator, 'r13')]).toEqual([1n, 0x71n])
    })
})
