import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { M68KEmulator } from '$lib/languages/M68K/M68KEmulator.svelte'
import { M68K_TRAP_DOCS, screenColorOf } from '$lib/languages/M68K/M68K-traps'
import { Keyboard } from '$lib/languages/peripherals/Keyboard'
import { KEY_CODES, letterKeyCode } from '$lib/languages/peripherals/keyCodes'
import { BLACK } from '$lib/languages/peripherals/screen/color'

/**
 * The `trap #15` interface against the real Core under node: every task the editor supports, routed
 * to the Screen, the Keyboard, the Mouse and the clock
 * ([ADR 0003](../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)), plus the four
 * example programs of `examples/m68k/`. What is asserted is what a user sees — pixels, the
 * transcript, the registers — not how the adapter got there.
 */

const ORG = '    ORG $1000\n'

/** Enough for every program here; the animated ones loop forever and are cut off by it. */
const INSTRUCTION_LIMIT = 200_000

async function run(body: string, options: { limit?: number } = {}) {
    const code = ORG + body
    const emulator = M68KEmulator(code)
    await emulator.compile(0, code)
    await emulator.run(options.limit ?? INSTRUCTION_LIMIT)
    return emulator
}

/**
 * The default Keyboard applies at most one queued transition per read and never faster than its
 * hold interval, so a test that presses two keys and reads once would see one of them. Zero here
 * keeps the "one per read" half, which is what the register packing is being checked against; the
 * interval itself has its own tests in `Keyboard.test.ts`.
 */
function instantKeyboard() {
    return { peripherals: { keyboard: new Keyboard({ holdIntervalMs: 0 }) } }
}

function registerOf(emulator: Awaited<ReturnType<typeof run>>, name: string): bigint {
    const register = emulator.registers.find((candidate) => candidate.name === name)
    if (!register) throw new Error(`No register ${name}`)
    return register.value
}

/** `trap #15` with the task in D0 and whatever else the caller sets up first. */
function trap(task: number, before: string[] = []): string {
    return [...before, `    move.b #${task},d0`, '    trap #15'].join('\n') + '\n'
}

function pixelAt(emulator: Awaited<ReturnType<typeof run>>, x: number, y: number): number {
    const screen = emulator.peripherals.screen
    const offset = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]
}

function inkCount(emulator: Awaited<ReturnType<typeof run>>): number {
    const pixels = emulator.peripherals.screen.visiblePixels
    let ink = 0
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0) ink++
    }
    return ink
}

describe('M68K text tasks', () => {
    it('writes printed text to the transcript and to the Screen at once', async () => {
        const emulator = await run(trap(14, ['    lea text,a1']) + trap(9) + "text: dc.b 'Hi',0\n")
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('Hi')
        //two 8 by 16 cells of glyph on the Screen, in the default pen color
        expect(inkCount(emulator)).toBeGreaterThan(20)
        expect(emulator.peripherals.screen.cursorColumn).toBe(2)
    })

    it('displays a signed number right justified in the field of task 20', async () => {
        const emulator = await run(trap(20, ['    move.l #-42,d1', '    move.b #8,d2']) + trap(9))
        expect(emulator.stdOut).toBe('     -42')
    })

    it('displays a string and a number with task 17', async () => {
        const emulator = await run(
            trap(17, ['    lea text,a1', '    move.l #7,d1']) + trap(9) + "text: dc.b 'n=',0\n"
        )
        expect(emulator.stdOut).toBe('n=7')
    })

    it('reads a number after a prompt with task 18', async () => {
        const code = ORG + trap(18, ['    lea text,a1']) + trap(9) + "text: dc.b 'n? ',0\n"
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.terminal.useScriptedInput(['21'])
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('n? ')
        expect(registerOf(emulator, 'D1')).toBe(21n)
    })

    it('moves the text cursor with task 11 and reads it back', async () => {
        const emulator = await run(
            trap(11, ['    move.w #$0503,d1']) + trap(11, ['    move.w #$00FF,d1']) + trap(9)
        )
        expect(emulator.peripherals.screen.cursorColumn).toBe(5)
        expect(emulator.peripherals.screen.cursorRow).toBe(3)
        //D1.W answers with the column in the high byte and the row in the low byte
        expect(Number(registerOf(emulator, 'D1')) & 0xffff).toBe(0x0503)
    })
})

describe('M68K graphics tasks', () => {
    it('draws a pixel in the pen color and reads it back with task 83', async () => {
        //EASy68K colors are $00BBGGRR, so pure red is $000000FF
        const emulator = await run(
            trap(80, ['    move.l #$000000FF,d1']) +
                trap(82, ['    move.l #10,d1', '    move.l #20,d2']) +
                trap(83, ['    move.l #10,d1', '    move.l #20,d2']) +
                //the answer is in D0, which the terminate task is about to overwrite
                '    move.l d0,d5\n' +
                trap(9)
        )
        expect(emulator.errors).toEqual([])
        expect(pixelAt(emulator, 10, 20)).toBe(0xff0000)
        expect(registerOf(emulator, 'D5')).toBe(0xffn)
    })

    it('fills a rectangle with the fill color and outlines it with the pen', async () => {
        const emulator = await run(
            trap(80, ['    move.l #$00FFFFFF,d1']) +
                trap(81, ['    move.l #$00FF0000,d1']) +
                trap(87, [
                    '    move.l #10,d1',
                    '    move.l #10,d2',
                    '    move.l #20,d3',
                    '    move.l #20,d4'
                ]) +
                trap(9)
        )
        expect(pixelAt(emulator, 10, 10)).toBe(0xffffff)
        expect(pixelAt(emulator, 15, 15)).toBe(0x0000ff)
        //the right and bottom edges are excluded, as they are in the Windows GDI EASy68K draws with
        expect(pixelAt(emulator, 20, 15)).toBe(BLACK)
    })

    it('moves the drawing point without drawing in mode 2 and draws again in mode 4', async () => {
        const emulator = await run(
            trap(80, ['    move.l #$00FFFFFF,d1']) +
                trap(92, ['    move.b #2,d1']) +
                trap(86, ['    move.l #0,d1', '    move.l #0,d2']) +
                trap(85, ['    move.l #40,d1', '    move.l #0,d2']) +
                trap(92, ['    move.b #4,d1']) +
                trap(85, ['    move.l #80,d1', '    move.l #0,d2']) +
                trap(96) +
                trap(9)
        )
        //nothing was drawn under mode 2, but the point moved, so the mode 4 line starts at x = 40
        expect(pixelAt(emulator, 20, 0)).toBe(BLACK)
        expect(pixelAt(emulator, 60, 0)).toBe(0xffffff)
        expect(registerOf(emulator, 'D1')).toBe(80n)
    })

    it('keeps drawing off screen until task 94 shows it', async () => {
        const drawing =
            trap(81, ['    move.l #$0000FF00,d1']) +
            trap(87, [
                '    move.l #0,d1',
                '    move.l #0,d2',
                '    move.l #100,d3',
                '    move.l #100,d4'
            ])
        const hidden = await run(trap(92, ['    move.b #17,d1']) + drawing + trap(9))
        expect(pixelAt(hidden, 50, 50)).toBe(BLACK)
        const shown = await run(trap(92, ['    move.b #17,d1']) + drawing + trap(94) + trap(9))
        expect(pixelAt(shown, 50, 50)).toBe(0x00ff00)
    })

    it('resizes the screen with task 33 and answers the new size', async () => {
        const emulator = await run(
            //800 in the high word, 600 in the low word, EASy68K's packed request
            trap(33, ['    move.l #$03200258,d1']) + trap(33, ['    move.l #0,d1']) + trap(9)
        )
        expect(emulator.peripherals.screen.getSize()).toEqual({ width: 800, height: 600 })
        expect(registerOf(emulator, 'D1')).toBe(BigInt(0x03200258))
    })

    it('refuses to go below EASy68K‘s minimum window', async () => {
        const emulator = await run(trap(33, ['    move.l #$00400040,d1']) + trap(9))
        expect(emulator.peripherals.screen.getSize()).toEqual({ width: 640, height: 480 })
    })

    it('clears text and graphics together with task 11', async () => {
        const emulator = await run(
            trap(14, ['    lea text,a1']) +
                trap(80, ['    move.l #$00FFFFFF,d1']) +
                trap(82, ['    move.l #300,d1', '    move.l #300,d2']) +
                trap(11, ['    move.w #$FF00,d1']) +
                trap(9) +
                "text: dc.b 'gone',0\n"
        )
        expect(inkCount(emulator)).toBe(0)
        expect(emulator.peripherals.screen.cursorColumn).toBe(0)
        //the transcript is not a screen and keeps what was printed, which testcases assert on
        expect(emulator.stdOut).toBe('gone')
    })

    it('draws text at a pixel position with task 95', async () => {
        const emulator = await run(
            trap(80, ['    move.l #$00FFFFFF,d1']) +
                trap(95, ['    lea text,a1', '    move.l #100,d1', '    move.l #200,d2']) +
                trap(9) +
                "text: dc.b 'x',0\n"
        )
        expect(inkCount(emulator)).toBeGreaterThan(5)
        //nothing reached the transcript: task 95 is graphics, not printing
        expect(emulator.stdOut).toBe('')
    })
})

describe('M68K keyboard and mouse tasks', () => {
    /** Task 19 reads one queued transition at a time, so a poll loop is what a program writes. */
    const POLL_KEYS = (request: string) =>
        [
            '    move.w #6,d7',
            'poll:',
            `    move.l #${request},d1`,
            '    move.b #19,d0',
            '    trap #15',
            '    move.l d1,d6',
            '    dbra d7,poll'
        ].join('\n') + '\n'

    it('answers with one $FF byte per held key, in the order asked', async () => {
        const code = ORG + POLL_KEYS('$41535746') + trap(9)
        const emulator = M68KEmulator(code, instantKeyboard())
        await emulator.compile(0, code)
        //'A' and 'W' held, 'S' and 'F' not; the codes are ASCII capitals, EASy68K's table
        emulator.peripherals.keyboard.pressKey(letterKeyCode('a'))
        emulator.peripherals.keyboard.pressKey(letterKeyCode('w'))
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        //the codes were asked for as A, S, W, F, so the answer bytes are FF 00 FF 00
        expect(registerOf(emulator, 'D6')).toBe(0xff00ff00n)
    })

    it('answers the last key up and the last key down with task 19 and D1.L = 0', async () => {
        const code = ORG + POLL_KEYS('0') + trap(9)
        const emulator = M68KEmulator(code, instantKeyboard())
        await emulator.compile(0, code)
        emulator.peripherals.keyboard.pressKey(KEY_CODES.SPACE)
        emulator.peripherals.keyboard.releaseKey(KEY_CODES.SPACE)
        await emulator.run(INSTRUCTION_LIMIT)
        //the last key up is the upper word, the last key down the lower one
        expect(registerOf(emulator, 'D6')).toBe(BigInt((KEY_CODES.SPACE << 16) | KEY_CODES.SPACE))
    })

    it('polls for pending input with task 7', async () => {
        const code = ORG + trap(7) + trap(9)
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.keyboard.typeText('k')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(registerOf(emulator, 'D1')).toBe(1n)
    })

    it('reports no pending input when nothing has been typed', async () => {
        const emulator = await run(trap(7) + trap(9))
        expect(registerOf(emulator, 'D1')).toBe(0n)
    })

    it('reads the mouse, its flags byte and its position with task 61', async () => {
        const code = ORG + trap(61, ['    move.b #2,d1']) + '    move.l d0,d5\n' + trap(9)
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        const { mouse, keyboard } = emulator.peripherals
        keyboard.pressKey(KEY_CODES.SHIFT)
        mouse.buttonDown('left', 120, 34)
        mouse.buttonUp('left', 120, 34)
        await emulator.run(INSTRUCTION_LIMIT)
        //the last press: left held and Shift held, so bit 0 and bit 4 of the flags byte
        expect(registerOf(emulator, 'D5')).toBe(0x11n)
        //Y in the high word, X in the low word
        expect(registerOf(emulator, 'D1')).toBe(BigInt((34 << 16) | 120))
    })

    it('accepts and ignores the simulator shortcut task', async () => {
        const emulator = await run(trap(24, ['    move.l #1,d1']) + trap(9))
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
    })
})

describe('M68K input in graphical use', () => {
    it('takes a character from the Screen keyboard and echoes it to both views', async () => {
        //the first graphics task is what moves the Terminal onto the Screen's Keyboard (ADR 0009)
        const code =
            ORG +
            trap(80, ['    move.l #$00FFFFFF,d1']) +
            trap(5) +
            trap(6, ['    move.b d1,d1']) +
            trap(9)
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        const run = emulator.run(INSTRUCTION_LIMIT)
        //typed after the program asked, which is what a suspended read has to survive
        await new Promise((resolve) => setTimeout(resolve, 50))
        emulator.peripherals.keyboard.typeText('q')
        await run
        expect(emulator.errors).toEqual([])
        //once as the echo of what was typed and once as what the program printed
        expect(emulator.stdOut).toBe('qq')
        expect(emulator.peripherals.screen.cursorColumn).toBe(2)
    })

    it('keeps the input prompt for a program that never touches the Screen', async () => {
        const code = ORG + trap(2, ['    lea buffer,a1']) + trap(9) + 'buffer: ds.b 32\n'
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        expect(emulator.peripherals.terminal.interactiveSource).toBe('prompt')
        emulator.peripherals.terminal.useScriptedInput(['typed'])
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        //scripted input is not echoed, like piped stdin, and nothing was drawn
        expect(emulator.stdOut).toBe('')
        expect(inkCount(emulator)).toBe(0)
    })
})

describe('M68K program time tasks', () => {
    it('reads the clock in hundredths of a second with task 8', async () => {
        const code = ORG + trap(8) + trap(9)
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.clock.start()
        await emulator.run(INSTRUCTION_LIMIT)
        const time = Number(registerOf(emulator, 'D1'))
        //hundredths since the run started, not Unix seconds: a program that just started is near 0
        expect(time).toBeGreaterThanOrEqual(0)
        expect(time).toBeLessThan(1000)
    })

    it('lets program time pass with task 23 without blocking the run', async () => {
        const started = Date.now()
        const emulator = await run(trap(23, ['    move.l #5,d1']) + trap(9))
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        //five hundredths of a second, on the host clock an interactive run uses
        expect(Date.now() - started).toBeGreaterThanOrEqual(40)
    })
})

describe('M68K unsupported tasks', () => {
    it('names the task and says why it is not supported', async () => {
        const emulator = await run(trap(10, ['    lea text,a1']) + trap(9) + "text: dc.b 'x',0\n")
        expect(emulator.errors.join('\n')).toContain(
            'Trap task 10 (print to the printer) is not supported: the editor has no printer'
        )
    })

    it('names an unknown task without pretending to know it', async () => {
        const emulator = await run(trap(99) + trap(9))
        expect(emulator.errors.join('\n')).toContain(
            'Trap task 99 is not a supported trap #15 task'
        )
    })

    it('lets the Core name the drawing mode it refused', async () => {
        const emulator = await run(trap(92, ['    move.b #14,d1']) + trap(9))
        expect(emulator.errors.join('\n')).toContain('Unsupported drawing mode: 14')
    })
})

describe('M68K Undo and testcases', () => {
    it('walks the Screen back with the code', async () => {
        //two pixels, drawn one step at a time, then undone one step at a time (ADR 0005)
        const code =
            ORG +
            trap(80, ['    move.l #$00FFFFFF,d1']) +
            trap(82, ['    move.l #10,d1', '    move.l #10,d2']) +
            trap(82, ['    move.l #20,d1', '    move.l #20,d2']) +
            trap(9)
        const emulator = M68KEmulator(code)
        //a history size, without which the Core keeps nothing to roll back to
        await emulator.compile(200, code)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(inkCount(emulator)).toBe(2)
        //back to before the second pixel, then before the first
        while (emulator.canUndo && inkCount(emulator) > 1) emulator.undo(1)
        expect(inkCount(emulator)).toBe(1)
        while (emulator.canUndo && inkCount(emulator) > 0) emulator.undo(1)
        expect(inkCount(emulator)).toBe(0)
    })

    it('runs a testcase over a drawing program on a virtual clock', async () => {
        const code =
            ORG +
            trap(23, ['    move.l #500,d1']) +
            trap(8) +
            '    move.l d1,d5\n' +
            trap(80, ['    move.l #$00FFFFFF,d1']) +
            trap(82, ['    move.l #5,d1', '    move.l #5,d2']) +
            trap(14, ['    lea text,a1']) +
            trap(9) +
            "text: dc.b 'done',0\n"
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        const started = Date.now()
        const [result] = await emulator.test(
            code,
            [
                {
                    input: [],
                    expectedOutput: 'done',
                    startingRegisters: {},
                    expectedRegisters: {},
                    startingMemory: [],
                    expectedMemory: []
                }
            ],
            INSTRUCTION_LIMIT
        )
        expect(result.passed).toBe(true)
        //five seconds of program time, and the testcase still finished at once (ADR 0010)
        expect(Date.now() - started).toBeLessThan(2_000)
        expect(Number(registerOf(emulator, 'D5'))).toBeGreaterThanOrEqual(500)
        //the drawing still happened, on a Screen the testcase reset before it started, and the
        //printed text was drawn at the cursor next to it as it is in an interactive run
        expect(pixelAt(emulator, 5, 5)).toBe(0xffffff)
        expect(inkCount(emulator)).toBeGreaterThan(50)
    })
})

describe('M68K trap documentation', () => {
    it('documents a task for every group', async () => {
        const groups = new Set(M68K_TRAP_DOCS.map((doc) => doc.group))
        expect([...groups].sort()).toEqual(['graphics', 'input', 'text', 'time'])
    })

    it('converts EASy68K colors both ways', () => {
        //$00BBGGRR: pure blue is $00FF0000 there and 0x0000FF on the Screen
        expect(screenColorOf(0x00ff0000)).toBe(0x0000ff)
        expect(screenColorOf(0x000000ff)).toBe(0xff0000)
        expect(screenColorOf(0x00ffffff)).toBe(0xffffff)
    })
})

describe('examples/m68k', () => {
    /**
     * Three of the four programs loop until Stop, so they are bounded by the instruction limit. An
     * M68K slice charges one instruction per trap and a delay charges none, so a limit of a few
     * hundred is a few dozen frames of a program that traps ten times and delays once per frame.
     */
    const FRAME_LOOP_LIMIT = 200

    /**
     * A program that loops until Stop ends by exhausting the run's instruction limit, which the
     * M68K Core reports as an error. That it is the only error is what these tests care about.
     */
    function expectStoppedAtLimit(emulator: Awaited<ReturnType<typeof run>>): void {
        expect(emulator.errors.length).toBe(1)
        expect(emulator.errors[0]).toContain('Execution limit of')
    }

    function load(name: string): string {
        return readFileSync(new URL(`../../../../examples/m68k/${name}`, import.meta.url), 'utf8')
    }

    async function runExample(name: string, limit: number, options = {}) {
        const code = load(name)
        const emulator = M68KEmulator(code, options)
        await emulator.compile(0, code)
        await emulator.run(limit)
        return emulator
    }

    /** The average x of every lit pixel: where what the program drew sits on the Screen. */
    function inkCentroidX(emulator: Awaited<ReturnType<typeof run>>): number {
        const screen = emulator.peripherals.screen
        const pixels = screen.visiblePixels
        let sum = 0
        let count = 0
        for (let offset = 0; offset < pixels.length; offset += 4) {
            if (pixels[offset] === 0 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0) {
                continue
            }
            sum += (offset / 4) % screen.width
            count++
        }
        return count === 0 ? 0 : sum / count
    }

    it('draws the graphics tour and terminates', async () => {
        const emulator = await runExample('graphics-tour.x68', INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        //the four thick lines alone cover 620 by 30 pixels four times over
        expect(inkCount(emulator)).toBeGreaterThan(50_000)
        expect(emulator.stdOut).toContain('pixel color $00BBGGRR = ')
        expect(emulator.stdOut).toContain('screen width:height = ')
    })

    it('animates the bouncing ball on presented frames only', async () => {
        const emulator = await runExample('bouncing-ball.x68', FRAME_LOOP_LIMIT)
        expectStoppedAtLimit(emulator)
        expect(emulator.peripherals.screen.doubleBuffering).toBe(true)
        //what is visible is a frame that was presented, so the ball is whole and nothing else is on
        //screen: a 48 pixel disc is about 1800 pixels, a half cleared frame would be far more
        const ink = inkCount(emulator)
        expect(ink).toBeGreaterThan(1_000)
        expect(ink).toBeLessThan(3_000)
    })

    it('moves the square while an arrow key is held', async () => {
        async function runHoldingRight(limit: number) {
            const code = load('keyboard-move.x68')
            const emulator = M68KEmulator(code, instantKeyboard())
            await emulator.compile(0, code)
            emulator.peripherals.keyboard.pressKey(KEY_CODES.RIGHT_ARROW)
            await emulator.run(limit)
            return emulator
        }
        const early = await runHoldingRight(60)
        const later = await runHoldingRight(FRAME_LOOP_LIMIT)
        expectStoppedAtLimit(later)
        expect(inkCentroidX(later)).toBeGreaterThan(inkCentroidX(early))
        //the title is in the transcript and on the Screen at the same time (ADR 0003)
        expect(later.stdOut).toContain('Arrow keys move the square')
        expect(inkCount(later)).toBeGreaterThan(1_000)
    })

    it('paints under the pointer while the left button is held', async () => {
        const code = load('mouse-paint.x68')
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.mouse.buttonDown('left', 200, 150)
        await emulator.run(FRAME_LOOP_LIMIT)
        expectStoppedAtLimit(emulator)
        //a disc of the brush radius around the pointer, in the aqua the program picks
        expect(pixelAt(emulator, 200, 150)).toBe(0x00ffff)
    })
})
