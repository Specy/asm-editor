import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { KEY_CODES } from '$lib/languages/peripherals/keyCodes'
import { BLACK } from '$lib/languages/peripherals/screen/color'
import { Z80_PORT_DOCS } from '$lib/languages/Z80/Z80-model'
import { Z80Emulator } from '$lib/languages/Z80/Z80Emulator.svelte'

/**
 * Every program this repository shows a Z80 user, run against the real Core under node: the
 * examples of the port documentation (which the documentation page, the hover and the coding agent
 * all print) and the three programs of `examples/z80/`. A port whose documented example does not
 * assemble, or prints something else, is a lie the user meets first, so it is worth a test.
 */

/** The examples poll and animate, so a run is bounded by instructions rather than by termination. */
const INSTRUCTION_LIMIT = 300_000

/**
 * A frame-synced program spends most of a run waiting, at about 16 ms a frame, so the animated
 * examples are cut off after a few dozen frames instead of at the limit above.
 */
const FRAME_LOOP_LIMIT = 1_500

async function runProgram(code: string, options: { input?: string[]; limit?: number } = {}) {
    const emulator = Z80Emulator(code)
    await emulator.compile(0, code)
    //scripted input is what a testcase uses; it also keeps a documented example reproducible here
    if (options.input) emulator.peripherals.terminal.useScriptedInput(options.input)
    await emulator.run(options.limit ?? INSTRUCTION_LIMIT)
    return emulator
}

describe('Z80 port documentation examples', () => {
    const documented = Z80_PORT_DOCS.filter((doc) => doc.example !== undefined)

    it('documents an example for most of the port map', () => {
        expect(documented.length).toBeGreaterThanOrEqual(15)
    })

    for (const doc of documented) {
        it(`runs the ${doc.title} example`, async () => {
            const emulator = await runProgram(doc.example as string, { input: doc.exampleInput })
            expect(emulator.errors).toEqual([])
            if (doc.exampleOutput !== undefined) expect(emulator.stdOut).toBe(doc.exampleOutput)
        })
    }
})

describe('examples/z80', () => {
    function load(name: string): string {
        return readFileSync(new URL(`../../../../examples/z80/${name}`, import.meta.url), 'utf8')
    }

    it('animates the bouncing ball off screen and presents whole frames', async () => {
        const emulator = await runProgram(load('bouncing-ball.z80'), { limit: FRAME_LOOP_LIMIT })
        expect(emulator.errors).toEqual([])
        const screen = emulator.peripherals.screen
        expect(screen.doubleBuffering).toBe(true)
        //the ball is yellow on blue, and what is visible is a frame that was presented, not a
        //half drawn one: the visible image is never the background it was cleared to
        expect(screen.getSize()).toEqual({ width: 256, height: 192 })
        expect(new Set(pixelsOf(screen.visiblePixels)).size).toBeGreaterThan(1)
    })

    it('moves the square with the arrow keys and keeps its title on screen', async () => {
        const code = load('keyboard-move.z80')
        const emulator = Z80Emulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.keyboard.pressKey(KEY_CODES.RIGHT_ARROW)
        await emulator.run(FRAME_LOOP_LIMIT)
        expect(emulator.errors).toEqual([])
        //the title went to the transcript and, because the Z80 has one output window, to the Screen
        expect(emulator.stdOut).toBe('ARROW KEYS MOVE\n')
        const screen = emulator.peripherals.screen
        expect(rowIsBlank(screen, 2)).toBe(false)
        //the square starts at x = 120 and the right arrow was held down the whole run
        expect(leftEdgeOf(screen, 96)).toBeGreaterThan(120)
    })

    it('paints under the pointer while the left button is held', async () => {
        const code = load('mouse-paint.z80')
        const emulator = Z80Emulator(code)
        await emulator.compile(0, code)
        const mouse = emulator.peripherals.mouse
        mouse.buttonDown('left', 100, 60)
        await emulator.run(FRAME_LOOP_LIMIT)
        expect(emulator.errors).toEqual([])
        const screen = emulator.peripherals.screen
        expect(visibleColorAt(screen, 102, 62)).toBe(0xffffff)
        expect(visibleColorAt(screen, 10, 10)).toBe(BLACK)
    })

    it('writes text and blocks into the TRS-80 display’s memory', async () => {
        const emulator = await runProgram(load('trs80-text.z80'))
        expect(emulator.errors).toEqual([])
        const screen = emulator.peripherals.screen
        expect(screen.cells).toEqual({ columns: 64, rows: 16 })
        //the title's first letter, the solid bar under it, and a cell neither of them reached
        expect(cellHasInk(screen, 2, 16)).toBe(true)
        expect(cellIsSolid(screen, 4, 16)).toBe(true)
        expect(cellHasInk(screen, 0, 0)).toBe(false)
    })

    it('paints the same TRS-80 display when the program runs as a testcase', async () => {
        //A test run has no slice loop to flush the display's dirty range, so its Screen used to be
        //blank even though the Core it leaves behind is read for the result.
        const code = load('trs80-text.z80')
        const emulator = Z80Emulator(code)
        await emulator.check()
        const results = await emulator.test(
            code,
            [
                {
                    input: [],
                    expectedOutput: '',
                    startingRegisters: {},
                    expectedRegisters: {},
                    startingMemory: [],
                    expectedMemory: []
                }
            ],
            INSTRUCTION_LIMIT,
            0
        )
        expect(results).toHaveLength(1)
        const screen = emulator.peripherals.screen
        expect(screen.cells).toEqual({ columns: 64, rows: 16 })
        expect(cellHasInk(screen, 2, 16)).toBe(true)
    })

    it('bounces a block through a back buffer copied into video memory', async () => {
        //a frame here is two block copies of a kilobyte each, so this is a handful of frames
        //rather than the few dozen the pixel examples get out of `FRAME_LOOP_LIMIT`
        const emulator = await runProgram(load('trs80-bounce.z80'), { limit: 20_000 })
        expect(emulator.errors).toEqual([])
        const screen = emulator.peripherals.screen
        //one solid cell, wherever the animation had got to: a frame is one `ldir`, so the display
        //never holds a half-copied buffer
        const solid = solidCells(screen)
        expect(solid).toHaveLength(1)
    })
})

/** Whether any pixel of a cell is lit. */
function cellHasInk(screen: VisibleScreen, row: number, column: number): boolean {
    return inkInCell(screen, row, column) > 0
}

/** Whether every pixel of a cell is lit, which is what character 191 draws. */
function cellIsSolid(screen: VisibleScreen, row: number, column: number): boolean {
    return inkInCell(screen, row, column) === 8 * 24
}

function inkInCell(screen: VisibleScreen, row: number, column: number): number {
    let ink = 0
    for (let y = 0; y < 24; y++) {
        for (let x = 0; x < 8; x++) {
            if (visibleColorAt(screen, column * 8 + x, row * 24 + y) !== BLACK) ink++
        }
    }
    return ink
}

function solidCells(screen: VisibleScreen): { row: number; column: number }[] {
    const solid: { row: number; column: number }[] = []
    for (let row = 0; row < 16; row++) {
        for (let column = 0; column < 64; column++) {
            if (cellIsSolid(screen, row, column)) solid.push({ row, column })
        }
    }
    return solid
}

/** The 24 bit colors of an RGBA image, for a test that only cares whether anything was drawn. */
function pixelsOf(image: Uint8ClampedArray): number[] {
    const colors: number[] = []
    for (let offset = 0; offset < image.length; offset += 4) {
        colors.push((image[offset] << 16) | (image[offset + 1] << 8) | image[offset + 2])
    }
    return colors
}

type VisibleScreen = { visiblePixels: Uint8ClampedArray; width: number }

/**
 * The color the renderer would paint at a point. A double buffered program is caught mid-frame as
 * often as not, so a test has to look at the image that was presented, never at the one being drawn.
 */
function visibleColorAt(screen: VisibleScreen, x: number, y: number): number {
    const offset = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]
}

function rowIsBlank(screen: VisibleScreen, y: number): boolean {
    return leftEdgeOf(screen, y) < 0
}

/** The first column of a row that is not the background, or -1 when the row is empty. */
function leftEdgeOf(screen: VisibleScreen, y: number): number {
    for (let x = 0; x < screen.width; x++) {
        if (visibleColorAt(screen, x, y) !== BLACK) return x
    }
    return -1
}
