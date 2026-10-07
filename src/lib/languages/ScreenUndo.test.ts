import { describe, expect, it } from 'vitest'
import { M68KEmulator } from './M68K/M68KEmulator.svelte'
import { Z80Emulator } from './Z80/Z80Emulator.svelte'
import { MIPSEmulator } from './MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from './RISC-V/RISC-VEmulator.svelte'
import { FileSystem } from './peripherals/FileSystem'
import { fileText } from '$lib/projectFiles'
import { CPU_REGISTER_FILE_ID } from './GenericEmulator.svelte'

const display = { unitWidth: 8, unitHeight: 8, width: 64, height: 64, baseAddress: 0x10010000 }
const programs = [
    {
        name: 'M68K',
        create: (code: string) => M68KEmulator(code),
        setup: [
            '    ORG $1000',
            '    move.l #$000000ff,d1',
            '    move.b #80,d0',
            '    trap #15',
            '    move.l #0,d1',
            '    move.l #0,d2',
            '    move.b #82,d0'
        ],
        draw: '    trap #15',
        end: ['    move.b #9,d0', '    trap #15'],
        loop: '    bra draw'
    },
    {
        name: 'Z80',
        create: (code: string) => Z80Emulator(code),
        setup: [
            '    org $8000',
            '    ld a, $e0',
            '    out ($20), a',
            '    ld a, 0',
            '    out ($23), a',
            '    out ($24), a'
        ],
        draw: '    out ($27), a',
        end: ['    halt'],
        loop: '    jp draw'
    },
    ...[
        {
            name: 'MIPS',
            create: (code: string) => MIPSEmulator(code, { display }),
            prefix: '$',
            end: ['    li $v0, 10', '    syscall'],
            loop: '    j draw'
        },
        {
            name: 'RISC-V',
            create: (code: string) => RISCVEmulator(code, { display }),
            prefix: '',
            end: ['    li a7, 10', '    ecall'],
            loop: '    j draw'
        }
    ].map(({ name, create, prefix, end, loop }) => ({
        name,
        create,
        end,
        loop,
        setup: [
            '    .data',
            'display: .space 16384',
            '    .text',
            'main:',
            `    la ${prefix}t0, display`,
            `    li ${prefix}t1, 0x00ff0000`
        ],
        draw: `    sw ${prefix}t1, 0(${prefix}t0)`
    }))
]

type Emulator = ReturnType<(typeof programs)[number]['create']>
function pixel(emulator: Emulator) {
    const bytes = emulator.peripherals.screen.visiblePixels
    return (bytes[0] << 16) | (bytes[1] << 8) | bytes[2]
}

async function stepTo(emulator: Emulator, line: number) {
    for (let i = 0; i < 40 && emulator.line !== line; i++) await emulator.step()
    expect(emulator.line).toBe(line)
}

describe.each(programs)('$name instruction-aligned screen undo', (program) => {
    it.each(['step', 'breakpoint', 'pause'])(
        'keeps red for four undos after %s, then restores the drawing',
        async (mode) => {
            const code = [
                ...program.setup,
                program.draw,
                '    nop',
                '    nop',
                '    nop',
                '    nop',
                'finish: nop',
                ...program.end
            ].join('\n')
            const emulator = program.create(code)
            try {
                await emulator.check()
                await emulator.compile(100, code)
                const stopLine = code.split('\n').findIndex((line) => line.startsWith('finish:'))
                if (mode === 'step') {
                    await stepTo(emulator, stopLine)
                } else {
                    emulator.toggleBreakpoint(stopLine)
                    if (mode === 'pause') {
                        //Use the Core breakpoint only to place the fixture precisely four NOPs after
                        //drawing. The scheduler receives a budget result and a real Pause request.
                        const runSlice = emulator._runSlice.bind(emulator)
                        emulator._runSlice = async (request) => {
                            const result = await runSlice(request)
                            expect(result.reason).toBe('breakpoint')
                            emulator.pause()
                            return { reason: 'budget', instructions: 1 }
                        }
                    }
                    await emulator.run(1000)
                }
                expect(emulator.errors).toEqual([])
                expect(emulator.line).toBe(stopLine)
                expect(emulator.paused).toBe(mode === 'pause')
                expect(pixel(emulator)).toBe(0xff0000)
                const version = emulator.peripherals.screen.version
                for (let i = 0; i < 4; i++) {
                    emulator.undo(1)
                    expect(pixel(emulator)).toBe(0xff0000)
                    if (program.name === 'M68K' || program.name === 'Z80') {
                        expect(emulator.peripherals.screen.version).toBe(version)
                    }
                }
                emulator.undo(1)
                expect(pixel(emulator)).toBe(0)
                await emulator.step()
                expect(pixel(emulator)).toBe(0xff0000)
                emulator.undo(1)
                expect(pixel(emulator)).toBe(0)
            } finally {
                emulator.dispose()
            }
        }
    )

    it('identifies repeated drawing instructions after the CPU history wraps', async () => {
        const code = [
            ...program.setup,
            `draw: ${program.draw.trim()}`,
            '    nop',
            '    nop',
            '    nop',
            '    nop',
            `finish: ${program.loop.trim()}`
        ].join('\n')
        const emulator = program.create(code)
        try {
            await emulator.check()
            await emulator.compile(12, code)
            const stopLine = code.split('\n').findIndex((line) => line.startsWith('finish:'))
            emulator.toggleBreakpoint(stopLine)
            for (let i = 0; i < 8; i++) await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            expect(pixel(emulator)).toBe(0xff0000)
            //The most recent draw painted red over red. Undoing it preserves the previous red,
            //and rerunning from its restored PC must still work after IDs/timestamps advance.
            emulator.undo(5)
            expect(pixel(emulator)).toBe(0xff0000)
            await emulator.run(1000)
            expect(emulator.line).toBe(stopLine)
            expect(pixel(emulator)).toBe(0xff0000)
        } finally {
            emulator.dispose()
        }
    })
})

describe.each(programs.slice(0, 2))('$name drawing history boundaries', (program) => {
    it('allows four unrelated undos even when the drawing exceeds the history budget', async () => {
        const code = [
            ...program.setup,
            program.draw,
            '    nop',
            '    nop',
            '    nop',
            '    nop',
            'finish: nop',
            ...program.end
        ].join('\n')
        const emulator = program.create(code)
        try {
            await emulator.check()
            await emulator.compile(100, code)
            emulator.peripherals.screen.history.byteBudget = 0
            emulator.toggleBreakpoint(
                code.split('\n').findIndex((line) => line.startsWith('finish:'))
            )
            await emulator.run(1000)
            emulator.undo(4)
            expect(pixel(emulator)).toBe(0xff0000)
            expect(emulator.canUndo).toBe(false)
            const pc = emulator.pc
            emulator.undo(1)
            expect(emulator.pc).toBe(pc)
            expect(pixel(emulator)).toBe(0xff0000)
        } finally {
            emulator.dispose()
        }
    })

    it('restores a presentation and off-screen drawing at their own instruction boundaries', async () => {
        const buffering =
            program.name === 'M68K'
                ? [
                      '    move.b #92,d0',
                      '    move.l #17,d1',
                      '    trap #15',
                      '    move.b #80,d0',
                      '    move.l #$00ff0000,d1',
                      '    trap #15',
                      '    move.b #82,d0',
                      '    move.l #0,d1',
                      '    trap #15',
                      '    move.b #94,d0',
                      '    trap #15'
                  ]
                : [
                      '    ld a,11',
                      '    out ($27),a',
                      '    ld a,3',
                      '    out ($20),a',
                      '    ld a,0',
                      '    out ($27),a',
                      '    ld a,13',
                      '    out ($27),a'
                  ]
        const code = [
            ...program.setup,
            program.draw,
            ...buffering,
            '    nop',
            '    nop',
            '    nop',
            '    nop',
            'finish: nop',
            ...program.end
        ].join('\n')
        const emulator = program.create(code)
        try {
            await emulator.check()
            await emulator.compile(100, code)
            emulator.toggleBreakpoint(
                code.split('\n').findIndex((line) => line.startsWith('finish:'))
            )
            await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            const screen = emulator.peripherals.screen
            expect(screen.doubleBuffering).toBe(true)
            expect(pixel(emulator)).toBe(0x0000ff)
            emulator.undo(4)
            expect(pixel(emulator)).toBe(0x0000ff)
            emulator.undo(1)
            expect(pixel(emulator)).toBe(0xff0000)
            expect(screen.getPixel(0, 0)).toBe(0x0000ff)
            const version = screen.version
            emulator.undo(2)
            expect(screen.getPixel(0, 0)).toBe(0xff0000)
            expect(pixel(emulator)).toBe(0xff0000)
            expect(screen.version).toBe(version)
            await emulator.run(1000)
            expect(pixel(emulator)).toBe(0x0000ff)
        } finally {
            emulator.dispose()
        }
    })

    it('keeps a whole input echo attached to the input instruction after Run', async () => {
        const input =
            program.name === 'M68K' ? ['    move.b #4,d0', '    trap #15'] : ['    in a,($11)']
        const code = [
            ...program.setup,
            ...input,
            '    nop',
            '    nop',
            '    nop',
            '    nop',
            'finish: nop',
            ...program.end
        ].join('\n')
        const emulator = program.create(code)
        try {
            await emulator.check()
            await emulator.compile(100, code)
            emulator.peripherals.keyboard.typeText('42\n')
            emulator.toggleBreakpoint(
                code.split('\n').findIndex((line) => line.startsWith('finish:'))
            )
            await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            expect(emulator.stdOut).toBe('42\n')
            const screen = emulator.peripherals.screen
            const echoed = screen.visiblePixels.slice()
            expect(echoed.some((value, index) => index % 4 !== 3 && value !== 0)).toBe(true)
            emulator.undo(4)
            expect(screen.visiblePixels.every((value, index) => value === echoed[index])).toBe(true)
            emulator.undo(1)
            expect(
                screen.visiblePixels.every((value, index) => index % 4 === 3 || value === 0)
            ).toBe(true)
        } finally {
            emulator.dispose()
        }
    })
})

it('restores Z80 drawing coordinates before drawing again after undo', async () => {
    const program = programs[1]
    const code = [
        ...program.setup,
        '    ld a,7',
        '    out ($23),a',
        '    ld a,0',
        program.draw,
        'finish: nop',
        '    halt'
    ].join('\n')
    const emulator = program.create(code)
    try {
        await emulator.check()
        await emulator.compile(100, code)
        emulator.toggleBreakpoint(code.split('\n').findIndex((line) => line.startsWith('finish:')))
        await emulator.run(1000)
        const screen = emulator.peripherals.screen
        expect(screen.getPixel(7, 0)).toBe(0xff0000)
        emulator.undo(3)
        //Undo the draw, LD A,0 and OUT X. The staged coordinate must be restored with the pixels;
        //replaying from the coordinate OUT must then reproduce the original drawing.
        expect(screen.getPixel(7, 0)).toBe(0)
        const device = emulator as unknown as { device: { drawingState(): { x: number } } }
        expect(device.device.drawingState().x).toBe(0)
        await emulator.run(1000)
        expect(screen.getPixel(7, 0)).toBe(0xff0000)
    } finally {
        emulator.dispose()
    }
})

it('restores M68K drawing and Files at their own instruction boundaries', async () => {
    //a Step of the Core is one id for both journals: the Screen's records and the FileSystem's
    //frames are popped by the Undo of the trap that made them, and by no other
    //([ADR 0015](../../../docs/adr/0015-restore-file-operations-on-undo.md))
    const program = programs[0]
    const code = [
        ...program.setup,
        program.draw,
        '    lea name,a1',
        '    move.b #52,d0',
        '    trap #15',
        '    move.l d1,d7',
        '    lea text,a1',
        '    move.l #2,d2',
        '    move.l d7,d1',
        '    move.b #54,d0',
        '    trap #15',
        'finish: nop',
        ...program.end,
        "name: dc.b 'log.txt',0",
        "text: dc.b 'hi'"
    ].join('\n')
    const fileSystem = new FileSystem()
    const emulator = M68KEmulator(code, { peripherals: { fileSystem } })
    const log = () => {
        const file = fileSystem.files['log.txt']
        return file === undefined ? undefined : fileText(file)
    }
    try {
        await emulator.compile(100, code)
        emulator.toggleBreakpoint(code.split('\n').findIndex((line) => line.startsWith('finish:')))
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(pixel(emulator)).toBe(0xff0000)
        expect(log()).toBe('hi')
        //the write's trap: the File empties, the drawing stays
        emulator.undo(1)
        expect(log()).toBe('')
        expect(pixel(emulator)).toBe(0xff0000)
        //back through the open's trap, which created the File
        emulator.undo(6)
        expect(log()).toBeUndefined()
        expect(pixel(emulator)).toBe(0xff0000)
        //and through the drawing's
        emulator.undo(3)
        expect(pixel(emulator)).toBe(0)
        expect(log()).toBeUndefined()
        await emulator.run(1000)
        expect(pixel(emulator)).toBe(0xff0000)
        expect(log()).toBe('hi')
    } finally {
        emulator.dispose()
    }
})

it.each(['Screen', 'FileSystem'])(
    'preflights both M68K journals when the %s budget is exhausted',
    async (exhausted) => {
        const code = [
            '    org $1000',
            '    lea name,a1',
            '    move.b #52,d0',
            '    trap #15',
            ...programs[0].setup.slice(1),
            programs[0].draw,
            ...programs[0].end,
            "name: dc.b 'log.txt',0"
        ].join('\n')
        const fileSystem = new FileSystem()
        const emulator = M68KEmulator(code, {
            peripherals: { fileSystem },
            screenHistoryBudgetMb: exhausted === 'Screen' ? 0 : 16,
            fileSystemHistoryBudgetMb: exhausted === 'FileSystem' ? 0 : 16
        })
        try {
            await emulator.compile(100, code)
            await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            expect(pixel(emulator)).toBe(0xff0000)
            for (let steps = 0; emulator.canUndo && steps < 40; steps++) emulator.undo(1)
            expect(emulator.canUndo).toBe(false)
            const pc = emulator._getPc()
            const registers = emulator._getRegisterValues()
            const pixels = [...emulator.peripherals.screen.visiblePixels]
            const files = structuredClone(fileSystem.files)
            expect(emulator.undo(1)).toBe(0)
            expect(() => emulator._undo()).toThrow(`${exhausted} Undo history exhausted`)
            expect(emulator._getPc()).toBe(pc)
            expect(emulator._getRegisterValues()).toEqual(registers)
            expect([...emulator.peripherals.screen.visiblePixels]).toEqual(pixels)
            expect(fileSystem.files).toEqual(files)
            expect(fileText(fileSystem.files['log.txt'])).toBe('')
            //A Poke is still reversible above the blocked instruction and has no File/Screen effects.
            expect(
                emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'D7', value: 0x99n }])
            ).toBe(true)
            expect(emulator.canUndo).toBe(true)
            expect(emulator.undo(1)).toBe(1)
            expect(emulator.canUndo).toBe(false)
            expect(emulator._getPc()).toBe(pc)
            expect(emulator._getRegisterValues()).toEqual(registers)
            expect([...emulator.peripherals.screen.visiblePixels]).toEqual(pixels)
            expect(fileSystem.files).toEqual(files)
        } finally {
            emulator.dispose()
        }
    }
)
