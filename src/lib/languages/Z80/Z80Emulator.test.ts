import { describe, expect, it } from 'vitest'
import { Z80Emulator } from '$lib/languages/Z80/Z80Emulator.svelte'

/**
 * The slice contract against a real Core. `@specy/z80` is plain TypeScript, so it is the one adapter
 * that can be driven end to end under node, which makes it the guard for the scheduler of
 * [ADR 0007](../../../../docs/adr/0007-generic-emulator-run-scheduling.md): a program still runs to
 * its end across slices, an unbounded run yields often enough for Stop to be answered, and the
 * overall instruction limit survives being split up.
 */

const INFINITE_LOOP = ['    org $8000', 'loop:', '    jp loop'].join('\n')

/**
 * Clears and presents the whole Screen as fast as it can. Three `out`s and two `ld`s a frame, each
 * clear a hundred thousand pixels and a journal record of the image it overwrote: the case where an
 * instruction budget says nothing about how long the host will be held.
 */
const DRAWING_LOOP = [
    'P_FILL  equ 0x11',
    'P_CMD   equ 0x17',
    '        org $8000',
    'start:  ld a, 11',
    '        out (P_CMD), a      ; draw off screen',
    'loop:   ld a, 0x03',
    '        out (P_FILL), a',
    '        ld a, 9',
    '        out (P_CMD), a      ; clear',
    '        ld a, 13',
    '        out (P_CMD), a      ; present',
    '        jp loop'
].join('\n')

/**
 * Draws a pixel, waits a tenth of a second of program time, prints the elapsed hundredths and echoes
 * a character read from the console port. It is the matrix's "testcase over a drawing program"
 * (row Z8): scripted input answers the character port, the wait completes at once on the virtual
 * clock and the elapsed-time port starts at zero for the run (ADR 0002, ADR 0010).
 */
const DRAWING_TESTCASE_PROGRAM = [
    '        org $8000',
    '        ld a, 0xFF',
    '        out (0x10), a       ; white pen',
    '        ld a, 100',
    '        out (0x13), a',
    '        out (0x14), a',
    '        ld a, 0',
    '        out (0x17), a       ; draw the pixel at (100, 100), clear of the text cursor',
    '        ld c, 0x40',
    '        ld b, 10',
    '        in a, (c)           ; a tenth of a second of program time',
    '        ld c, 0x42',
    '        ld b, 0',
    '        in a, (c)           ; the lowest byte of the elapsed hundredths',
    '        out (0x01), a       ; printed as an unsigned number',
    '        in a, (0x00)        ; a character of the testcase input',
    '        out (0x00), a       ; echoed back',
    '        halt'
].join('\n')

/**
 * Draws a pixel, which is what moves the Terminal's reads to the Screen's Keyboard, and then reads a
 * decimal number: a line read, whose echo draws one glyph per typed character while a single `in` is
 * suspended. Four Core steps touch the Screen and the journal has to hold four records
 * ([ADR 0005](../../../../docs/adr/0005-restore-screen-state-on-undo.md), ADR 0009).
 */
const READ_LINE_PROGRAM = [
    '        org $8000',
    '        ld a, 0xFF',
    '        out (0x10), a       ; white pen',
    '        ld a, 50',
    '        out (0x13), a',
    '        out (0x14), a',
    '        ld a, 0',
    '        out (0x17), a       ; the pixel at (50, 50)',
    '        in a, (0x01)        ; a decimal number, typed and echoed at the text cursor',
    '        out (0x01), a       ; printed back',
    '        halt'
].join('\n')

describe('Z80 source set', () => {
    it('assembles included Files and retains their source identity', async () => {
        const sources = {
            entry: 'main.asm',
            files: {
                'main.asm': { encoding: 'plain' as const, content: '#include "lib.asm"\n' },
                'lib.asm': {
                    encoding: 'plain' as const,
                    content: '    org $8000\n    ld a, 7\n    halt\n'
                }
            }
        }
        const emulator = Z80Emulator(sources)
        await emulator.compile(20, sources)
        await emulator.run(100)
        expect(emulator.errors).toEqual([])
        expect(emulator.registers.find((register) => register.name === 'a')?.value).toBe(7n)
        expect(emulator.currentFile).toBe('lib.asm')
    })

    it('embeds binary Files without transcoding their bytes', async () => {
        const sources = {
            entry: 'main.asm',
            files: {
                'main.asm': {
                    encoding: 'plain' as const,
                    content:
                        '    org $8000\n    jp start\ndata:\n    #insert "blob.bin"\nstart:\n    ld a, (data)\n    halt\n'
                },
                'blob.bin': { encoding: 'base64' as const, content: '/w==' }
            }
        }
        const emulator = Z80Emulator(sources)
        await emulator.compile(20, sources)
        await emulator.run(100)
        expect(emulator.errors).toEqual([])
        expect(emulator.registers.find((register) => register.name === 'a')?.value).toBe(255n)
    })
})

describe('Z80 Screen journal', () => {
    it('journals one record per Core step, echo of a whole typed line included', async () => {
        const code = READ_LINE_PROGRAM
        const emulator = Z80Emulator(code)
        await emulator.compile(100, code)
        //queued before the run: the read suspends until the Keyboard has a line to give it
        emulator.peripherals.keyboard.typeText('42\n')
        await emulator.run(100_000)
        const screen = emulator.peripherals.screen
        expect(emulator.stdOut).toBe('42\n42')
        //the pen `out`, the drawing `out`, the one `in` whose echo drew three glyphs, and the
        //`out` that printed the number back at the text cursor: four steps, four records
        expect(screen.history.sequence).toBe(4)
        expect(colorAt(screen, 50, 50)).toBe(0xffffff)

        //and walking the whole program back empties the journal with it, rather than leaving
        //records the Core has no steps left to pop
        emulator.undo(100)
        expect(screen.history.sequence).toBe(0)
        expect(colorAt(screen, 50, 50)).toBe(0)
    })
})

describe('Z80 reset and testcases', () => {
    it('leaves a blank Screen and no input state after a rebuild', async () => {
        const code = DRAWING_TESTCASE_PROGRAM
        const emulator = Z80Emulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.terminal.useScriptedInput(['a'])
        await emulator.run(100_000)
        const screen = emulator.peripherals.screen
        expect(colorAt(screen, 100, 100)).toBe(0xffffff)
        emulator.peripherals.keyboard.typeText('hello')
        emulator.peripherals.mouse.buttonDown('left', 10, 10)
        //a Build resets every peripheral on the Terminal's own clear path (the design record)
        await emulator.compile(0, code)
        expect(colorAt(emulator.peripherals.screen, 100, 100)).toBe(0)
        expect(emulator.peripherals.keyboard.hasTypedInput()).toBe(false)
        expect(emulator.peripherals.mouse.lastDown().event).toBe(0)
        expect(emulator.stdOut).toBe('')
    })

    it('runs a testcase over a drawing program on a virtual clock', async () => {
        const code = DRAWING_TESTCASE_PROGRAM
        const emulator = Z80Emulator(code)
        await emulator.compile(0, code)
        const started = Date.now()
        const [result] = await emulator.test(
            code,
            [
                {
                    input: ['q'],
                    expectedOutput: '10q',
                    startingRegisters: {},
                    expectedRegisters: {},
                    startingMemory: [],
                    expectedMemory: []
                }
            ],
            100_000
        )
        //the elapsed time is the ten hundredths the program waited, on a clock that started at zero,
        //and the wait itself cost no wall clock at all
        expect(result.passed).toBe(true)
        expect(Date.now() - started).toBeLessThan(1_000)
        //the drawing happened too, on a Screen the testcase reset before it started
        expect(colorAt(emulator.peripherals.screen, 100, 100)).toBe(0xffffff)
    })
})

describe('Z80 emulator slices', () => {
    it('runs a program to its end across slices', async () => {
        //port 1 is the unsigned decimal console port, so three 'x' come out as three 120s
        const code = [
            '    org $8000',
            '    ld b, 3',
            'loop:',
            "    ld a, 'x'",
            '    out ($01), a',
            '    djnz loop',
            '    halt'
        ].join('\n')
        const emulator = Z80Emulator(code)
        await emulator.compile(10, code)
        await emulator.run(2_000_000)
        expect(emulator.stdOut).toBe('120120120')
        expect(emulator.terminated).toBe(true)
        expect(emulator.errors).toEqual([])
    })

    it('answers Stop during an unbounded run', async () => {
        const emulator = Z80Emulator(INFINITE_LOOP)
        await emulator.compile(0, INFINITE_LOOP)
        //0 means "no limit": the whole point of slicing is that this still yields to the host
        const run = emulator.run(0)
        await new Promise((resolve) => setTimeout(resolve, 100))
        const stoppedAt = Date.now()
        emulator.clear()
        await run
        //ADR 0007's target is a tenth of a second; the run stops between two slices
        expect(Date.now() - stoppedAt).toBeLessThan(100)
        expect(emulator.errors).toEqual([])
    })

    it('ends a slice on its deadline when its instructions are screens of work', async () => {
        const emulator = Z80Emulator(DRAWING_LOOP)
        await emulator.compile(0, DRAWING_LOOP)
        //the adapter's own throughput estimate would let ten thousand instructions into a 1 ms
        //slice; a clear and a present each cost a hundred thousand pixels, so the slice has to come
        //back on the clock long before that (phase 8)
        const slice = await (
            emulator as unknown as {
                _runSlice: (request: {
                    instructionBudget: number
                    timeBudgetMs: number
                    breakpoints: number[]
                    runInstructionLimit: number
                    speedCorrection: number
                }) => Promise<{ reason: string; instructions: number }>
            }
        )._runSlice({
            instructionBudget: 1_000_000,
            timeBudgetMs: 1,
            breakpoints: [],
            runInstructionLimit: 1_000_000,
            speedCorrection: 1
        })
        expect(slice.reason).toBe('budget')
        expect(slice.instructions).toBeGreaterThan(0)
        expect(slice.instructions).toBeLessThan(10_000)
    })

    it('ends a run at the instruction limit instead of restarting it every slice', async () => {
        const emulator = Z80Emulator(INFINITE_LOOP)
        await emulator.compile(0, INFINITE_LOOP)
        const start = Date.now()
        await emulator.run(500_000)
        //an unbroken loop reaches the limit, which is not an error on this Core, and stops there
        expect(emulator.terminated).toBe(false)
        expect(emulator.errors).toEqual([])
        expect(Date.now() - start).toBeLessThan(5_000)
    })
})

/** The 24 bit color the renderer would paint at a point of the visible image. */
function colorAt(
    screen: { visiblePixels: Uint8ClampedArray; width: number },
    x: number,
    y: number
): number {
    const offset = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]
}
