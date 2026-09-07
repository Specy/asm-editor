import { describe, expect, it } from 'vitest'
import { M68KEmulator } from './M68K/M68KEmulator.svelte'
import { Z80Emulator } from './Z80/Z80Emulator.svelte'
import { MIPSEmulator } from './MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from './RISC-V/RISC-VEmulator.svelte'

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
            '    out ($10), a',
            '    ld a, 0',
            '    out ($13), a',
            '    out ($14), a'
        ],
        draw: '    out ($17), a',
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
                      '    out ($17),a',
                      '    ld a,3',
                      '    out ($10),a',
                      '    ld a,0',
                      '    out ($17),a',
                      '    ld a,13',
                      '    out ($17),a'
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
            program.name === 'M68K' ? ['    move.b #4,d0', '    trap #15'] : ['    in a,($01)']
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
        '    out ($13),a',
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
