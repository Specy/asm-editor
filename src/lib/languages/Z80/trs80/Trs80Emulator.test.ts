import { describe, expect, it } from 'vitest'
import { KEY_CODES } from '$lib/languages/peripherals/keyCodes'
import type { Screen } from '$lib/languages/peripherals/screen/Screen'
import { Z80Emulator } from '$lib/languages/Z80/Z80Emulator.svelte'

/**
 * The memory-mapped TRS-80 display end to end, against the real Core under node
 * ([ADR 0020](../../../../../docs/adr/0020-mirror-the-trs80-display-in-guest-memory.md)): a program
 * stores bytes and the pixels appear, Undo rewinds the image with the memory, the keyboard matrix
 * reaches the program, and the drawing commands say plainly that they are not available.
 *
 * `@specy/z80` is plain TypeScript, so this is the one adapter that can be driven all the way from
 * a source string to the pixels it left, which is why the compatibility claim is checked here.
 */

const WHITE = 0xffffff
const BLACK = 0x000000

/** The full block, all six sub-cells lit: the easiest thing to recognize in a picture. */
const FULL_BLOCK = 191

function colorAt(screen: Screen, x: number, y: number): number {
    const offset = (y * screen.width + x) * 4
    const pixels = screen.visiblePixels
    return (pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2]
}

/** The top-left pixel of a cell, by cell index, which is how these programs address the screen. */
function cellColor(screen: Screen, cell: number): number {
    return colorAt(screen, (cell % 64) * 8, Math.floor(cell / 64) * 24)
}

async function build(code: string, undoSize = 100) {
    const emulator = Z80Emulator(code)
    await emulator.compile(undoSize, code)
    return emulator
}

const STORE_TWO_CELLS = [
    '; @screen trs80',
    '        org $8000',
    `        ld a, ${FULL_BLOCK}`,
    '        ld (0x3C00), a',
    '        ld (0x3C41), a      ; second cell of the second row',
    '        halt'
].join('\n')

/**
 * The blitting idiom the port map cannot offer: a back buffer in RAM copied into video memory with
 * one `ldir`, which is what a real program does instead of double buffering.
 */
const BLOCK_COPY = [
    '; @screen trs80',
    '        org $8000',
    'start:  ld hl, buffer',
    '        ld de, 0x3C00',
    '        ld bc, 1024',
    '        ldir',
    '        halt',
    'buffer:',
    `        .ds 1024, ${FULL_BLOCK}`
].join('\n')

const KEYBOARD_SCAN = [
    '; @screen trs80',
    '        org $8000',
    'wait:   ld a, (0x3840)      ; row 6: Enter, Clear, Break, the arrows, space',
    '        bit 6, a            ; the right arrow',
    '        jr z, wait',
    `        ld a, ${FULL_BLOCK}`,
    '        ld (0x3C00), a',
    '        halt'
].join('\n')

describe('the TRS-80 display', () => {
    it('is the mode the directive asks for, before the first instruction', async () => {
        const emulator = await build(STORE_TWO_CELLS)
        const screen = emulator.peripherals.screen
        expect(screen.getSize()).toEqual({ width: 512, height: 384 })
        expect(screen.cells).toEqual({ columns: 64, rows: 16 })
    })

    it('shows what a program stores at 0x3C00', async () => {
        const emulator = await build(STORE_TWO_CELLS)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        const screen = emulator.peripherals.screen
        expect(cellColor(screen, 0)).toBe(WHITE)
        expect(cellColor(screen, 65)).toBe(WHITE)
        expect(cellColor(screen, 1)).toBe(BLACK)
    })

    it('blits a whole screen with one ldir', async () => {
        const emulator = await build(BLOCK_COPY)
        await emulator.run(100_000)
        expect(emulator.errors).toEqual([])
        const screen = emulator.peripherals.screen
        //every pixel of the display, from a single block copy
        expect(colorAt(screen, 0, 0)).toBe(WHITE)
        expect(colorAt(screen, 511, 383)).toBe(WHITE)
    })

    it('rewinds with the memory, without journaling a single record', async () => {
        const emulator = await build(STORE_TWO_CELLS)
        await emulator.run(1000)
        const screen = emulator.peripherals.screen
        expect(cellColor(screen, 0)).toBe(WHITE)
        //the memory-backed image costs the Screen history nothing, which is what lets the Z80's
        //Undo depth be the Core's history alone in this mode (ADR 0005)
        expect(screen.history.sequence).toBe(0)
        expect(screen.canUndo()).toBe(false)

        emulator.undo(100)
        expect(cellColor(screen, 0)).toBe(BLACK)
        expect(cellColor(screen, 65)).toBe(BLACK)
    })

    it('undoes one store at a time', async () => {
        const emulator = await build(STORE_TWO_CELLS)
        await emulator.run(1000)
        const screen = emulator.peripherals.screen
        //the `halt` the program ended on, then the second store: the display follows the Core one
        //instruction at a time rather than all at once
        emulator.undo(1)
        expect(cellColor(screen, 65)).toBe(WHITE)
        emulator.undo(1)
        expect(cellColor(screen, 65)).toBe(BLACK)
        expect(cellColor(screen, 0)).toBe(WHITE)
    })

    it('gives the program the keyboard matrix at 0x3800', async () => {
        const emulator = await build(KEYBOARD_SCAN)
        const screen = emulator.peripherals.screen
        //nothing held: the program is still scanning, and the limit ends the run
        await emulator.run(5000)
        expect(cellColor(screen, 0)).toBe(BLACK)

        const pressed = await build(KEYBOARD_SCAN)
        pressed.peripherals.keyboard.pressKey(KEY_CODES.RIGHT_ARROW)
        await pressed.run(5000)
        expect(pressed.errors).toEqual([])
        expect(cellColor(pressed.peripherals.screen, 0)).toBe(WHITE)
    })

    it('blanks the display on a rebuild', async () => {
        const emulator = await build(STORE_TWO_CELLS)
        await emulator.run(1000)
        expect(cellColor(emulator.peripherals.screen, 0)).toBe(WHITE)
        await emulator.compile(100, STORE_TWO_CELLS)
        expect(cellColor(emulator.peripherals.screen, 0)).toBe(BLACK)
    })
})

describe('the two Screen modes', () => {
    it('switches at runtime with the mode commands', async () => {
        const code = [
            '        org $8000',
            '        ld a, 14',
            '        out (0x27), a       ; the memory-mapped display',
            `        ld a, ${FULL_BLOCK}`,
            '        ld (0x3C00), a',
            '        halt'
        ].join('\n')
        const emulator = await build(code)
        //a program with no directive starts on the drawing commands, as every Z80 program did
        expect(emulator.peripherals.screen.cells).toBe(null)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(emulator.peripherals.screen.cells).toEqual({ columns: 64, rows: 16 })
        expect(cellColor(emulator.peripherals.screen, 0)).toBe(WHITE)
    })

    it('says which drawing command is not available instead of drawing something that vanishes', async () => {
        const code = [
            '; @screen trs80',
            '        org $8000',
            '        ld a, 0',
            '        out (0x27), a       ; PIXEL, which this mode has no room for',
            '        halt'
        ].join('\n')
        const emulator = await build(code)
        await emulator.run(1000)
        expect(emulator.errors.join('\n')).toContain('Screen command 0 (PIXEL)')
        expect(emulator.errors.join('\n')).toContain('0x3C00')
    })

    it('keeps console output in the transcript, where a testcase can still assert on it', async () => {
        const code = [
            '; @screen trs80',
            '        org $8000',
            "        ld a, 'H'",
            '        out (0x10), a',
            `        ld a, ${FULL_BLOCK}`,
            '        ld (0x3C00), a',
            '        halt'
        ].join('\n')
        const emulator = await build(code)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('H')
        const screen = emulator.peripherals.screen
        //the text is not drawn on the display: printing on this machine is storing a byte, and only
        //the program's own store is on screen
        expect(cellColor(screen, 0)).toBe(WHITE)
        expect(cellColor(screen, 1)).toBe(BLACK)
    })

    it('leaves 0x3C00 as ordinary RAM for a program that never asks for the display', async () => {
        const code = [
            '        org $8000',
            `        ld a, ${FULL_BLOCK}`,
            '        ld (0x3C00), a',
            '        ld a, (0x3C00)',
            '        halt'
        ].join('\n')
        const emulator = await build(code)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(emulator.peripherals.screen.getSize()).toEqual({ width: 256, height: 192 })
        expect(emulator.registers.find((register) => register.name === 'a')?.value).toBe(
            BigInt(FULL_BLOCK)
        )
    })
})

describe('a screen assembled into video memory', () => {
    /**
     * A title screen stored in the program's own bytes rather than drawn: the display is blanked
     * when the mode is turned on, which happens before the program is loaded, so what a program
     * assembles at 0x3C00 survives and is on screen before the first instruction runs.
     */
    const ASSEMBLED_SCREEN = [
        '; @screen trs80',
        '        .org 0x3C00',
        `        .ds 64, ${FULL_BLOCK}   ; the whole top row`,
        '',
        '        .org 0x8000',
        'start:  halt',
        '        end start'
    ].join('\n')

    it('is on the display as soon as it is built', async () => {
        const emulator = await build(ASSEMBLED_SCREEN)
        const screen = emulator.peripherals.screen
        expect(cellColor(screen, 0)).toBe(WHITE)
        expect(cellColor(screen, 63)).toBe(WHITE)
        expect(cellColor(screen, 64)).toBe(BLACK)
    })

    it('runs from its entry point rather than from the image', async () => {
        const emulator = await build(ASSEMBLED_SCREEN)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(cellColor(emulator.peripherals.screen, 0)).toBe(WHITE)
    })
})

/**
 * The one address where this editor's port map and the machine's own IO map land on the same
 * number. Everything else the TRS-80 decodes is at 0x75, 0x79, 0xB5, 0xB9 or 0xE0 and above, and
 * every editor port sits below 0x43; port 0 is the machine's joystick and this editor's character
 * port, and two of the three games in the fork's own IDE poll it.
 */
describe('the joystick port', () => {
    const POLL = [
        '; @screen trs80',
        '        org $8000',
        'loop:   in a, (0x00)        ; the joystick, as a TRS-80 program reads it',
        '        cp 0xFF',
        '        jr nz, loop         ; a real machine with none attached answers 0xFF',
        `        ld a, ${FULL_BLOCK}`,
        '        ld (0x3C00), a',
        '        halt'
    ].join('\n')

    it('answers "none attached" instead of suspending the program for a line of input', async () => {
        const emulator = await build(POLL)
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        //the program got past its poll and ran to the end, rather than waiting on a prompt
        expect(cellColor(emulator.peripherals.screen, 0)).toBe(WHITE)
    })

    it('is still the character port for a program that never asks for the display', async () => {
        const code = [
            '        org $8000',
            '        in a, (0x10)',
            '        out (0x10), a',
            '        halt'
        ].join('\n')
        const emulator = await build(code)
        emulator.peripherals.terminal.useScriptedInput(['Z'])
        await emulator.run(1000)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('Z')
    })
})
