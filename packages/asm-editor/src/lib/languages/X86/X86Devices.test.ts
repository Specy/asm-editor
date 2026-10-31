/**
 * The x86 program's framebuffer, input devices and sound as the adapter wires them to the Screen,
 * the Screen's keys and pointer and the Audio
 * ([x86 devices](../../../../../../docs/design/x86-devices.md); M6 to M8 of
 * [the plan](../../../../../../docs/design/x86-devices-plan.md)): the Screen catches up with the
 * page the scanout shows at the end of every slice, at a pan or an fsync and after Undo, the
 * Display configuration is the size `/dev/fb0` reports, the Screen's keys and pointer reach the
 * program's evdev reads in an interactive run only, and the sound devices' timeline reaches the
 * Audio of the run in hand.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { X86Emulator as CoreX86Emulator } from '@specy/x86'
import type { Testcase } from '#lib/Project.svelte.ts'
import { Audio } from '../peripherals/audio/Audio'
import { RecordingAudioOutput, type AudioCommand } from '../peripherals/audio/AudioOutput'
import { ProgramClock } from '../peripherals/ProgramClock'
import { X86_INPUT_INTERRUPT } from '../peripherals/x86Input'
import { X86Emulator } from './X86Emulator.svelte'

const exit = ['mov eax, 60', 'xor edi, edi', 'syscall']
const sys = (number: number, ...args: (string | number)[]) => [
    `mov eax, ${number}`,
    ...args.map(
        (value, index) => `mov ${['rdi', 'rsi', 'rdx', 'r10', 'r8', 'r9'][index]}, ${value}`
    ),
    'syscall'
]

const O_WRONLY = 1
const O_RDWR = 2
const O_NONBLOCK = 0x800
const FBIOGET_VSCREENINFO = 0x4600
const FBIOGET_FSCREENINFO = 0x4602
const FBIOPAN_DISPLAY = 0x4606
const SNDCTL_DSP_SYNC = 0x5001
const EV_SYN = 0
const EV_KEY = 1
const EV_ABS = 3
const EV_MSC = 4
const MSC_SCAN = 4
const KEY_A = 30

/**
 * Opens `/dev/fb0` into r12 and maps it into rbx, its screen information in `var` and `fix`: the
 * mode at `var` and `var+4`, `yres_virtual` at `var+12`, `smem_len` at `fix+24`, `line_length` at
 * `fix+48`.
 */
const mapFramebuffer = [
    ...sys(2, 'fb', O_RDWR, 0),
    'mov r12, rax',
    ...sys(16, 'r12', FBIOGET_VSCREENINFO, 'var'),
    ...sys(16, 'r12', FBIOGET_FSCREENINFO, 'fix'),
    'xor edi, edi',
    'mov esi, [fix+24]',
    'mov edx, 3',
    'mov r10d, 1',
    'mov r8, r12',
    'xor r9d, r9d',
    'mov eax, 9',
    'syscall',
    'mov rbx, rax'
]

function program(body: string[], data: string[] = []) {
    return [
        'bits 64',
        'global _start',
        'section .bss',
        'buf: resb 4096',
        'var: resb 160',
        'fix: resb 80',
        'ts: resq 4',
        'section .data',
        "fb: db '/dev/fb0', 0",
        "kbd: db '/dev/input/by-path/platform-i8042-serio-0-event-kbd', 0",
        "tablet: db '/dev/input/event3', 0",
        "spkr: db '/dev/input/by-path/platform-pcspkr-event-spkr', 0",
        "dsp: db '/dev/dsp', 0",
        "midi: db '/dev/snd/midiC1D0', 0",
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
const testcase = (
    expectedRegisters: Record<string, bigint> = {},
    expectedOutput = ''
): Testcase => ({
    input: [],
    startingRegisters: {},
    startingMemory: [],
    expectedRegisters,
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
/** The Screen's pixel at `x`, `y` as `0xRRGGBB`. */
function pixel(emulator: Emulator, x: number, y: number): number {
    const screen = emulator.peripherals.screen
    const index = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (pixels[index] << 16) | (pixels[index + 1] << 8) | pixels[index + 2]
}
/** The 24-byte `struct input_event`s a read left in `buf`, without their times. */
function eventsIn(emulator: Emulator, count: number) {
    const bytes = native(emulator).readMemoryBytes(bufferAddress(emulator), BigInt(count * 24))
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return Array.from({ length: count }, (_, index) => ({
        type: view.getUint16(index * 24 + 16, true),
        code: view.getUint16(index * 24 + 18, true),
        value: view.getInt32(index * 24 + 20, true)
    }))
}
const bufferAddress = (emulator: Emulator) => cpu(emulator, 'rbp')
const commandsOf = (output: RecordingAudioOutput, type: AudioCommand['type']) =>
    output.commands.filter((command) => command.type === type)

const emulators: Emulator[] = []
afterEach(() => emulators.splice(0).forEach((emulator) => emulator.dispose()))
async function emulatorFor(
    input: ReturnType<typeof sources>,
    options: { audio?: Audio; clock?: ProgramClock; width?: number; height?: number } = {}
) {
    const emulator = await X86Emulator(input, {
        automaticChecking: false,
        display: { width: options.width ?? 64, height: options.height ?? 48 },
        peripherals: {
            ...(options.clock ? { clock: options.clock } : {}),
            ...(options.audio ? { audio: options.audio } : {})
        }
    })
    emulators.push(emulator)
    return emulator
}

describe('the x86 Screen', () => {
    it('gets the Display configuration as the size /dev/fb0 reports', async () => {
        const input = sources(
            program([
                ...mapFramebuffer,
                'mov r13d, [var]',
                'mov r14d, [var+4]',
                'mov r15d, [var+12]',
                'mov ebp, [fix+48]',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input, { width: 128, height: 40 })
        await emulator.compile(100, input)
        expect([emulator.peripherals.screen.width, emulator.peripherals.screen.height]).toEqual([
            128, 40
        ])
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        const read = ['r13', 'r14', 'r15', 'rbp'].map((name) => cpu(emulator, name))
        expect(read).toEqual([128n, 40n, 80n, 512n])
    })

    it('shows what the program stores into the mapping at the end of the slice', async () => {
        const input = sources(
            program([
                ...mapFramebuffer,
                'mov dword [rbx], 0xff0000',
                'mov dword [rbx + 47*256 + 63*4], 0x00ff00',
                'nop ; drawn',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; drawn'))
        const screen = emulator.peripherals.screen
        expect(pixel(emulator, 0, 0)).toBe(0)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(pixel(emulator, 0, 0)).toBe(0xff0000)
        expect(pixel(emulator, 63, 47)).toBe(0x00ff00)
        //a page read again unchanged is no change to the Screen
        const version = screen.version
        await emulator.step()
        expect(screen.version).toBe(version)
        //and the picture stays once the program has ended
        await emulator.run(1000)
        expect(emulator.terminated).toBe(true)
        expect(pixel(emulator, 0, 0)).toBe(0xff0000)
        //Build, Stop and dispose leave the Screen black
        emulator.clear()
        expect(pixel(emulator, 0, 0)).toBe(0)
    })

    it('shows the second page at a pan, and Undo takes the pan and the pixels back', async () => {
        const input = sources(
            program([
                ...mapFramebuffer,
                'mov dword [rbx], 0xff0000',
                'mov dword [rbx + 48*256], 0x0000ff',
                'nop ; drawn',
                'mov eax, [var+4]',
                'mov [var+20], eax',
                ...sys(16, 'r12', FBIOPAN_DISPLAY, 'var'),
                'nop ; panned',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; drawn'))
        emulator.toggleBreakpoint(lineOf(input, 'nop ; panned'))
        await emulator.run(1000)
        expect(pixel(emulator, 0, 0)).toBe(0xff0000)
        //the Screen shows the pan as it happens, not only at the slice's end
        const presented: number[] = []
        native(emulator).on('framebufferPresent', () => {
            presented.push(pixel(emulator, 0, 0))
        })
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(presented).toEqual([0x0000ff])
        expect(pixel(emulator, 0, 0)).toBe(0x0000ff)
        //the ioctl and the four moves that set it up: back on the first page
        expect(emulator.undo(6)).toBe(6)
        expect(pixel(emulator, 0, 0)).toBe(0xff0000)
        //and the move, the nop and the two stores before them
        expect(emulator.undo(4)).toBe(4)
        expect(pixel(emulator, 0, 0)).toBe(0)
    })

    it('shows a page at fsync, during the slice', async () => {
        const input = sources(
            program([
                ...mapFramebuffer,
                'mov dword [rbx + 4], 0xffff00',
                ...sys(74, 'r12'),
                'mov dword [rbx + 4], 0x00ffff',
                ...exit
            ])
        )
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        const presented: number[] = []
        native(emulator).on('framebufferPresent', () => {
            presented.push(pixel(emulator, 1, 0))
        })
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(presented).toEqual([0xffff00])
        expect(pixel(emulator, 1, 0)).toBe(0x00ffff)
    })

    it('shows a Poke into the framebuffer at once', async () => {
        const input = sources(program([...mapFramebuffer, 'nop ; mapped', ...exit]))
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; mapped'))
        await emulator.run(1000)
        const address = cpu(emulator, 'rbx')
        expect(emulator.pokeMemory(address + 8n, new Uint8Array([0x40, 0x30, 0x20, 0]))).toBe(true)
        expect(pixel(emulator, 2, 0)).toBe(0x203040)
        expect(emulator.undo(1)).toBe(1)
        expect(pixel(emulator, 2, 0)).toBe(0)
    })
})

describe('the x86 input devices', () => {
    /** A blocking read of three events from the device `path` names, into `buf`, at rbp. */
    const readEvents = (path: string) => [
        ...sys(2, path, 0, 0),
        'mov r14, rax',
        'lea rbp, [buf]',
        ...sys(0, 'r14', 'buf', 72),
        'mov r12, rax',
        'nop ; read',
        ...exit
    ]

    it('wakes a blocking read of the keyboard with a key typed on the Screen', async () => {
        const input = sources(program(readEvents('kbd')))
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; read'))
        const x86Input = emulator.peripherals.x86Input
        //before the program starts the Core has nowhere to put it
        x86Input.keyDown({ code: 'KeyQ' })
        x86Input.keyUp({ code: 'KeyQ' })
        const running = emulator.run(1000)
        await pauseUntil(() => emulator.interrupt !== undefined)
        expect(emulator.interrupt).toEqual({
            type: X86_INPUT_INTERRUPT,
            message: 'Waiting for a key'
        })
        x86Input.keyDown({ code: 'KeyA' })
        await running
        expect(emulator.errors).toEqual([])
        expect(emulator.interrupt).toBe(undefined)
        expect(cpu(emulator, 'r12')).toBe(72n)
        //the Core frames the key as the guest's keyboard driver does
        expect(eventsIn(emulator, 3)).toEqual([
            { type: EV_MSC, code: MSC_SCAN, value: 0x1e },
            { type: EV_KEY, code: KEY_A, value: 1 },
            { type: EV_SYN, code: 0, value: 0 }
        ])
    })

    it('wakes a blocking read of the tablet with a move, scaled as QEMU scales it', async () => {
        const input = sources(program(readEvents('tablet')))
        const emulator = await emulatorFor(input)
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; read'))
        const running = emulator.run(1000)
        await pauseUntil(() => emulator.interrupt !== undefined)
        expect(emulator.interrupt?.message).toBe('Waiting for the pointer')
        emulator.peripherals.x86Input.moveTo(16, 36)
        await running
        expect(emulator.errors).toEqual([])
        expect(eventsIn(emulator, 3)).toEqual([
            { type: EV_ABS, code: 0, value: Math.floor((16 * 32767) / 64) },
            { type: EV_ABS, code: 1, value: Math.floor((36 * 32767) / 48) },
            { type: EV_SYN, code: 0, value: 0 }
        ])
    })

    it('gives a Testcase no key, and its poll times out on the virtual clock', async () => {
        const input = sources(
            program(
                [
                    ...sys(2, 'kbd', O_NONBLOCK, 0),
                    'mov r14, rax',
                    'mov [fds], r14d',
                    //the Screen's keys while the Testcase runs, as the Terminal is written to
                    ...sys(1, 1, 'kbd', 1),
                    ...sys(0, 'r14', 'buf', 24),
                    'mov r12, rax',
                    ...sys(7, 'fds', 1, 100),
                    'mov r13, rax',
                    ...exit
                ],
                ['fds: dd 0', 'dw 1, 0']
            )
        )
        const emulator = await emulatorFor(input)
        native(emulator).on('stdout', () => emulator.peripherals.x86Input.keyDown({ code: 'KeyA' }))
        const [result] = await emulator.test(
            input,
            //EAGAIN, then a poll that found nothing
            [testcase({ r12: 0xfffffffffffffff5n, r13: 0n }, '/')],
            1000
        )
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
    })
})

describe('the x86 sound devices', () => {
    function withAudio() {
        const clock = new ProgramClock({ mode: 'virtual' })
        const output = new RecordingAudioOutput()
        return { clock, output, audio: new Audio({ clock, output }) }
    }

    it("plays /dev/dsp's samples through the Audio", async () => {
        const input = sources(
            program([
                ...sys(2, 'dsp', O_WRONLY, 0),
                'mov r14, rax',
                'lea rdi, [buf]',
                'mov ecx, 4096',
                'mov al, 0xc0',
                'rep stosb',
                ...sys(1, 'r14', 'buf', 4096),
                'mov r12, rax',
                ...exit
            ])
        )
        const { clock, output, audio } = withAudio()
        const emulator = await emulatorFor(input, { clock, audio })
        await emulator.compile(100, input)
        await emulator.run(10_000)
        expect(emulator.errors).toEqual([])
        expect(cpu(emulator, 'r12')).toBe(4096n)
        const pcm = commandsOf(output, 'pcm')
        expect(pcm.length).toBeGreaterThan(0)
        for (const command of pcm) {
            if (command.type !== 'pcm') continue
            expect(command.rate).toBe(8000)
            //unsigned 8-bit 0xc0 is half way up, on both sides
            expect(command.frames[0]).toBeCloseTo(0.5)
            expect(command.frames[1]).toBeCloseTo(0.5)
        }
        //the program ended: what /dev/dsp holds plays out
        expect(commandsOf(output, 'programEnd')).toHaveLength(1)
    })

    it('plays a MIDI message and readies the port for it', async () => {
        const input = sources(
            program(
                [
                    ...sys(2, 'midi', O_WRONLY, 0),
                    'mov r14, rax',
                    ...sys(1, 'r14', 'note', 3),
                    ...sys(3, 'r14'),
                    ...exit
                ],
                ['note: db 0x90, 60, 100']
            )
        )
        const { clock, output, audio } = withAudio()
        const emulator = await emulatorFor(input, { clock, audio })
        await emulator.compile(100, input)
        await emulator.run(10_000)
        expect(emulator.errors).toEqual([])
        expect(output.prepared).toEqual([{ kind: 'midiPort' }])
        const midi = commandsOf(output, 'midi')
        expect(midi.map((command) => command.type === 'midi' && [...command.message])).toEqual([
            [0x90, 60, 100]
        ])
    })

    it('sounds the PC speaker, takes its tone back on Undo and silences it at Stop', async () => {
        const input = sources(
            program(
                [
                    ...sys(2, 'spkr', O_WRONLY, 0),
                    'mov r14, rax',
                    'nop ; opened',
                    ...sys(1, 'r14', 'tone', 24),
                    'nop ; sounding',
                    ...sys(0, 0, 'buf', 1),
                    ...exit
                ],
                //a struct input_event: no time, EV_SND, SND_TONE, 440 Hz
                ['tone: dq 0, 0', 'dw 0x12, 2', 'dd 440']
            )
        )
        const { clock, output, audio } = withAudio()
        const emulator = await emulatorFor(input, { clock, audio })
        await emulator.compile(100, input)
        emulator.toggleBreakpoint(lineOf(input, 'nop ; opened'))
        emulator.toggleBreakpoint(lineOf(input, 'nop ; sounding'))
        await emulator.run(1000)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        //the timer's nearest frequency: 1193182 ÷ ⌊1193182 ÷ 440⌋
        const tones = () =>
            commandsOf(output, 'tone').map((command) => command.type === 'tone' && command.hz)
        expect(tones()).toEqual([1193182 / 2711])
        //back before the write: the tone goes, at once
        expect(emulator.undo(1)).toBe(1)
        expect(commandsOf(output, 'cut').at(-1)).toMatchObject({ device: 'speaker' })
        expect(tones().at(-1)).toBe(0)
        await emulator.run(1000)
        expect(tones().at(-1)).toBe(1193182 / 2711)
        //waiting on a read when Stop comes: everything is silenced
        const running = emulator.run(1000)
        await pauseUntil(() => emulator.interrupt !== undefined)
        emulator.clear()
        await running
        expect(output.commands.at(-1)).toEqual({ type: 'stopAll' })
    })

    it('keeps a Testcase silent while /dev/dsp keeps its time on the virtual clock', async () => {
        const input = sources(
            program([
                ...sys(2, 'dsp', O_WRONLY, 0),
                'mov r14, rax',
                ...sys(1, 'r14', 'buf', 4096),
                ...sys(228, 1, 'ts'),
                ...sys(16, 'r14', SNDCTL_DSP_SYNC, 0),
                ...sys(228, 1, 'ts+16'),
                //the milliseconds SYNC waited
                'mov rax, [ts+16]',
                'sub rax, [ts]',
                'imul rax, rax, 1000',
                'mov r12, rax',
                'mov rax, [ts+24]',
                'sub rax, [ts+8]',
                'cqo',
                'mov rcx, 1000000',
                'idiv rcx',
                'add r12, rax',
                ...exit
            ])
        )
        const { clock, output, audio } = withAudio()
        const emulator = await emulatorFor(input, { clock, audio })
        const [result] = await emulator.test(input, [testcase()], 10_000)
        expect(result.errors).toEqual([])
        //4096 unsigned 8-bit samples at 8000 Hz are 512 ms of sound
        expect(Number(cpu(emulator, 'r12'))).toBeGreaterThanOrEqual(512)
        expect(output.commands.filter((command) => command.type !== 'stopAll')).toEqual([])
    })
})
