import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it } from 'vite-plus/test'
import { Audio } from '#lib/languages/peripherals/audio/Audio.ts'
import { synthEntries } from '#lib/documentation/synth.ts'
import { ProgramClock } from '#lib/languages/peripherals/ProgramClock.ts'
import { RecordingAudioOutput } from '#lib/languages/peripherals/audio/AudioOutput.ts'
import { makeMidi, makeWav } from '#lib/languages/peripherals/audio/soundFixtures.ts'
import type { InputSettings } from '@specy/s68k'
import { M68KEmulator } from '#lib/languages/M68K/M68KEmulator.svelte.ts'
import { CPU_REGISTER_FILE_ID } from '#lib/languages/GenericEmulator.svelte.ts'
import { RegisterSize } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import type { Testcase } from '#lib/Project.svelte.ts'
import { fileText, type BuildSources, type ProjectFiles } from '#lib/projectFiles.ts'
import type { BuildOutputHost } from '#lib/buildOutput.ts'
import { M68K_TRAP_DOCS, screenColorOf } from '#lib/languages/M68K/M68K-traps.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { Keyboard } from '#lib/languages/peripherals/Keyboard.ts'
import { KEY_CODES, letterKeyCode } from '#lib/languages/peripherals/keyCodes.ts'
import { BLACK } from '#lib/languages/peripherals/screen/color.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'

/**
 * The `trap #15` interface against the real Core under node: every task the editor supports, routed
 * to the Screen, the Keyboard, the Mouse and the clock
 * ([ADR 0003](../../../../../../docs/adr/0003-preserve-simulator-graphics-conventions.md)), plus the four
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

describe('M68K diagnostics', () => {
    it('preserves the Core hint in the text shown by diagnostic renderers', async () => {
        const emulator = M68KEmulator('    mova d0,d1')
        const [diagnostic] = await emulator.check()

        expect(diagnostic.hint).toContain('Did you mean `move`?')
        expect(diagnostic.formatted).toBe(`${diagnostic.message}\n${diagnostic.hint}`)
        emulator.dispose()
    })

    it('offers the Core’s fixes on a 68020 instruction in a 68000 program', async () => {
        const emulator = M68KEmulator('    org $1000\n    extb.l d0\n')
        try {
            const [refused] = await emulator.check()
            expect(refused.code).toBe('needs_a_later_processor')
            expect(refused.fixes?.map((fix) => fix.title)).toEqual([
                'Add `opt p=68020` at the top of the program',
                'Write `ext.w d0` and `ext.l d0`'
            ])
        } finally {
            emulator.dispose()
        }
    })
})

describe('M68K processor dialects', () => {
    it('names the processor of a Build written for a later one, and none for the 68000', async () => {
        const emulator = M68KEmulator(
            '    opt p=68020\n    org $1000\n    extb.l d0\n    simhalt\n'
        )
        try {
            await emulator.compile(10, emulator.code)
            expect(emulator.processor).toBe('68020')
            //a Stop forgets the Build, and what it was written for
            emulator.clear()
            expect(emulator.processor).toBe(undefined)
            await emulator.compile(10, '    opt p=68010\n    move.w ccr,d0\n')
            expect(emulator.processor).toBe('68010')
            await emulator.compile(10, '    move.w sr,d0\n')
            expect(emulator.processor).toBe(undefined)
        } finally {
            emulator.dispose()
        }
    })
})

describe('M68K Project Files', () => {
    it('assembles included source with its own file identity', async () => {
        const sources = {
            entry: 'src/main.m68k',
            files: {
                'src/main.m68k': {
                    encoding: 'plain' as const,
                    content: '    org $1000\n    include "lib/helper.m68k"\n'
                },
                'src/lib/helper.m68k': {
                    encoding: 'plain' as const,
                    content: '    moveq #7,d0\n'
                }
            }
        }
        const emulator = M68KEmulator(sources)
        await emulator.compile(0, sources)
        expect(emulator.currentFile).toBe('src/lib/helper.m68k')
        expect(emulator.buildArtifacts).toEqual([
            {
                file: 'src/lib/helper.m68k',
                line: 0,
                address: 0x1000n,
                opcode: '70 07'
            }
        ])
        await emulator.step()
        expect(registerOf(emulator, 'D0')).toBe(7n)
        emulator.dispose()
    })

    it('incbin embeds exact UTF-8 bytes independently of their storage encoding', async () => {
        for (const note of [
            { encoding: 'plain' as const, content: 'è' },
            { encoding: 'base64' as const, content: 'w6g=' }
        ]) {
            const sources = {
                entry: 'main.m68k',
                files: {
                    'main.m68k': {
                        encoding: 'plain' as const,
                        content: '    org $1000\n    incbin "note.txt"\n'
                    },
                    'note.txt': note
                }
            }
            const emulator = M68KEmulator(sources)
            await emulator.compile(0, sources)
            expect(emulator.readMemoryBytes(0x1000n, 2)).toEqual(new Uint8Array([0xc3, 0xa8]))
            emulator.dispose()
        }
    })

    it('incbin reads a File whose name has a character outside the BMP', async () => {
        //the Core counts the line in Unicode scalars, where the emoji is two UTF-16 code units
        const sources = {
            entry: 'main.m68k',
            files: {
                'main.m68k': {
                    encoding: 'plain' as const,
                    content: '    org $1000\n    incbin "🎵.bin"\n'
                },
                '🎵.bin': { encoding: 'base64' as const, content: 'AQI=' }
            }
        }
        const emulator = M68KEmulator(sources)
        await emulator.compile(0, sources)
        expect(emulator.errors).toEqual([])
        expect(emulator.readMemoryBytes(0x1000n, 2)).toEqual(new Uint8Array([1, 2]))
        emulator.dispose()
    })
})

function inkCount(emulator: Awaited<ReturnType<typeof run>>): number {
    const pixels = emulator.peripherals.screen.visiblePixels
    let ink = 0
    for (let offset = 0; offset < pixels.length; offset += 4) {
        if (pixels[offset] !== 0 || pixels[offset + 1] !== 0 || pixels[offset + 2] !== 0) ink++
    }
    return ink
}

describe('M68K text tasks', () => {
    it('prints Windows-1252 source characters while unsupported Screen glyphs stay blank', async () => {
        const emulator = await run(trap(14, ['    lea text,a1']) + trap(9) + "text: dc.b '€é',0\n")
        try {
            expect(emulator.errors).toEqual([])
            expect(emulator.stdOut).toBe('€é')
            expect(inkCount(emulator)).toBe(0)
            expect(emulator.peripherals.screen.cursorColumn).toBe(2)
        } finally {
            emulator.dispose()
        }
    })
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

    it('displays task 15 in upper case, formatted by the Core as EASy68K does', async () => {
        const emulator = await run(
            trap(15, ['    move.l #255,d1', '    move.b #16,d2']) +
                trap(15, ['    move.l #-1,d1', '    move.b #36,d2']) +
                trap(9)
        )
        expect(emulator.errors).toEqual([])
        //unsigned: -1 is $FFFFFFFF, 1Z141Z3 in base 36
        expect(emulator.stdOut).toBe('FF1Z141Z3')
    })

    it('ends the program on a base task 15 cannot take, naming the register', async () => {
        const emulator = await run(trap(15, ['    move.l #255,d1', '    move.b #37,d2']) + trap(9))
        expect(emulator.terminated).toBe(true)
        expect(emulator.termination?.kind).toBe('error')
        expect(emulator.errors.join('\n')).toContain(
            'Trap task 15 (display unsigned number in a base) was given a value it cannot take: D2.B is 37'
        )
    })

    it('pads a negative field width of task 20 on the right', async () => {
        const emulator = await run(trap(20, ['    move.l #-5,d1', '    move.b #-6,d2']) + trap(9))
        expect(emulator.stdOut).toBe('-5    ')
    })

    it('reads a number with atoi, never failing on what was typed', async () => {
        const code =
            ORG +
            trap(4) +
            '    move.l d1,d3\n' +
            trap(4) +
            '    move.l d1,d4\n' +
            trap(4) +
            '    move.l d1,d5\n' +
            trap(4) +
            '    move.l d1,d6\n' +
            trap(4) +
            trap(9)
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.terminal.useScriptedInput(['12abc', '  -7', '', 'abc', '4294967295'])
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D3')).toBe(12n)
        expect(registerOf(emulator, 'D4')).toBe(0xfffffff9n)
        expect(registerOf(emulator, 'D5')).toBe(0n)
        expect(registerOf(emulator, 'D6')).toBe(0n)
        //too long for 32 bits as a signed number, so it wraps into D1.L exactly
        expect(registerOf(emulator, 'D1')).toBe(0xffffffffn)
    })

    it('stores at most 79 characters of a line, in Windows-1252, with the count in D1.L', async () => {
        const code =
            ORG +
            '    move.l #$FFFFFFFF,d1\n' +
            trap(2, ['    lea long,a1']) +
            '    move.l d1,d5\n' +
            trap(2, ['    lea euro,a1']) +
            trap(13, ['    lea euro,a1']) +
            trap(9) +
            '    org $2000\n' +
            'long: dcb.b 100,0\n' +
            'euro: dcb.b 8,0\n'
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.terminal.useScriptedInput(['x'.repeat(100), '€'])
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        //the whole of D1.L, not only its low word
        expect(registerOf(emulator, 'D5')).toBe(79n)
        expect([...emulator.readMemoryBytes(0x2000n + 78n, 2)]).toEqual([0x78, 0])
        //the euro is one byte, $80, and comes back out as itself
        expect([...emulator.readMemoryBytes(0x2064n, 2)]).toEqual([0x80, 0])
        expect(emulator.stdOut).toBe('€\n')
        expect(registerOf(emulator, 'D1')).toBe(1n)
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

    /**
     * Coordinates are signed words, as they are in EASy68K, which casts each one to a `short`
     * before it draws (`simIO->rectangle((short)D[1], ...)` in `CODE9.CPP`). Read as unsigned, a
     * shape starting off the left or the top does not vanish: its edges come back reversed, both
     * simulators swap reversed edges, and it lands on the far side of the screen instead. Each
     * case here straddles an edge, which is where the two readings differ.
     */
    describe('coordinates off the top left', () => {
        const WHITE = '    move.l #$00FFFFFF,d1'

        it('clips a rectangle that starts off the screen', async () => {
            const emulator = await run(
                trap(80, [WHITE]) +
                    trap(81, [WHITE]) +
                    trap(87, [
                        '    move.w #-20,d1',
                        '    move.w #-20,d2',
                        '    move.w #40,d3',
                        '    move.w #40,d4'
                    ]) +
                    trap(9)
            )
            expect(emulator.errors).toEqual([])
            expect(pixelAt(emulator, 0, 0)).toBe(0xffffff)
            expect(pixelAt(emulator, 39, 39)).toBe(0xffffff)
            expect(pixelAt(emulator, 41, 41)).toBe(BLACK)
            //read unsigned this would be a rectangle from 40,40 to the far corner instead
            expect(pixelAt(emulator, 500, 400)).toBe(BLACK)
            expect(inkCount(emulator)).toBe(40 * 40)
        })

        it('clips an ellipse that straddles the left edge', async () => {
            const emulator = await run(
                trap(80, [WHITE]) +
                    trap(81, [WHITE]) +
                    trap(88, [
                        '    move.w #-30,d1',
                        '    move.w #100,d2',
                        '    move.w #30,d3',
                        '    move.w #160,d4'
                    ]) +
                    trap(9)
            )
            expect(emulator.errors).toEqual([])
            expect(pixelAt(emulator, 4, 130)).toBe(0xffffff)
            expect(pixelAt(emulator, 400, 130)).toBe(BLACK)
            //half of a 60 by 60 ellipse, not a band reaching the right hand edge
            expect(inkCount(emulator)).toBeLessThan(1_600)
        })

        it('answers the pen position off the screen as a signed word', async () => {
            const emulator = await run(
                trap(86, ['    move.w #-20,d1', '    move.w #100,d2']) + trap(96) + trap(9)
            )
            expect(emulator.errors).toEqual([])
            //task 96 leaves X in D1.W and Y in D2.W, the low word of a signed short
            expect(registerOf(emulator, 'D1') & 0xffffn).toBe(0xffecn)
            expect(registerOf(emulator, 'D2') & 0xffffn).toBe(100n)
        })

        it('draws the part of a string that is on the screen', async () => {
            const emulator = await run(
                trap(80, [WHITE]) +
                    trap(95, ['    lea text,a1', '    move.w #-8,d1', '    move.w #100,d2']) +
                    trap(9) +
                    "text: dc.b 'AB',0\n"
            )
            expect(emulator.errors).toEqual([])
            //the A is off the left, the B is in the first cell; read unsigned nothing would show
            expect(inkCount(emulator)).toBeGreaterThan(5)
            const screen = emulator.peripherals.screen
            const pixels = screen.visiblePixels
            for (let offset = 0; offset < pixels.length; offset += 4) {
                if (pixels[offset] === 0 && pixels[offset + 1] === 0 && pixels[offset + 2] === 0) {
                    continue
                }
                expect((offset / 4) % screen.width).toBeLessThan(screen.cell.width)
            }
        })
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

    it('gives Enter to task 5 as EASy68K does, $0D', async () => {
        const code =
            ORG + trap(80, ['    move.l #$00FFFFFF,d1']) + trap(5) + '    move.l d1,d5\n' + trap(9)
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.keyboard.typeText('\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D5') & 0xffn).toBe(0x0dn)
        //echoed as the new line it is on the Screen and in the transcript
        expect(emulator.stdOut).toBe('\n')
    })

    it('journals one Screen record for the whole of a read trap', async () => {
        //a `trap #15` is one Core step and Undo pops one Screen record per step, so the echo of a
        //typed line — a glyph per character, three for a backspace — cannot journal one each
        //([ADR 0005](../../../../../../docs/adr/0005-restore-screen-state-on-undo.md))
        const code = ORG + trap(80, ['    move.l #$00FFFFFF,d1']) + trap(2, ['    lea buffer,a1'])
        const emulator = M68KEmulator(code + trap(9) + 'buffer: ds.b 32\n')
        await emulator.compile(0, code + trap(9) + 'buffer: ds.b 32\n')
        const running = emulator.run(INSTRUCTION_LIMIT)
        await new Promise((resolve) => setTimeout(resolve, 50))
        emulator.peripherals.keyboard.typeText('ax\bb\n')
        await running
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('ab\n')
        //the pen color task and the read task, one record each
        expect(emulator.peripherals.screen.history.sequence).toBe(2)
    })

    it('keeps reading the Terminal for a program that never touches the Screen', async () => {
        const code = ORG + trap(2, ['    lea buffer,a1']) + trap(9) + 'buffer: ds.b 32\n'
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        expect(emulator.peripherals.terminal.interactiveSource).toBe('terminal')
        emulator.peripherals.terminal.useScriptedInput(['typed'])
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        //scripted input is not echoed, like piped stdin, and nothing was drawn
        expect(emulator.stdOut).toBe('')
        expect(inkCount(emulator)).toBe(0)
    })
})

/**
 * The text tasks read through the Terminal's Line discipline
 * ([ADR 0036](../../../../../../docs/adr/0036-programs-read-input-typed-in-the-terminal.md)): what is typed
 * in the Terminal, edited until Enter and echoed, and a single keystroke for task 5. The console on
 * the page is what the input is typed into; the tests attach one and type through the Terminal.
 */
describe('M68K input typed in the Terminal', () => {
    async function built(body: string) {
        const code = ORG + body
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.terminal.attachConsole()
        return emulator
    }

    it('reads a line with task 2, edited and echoed', async () => {
        const emulator = await built(
            trap(2, ['    lea buffer,a1']) +
                trap(13, ['    lea buffer,a1']) +
                trap(9) +
                'buffer: ds.b 32\n'
        )
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(INSTRUCTION_LIMIT)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(terminal.pendingRead?.kind).toBe('line')
        terminal.insertText('hellp')
        terminal.pressBackspace()
        terminal.insertText('o')
        terminal.pressEnter()
        await running
        expect(emulator.errors).toEqual([])
        //the echo of the line, then task 13 printing what the program read
        expect(emulator.stdOut).toBe('hello\nhello\n')
        expect(registerOf(emulator, 'D1') & 0xffffn).toBe(5n)
    })

    it('reads a number with task 4 and with task 18 after its prompt', async () => {
        const emulator = await built(
            trap(4) +
                '    move.l d1,d5\n' +
                trap(18, ['    lea text,a1']) +
                trap(9) +
                "text: dc.b 'n? ',0\n"
        )
        const terminal = emulator.peripherals.terminal
        terminal.insertText('21\n-4\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D5')).toBe(21n)
        expect(registerOf(emulator, 'D1')).toBe(0xfffffffcn)
        expect(emulator.stdOut).toBe('21\nn? -4\n')
    })

    it('reads one keystroke with task 5, without waiting for Enter', async () => {
        const emulator = await built(trap(5) + '    move.l d1,d5\n' + trap(5) + trap(9))
        const terminal = emulator.peripherals.terminal
        terminal.insertText('k')
        terminal.pressEnter()
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D5') & 0xffn).toBe(BigInt('k'.charCodeAt(0)))
        expect(registerOf(emulator, 'D1') & 0xffn).toBe(0x0dn)
        expect(emulator.stdOut).toBe('k\n')
    })

    it('ignores End of input, which only standard input takes', async () => {
        const emulator = await built(trap(5) + trap(9))
        const terminal = emulator.peripherals.terminal
        terminal.sendEndOfInput()
        terminal.insertText('z')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D1') & 0xffn).toBe(BigInt('z'.charCodeAt(0)))
    })

    it('echoes Terminal typing onto the Screen and undoes that input instruction', async () => {
        const code = ORG + trap(2, ['    lea buffer,a1']) + trap(9) + 'buffer: ds.b 80\n'
        const emulator = M68KEmulator(code)
        try {
            await emulator.compile(100, code)
            const terminal = emulator.peripherals.terminal
            const screen = emulator.peripherals.screen
            terminal.insertText('ac')
            terminal.pressBackspace()
            terminal.insertText('b')
            terminal.pressEnter()
            await emulator.run(INSTRUCTION_LIMIT)
            expect(emulator.errors).toEqual([])
            expect(terminal.interactiveSource).toBe('terminal')
            expect(emulator.stdOut).toBe('ab\n')
            expect(inkCount(emulator)).toBeGreaterThan(0)
            expect(screen.cursorRow).toBe(1)
            //Task 9 and its move ran after the input; neither pops its echo.
            expect(emulator.undo(2)).toBe(2)
            expect(inkCount(emulator)).toBeGreaterThan(0)
            expect(emulator.stdOut).toBe('ab\n')
            expect(emulator.undo(1)).toBe(1)
            expect(inkCount(emulator)).toBe(0)
            expect(screen.cursorRow).toBe(0)
            //the transcript loses the echo too, and the read asks again (ADR 0057)
            expect(emulator.stdOut).toBe('')
            expect(terminal.hasPendingInput()).toBe(false)
        } finally {
            emulator.dispose()
        }
    })
})

/**
 * Tasks 12 and 16 set how the read tasks show what is typed. The Core keeps the settings and
 * journals them for Undo; the adapter hands them to the Terminal's Line discipline at each read.
 */
describe('M68K input settings', () => {
    const ECHO_OFF = trap(12, ['    move.b #0,d1'])

    async function built(body: string, history = 0) {
        const code = ORG + body
        const emulator = M68KEmulator(code)
        await emulator.compile(history, code)
        emulator.peripherals.terminal.attachConsole()
        return emulator
    }

    /** The Core's own record of the settings, which nothing else in the editor keeps. */
    function settingsOf(emulator: Awaited<ReturnType<typeof built>>): InputSettings {
        const adapter = emulator as unknown as {
            interpreter: { getInputSettings(): InputSettings }
        }
        return adapter.interpreter.getInputSettings()
    }

    it('echoes nothing of a line read with the echo off, but still ends it on a new line', async () => {
        const emulator = await built(
            ECHO_OFF +
                trap(2, ['    lea buffer,a1']) +
                trap(13, ['    lea buffer,a1']) +
                trap(9) +
                'buffer: dcb.b 80,0\n'
        )
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(INSTRUCTION_LIMIT)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(terminal.pendingRead).toMatchObject({ kind: 'line', echo: false, prompt: true })
        terminal.insertText('secrex')
        terminal.pressBackspace()
        terminal.insertText('t')
        terminal.pressEnter()
        await running
        expect(emulator.errors).toEqual([])
        //the Enter's new line, then task 13 printing what the program read
        expect(emulator.stdOut).toBe('\nsecret\n')
        expect(registerOf(emulator, 'D1')).toBe(6n)
        expect(emulator.peripherals.screen.cursorRow).toBe(2)
    })

    it('echoes nothing of a key read with the echo off, Enter included', async () => {
        const emulator = await built(ECHO_OFF + trap(5) + '    move.l d1,d5\n' + trap(5) + trap(9))
        const terminal = emulator.peripherals.terminal
        terminal.insertText('k')
        terminal.pressEnter()
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('')
        expect(registerOf(emulator, 'D5') & 0xffn).toBe(BigInt('k'.charCodeAt(0)))
        expect(registerOf(emulator, 'D1') & 0xffn).toBe(0x0dn)
    })

    //EASy68K 5.16.1 simIOu.cpp FormKeyPress always calls doCRLF for line/numeric
    //input; inputLFdisplay is consulted only in its charInput branch, despite the help text.
    it.each([
        { echo: true, lineFeed: true },
        { echo: true, lineFeed: false },
        { echo: false, lineFeed: true },
        { echo: false, lineFeed: false }
    ])('ends a line with CR/LF for echo=$echo, lineFeed=$lineFeed', async ({ echo, lineFeed }) => {
        const emulator = await built(
            trap(12, ['    move.b #' + (echo ? 1 : 0) + ',d1']) +
                trap(16, ['    move.b #' + (lineFeed ? 3 : 2) + ',d1']) +
                trap(4) +
                trap(9)
        )
        try {
            emulator.peripherals.terminal.insertText('12abc\n')
            await emulator.run(INSTRUCTION_LIMIT)
            expect(emulator.errors).toEqual([])
            expect(registerOf(emulator, 'D1')).toBe(12n)
            expect(emulator.stdOut).toBe(echo ? '12abc\n' : '\n')
            expect(emulator.peripherals.screen.cursorRow).toBe(1)
            expect(emulator.peripherals.screen.cursorColumn).toBe(0)
        } finally {
            emulator.dispose()
        }
    })

    it('draws nothing on the Screen of a line typed there with the echo off', async () => {
        const emulator = await built(
            trap(80, ['    move.l #$00FFFFFF,d1']) +
                ECHO_OFF +
                trap(2, ['    lea buffer,a1']) +
                trap(9) +
                'buffer: dcb.b 80,0\n'
        )
        emulator.peripherals.keyboard.typeText('hidden\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(inkCount(emulator)).toBe(0)
        expect(emulator.stdOut).toBe('\n')
        //the new line moved the text cursor, which nothing was drawn before
        expect(emulator.peripherals.screen.cursorRow).toBe(1)
    })

    it('echoes Enter as a carriage return alone with the line feed off (task 16, D1.B = 2)', async () => {
        const emulator = await built(
            trap(16, ['    move.b #2,d1']) +
                trap(80, ['    move.l #$00FFFFFF,d1']) +
                trap(14, ['    lea text,a1']) +
                trap(5) +
                trap(9) +
                "text: dc.b 'Key? ',0\n"
        )
        emulator.peripherals.keyboard.typeText('\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D1') & 0xffn).toBe(0x0dn)
        expect(emulator.stdOut).toBe('Key? \r')
        //back at the start of the line it was on, as EASy68K leaves its cursor
        expect(emulator.peripherals.screen.cursorColumn).toBe(0)
        expect(emulator.peripherals.screen.cursorRow).toBe(0)
    })

    it('hides the prompt of a read with the input prompt off (task 16, D1.B = 0)', async () => {
        const emulator = await built(trap(16, ['    move.b #0,d1']) + trap(5) + trap(9))
        const terminal = emulator.peripherals.terminal
        const running = emulator.run(INSTRUCTION_LIMIT)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(terminal.pendingRead).toMatchObject({ kind: 'character', prompt: false, echo: true })
        terminal.insertText('x')
        await running
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('x')
    })

    it('puts the settings back on Undo, and names the change in the History', async () => {
        const emulator = await built(ECHO_OFF + trap(16, ['    move.b #2,d1']) + trap(9), 200)
        //the two moves and the trap of task 12
        for (let i = 0; i < 3; i++) await emulator.step()
        expect(settingsOf(emulator)).toEqual({ echo: false, prompt: true, line_feed: true })
        expect(emulator.latestSteps[0].mutations).toContainEqual({
            type: 'Other',
            value: 'Turned the echo off'
        })
        for (let i = 0; i < 3; i++) await emulator.step()
        expect(settingsOf(emulator)).toEqual({ echo: false, prompt: true, line_feed: false })
        emulator.undo(1)
        expect(settingsOf(emulator)).toEqual({ echo: false, prompt: true, line_feed: true })
        emulator.undo(3)
        expect(settingsOf(emulator)).toEqual({ echo: true, prompt: true, line_feed: true })
    })

    it('ends the program on a setting task 16 does not have', async () => {
        const emulator = await built(trap(16, ['    move.b #4,d1']) + trap(9))
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.termination?.kind).toBe('error')
        expect(emulator.errors.join('\n')).toContain(
            'Trap task 16 (input prompt and line feed) was given a value it cannot take: D1.B is 4'
        )
    })
})

/**
 * Tasks 50 to 59 on the Build's FileSystem session: EASy68K's eight file numbers from 0, every
 * change journaled under the trap's step id so Undo puts the Files back with the registers
 * ([ADR 0015](../../../../../../docs/adr/0015-restore-file-operations-on-undo.md)). The Core writes
 * EASy68K's results; what is asserted is what the program sees and what the Files hold.
 */
describe('M68K file tasks', () => {
    beforeEach(() => Prompt.cancel())

    async function withFiles(body: string, files: ProjectFiles = {}, history = 200) {
        const code = ORG + body
        const fileSystem = new FileSystem(files)
        const emulator = M68KEmulator(code, { peripherals: { fileSystem } })
        await emulator.compile(history, code)
        return { emulator, fileSystem }
    }

    function textOf(fileSystem: FileSystem, path: string): string | undefined {
        const file = fileSystem.files[path]
        return file === undefined ? undefined : fileText(file)
    }

    it('keeps the open File when exit runs at the same trap address, including replay', async () => {
        const { emulator, fileSystem } = await withFiles(
            '    lea name,a1\n' +
                '    moveq #52,d0\n' +
                'dispatch: trap #15\n' +
                '    moveq #9,d0\n' +
                '    bra dispatch\n' +
                "name: dc.b 'made.txt',0\n"
        )
        try {
            await emulator.run(INSTRUCTION_LIMIT)
            expect(emulator.errors).toEqual([])
            expect(emulator.termination).toEqual({ kind: 'exit' })
            expect(textOf(fileSystem, 'made.txt')).toBe('')
            expect(emulator.undo(1)).toBe(1)
            expect(textOf(fileSystem, 'made.txt')).toBe('')
            await emulator.step()
            expect(emulator.termination).toEqual({ kind: 'exit' })
            expect(textOf(fileSystem, 'made.txt')).toBe('')
            expect(emulator.undo(4)).toBe(4)
            expect(textOf(fileSystem, 'made.txt')).toBeUndefined()
        } finally {
            emulator.dispose()
        }
    })

    it('refuses Undo before the Core changes when a File inverse no longer fits', async () => {
        const code = ORG + trap(52, ['    lea name,a1']) + trap(9) + "name: dc.b 'made.txt',0\n"
        const fileSystem = new FileSystem()
        const emulator = M68KEmulator(code, {
            peripherals: { fileSystem },
            fileSystemHistoryBudgetMb: 0
        })
        try {
            await emulator.compile(100, code)
            await emulator.run(INSTRUCTION_LIMIT)
            expect(emulator.errors).toEqual([])
            //Exit and the move before it remain reversible; the open does not.
            expect(emulator.undo(2)).toBe(2)
            expect(emulator.canUndo).toBe(false)
            const pc = emulator._getPc()
            const registers = emulator._getRegisterValues()
            expect(emulator.undo(1)).toBe(0)
            expect(() => emulator._undo()).toThrow('FileSystem Undo history exhausted')
            expect(emulator._getPc()).toBe(pc)
            expect(emulator._getRegisterValues()).toEqual(registers)
            expect(textOf(fileSystem, 'made.txt')).toBe('')
        } finally {
            emulator.dispose()
        }
    })

    const plain = (content: string) => ({ encoding: 'plain' as const, content })

    /** Writes `hello` to a new File, reads it back from the start, closes it and prints it. */
    const WRITE_READ_PRINT =
        trap(52, ['    lea name,a1']) +
        '    move.l d1,d7\n' +
        trap(54, ['    move.l d7,d1', '    lea text,a1', '    move.l #5,d2']) +
        trap(55, ['    move.l d7,d1', '    move.l #0,d2']) +
        trap(53, ['    move.l d7,d1', '    lea buffer,a1', '    move.l #64,d2']) +
        '    move.l d2,d6\n' +
        trap(56, ['    move.l d7,d1']) +
        trap(13, ['    lea buffer,a1']) +
        trap(9) +
        '    org $2000\n' +
        "name:   dc.b 'out/greeting.txt',0\n" +
        "text:   dc.b 'hello'\n" +
        'buffer: dcb.b 65,0\n'

    it('writes a File, reads it back and prints it', async () => {
        const { emulator, fileSystem } = await withFiles(WRITE_READ_PRINT)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('hello\n')
        //the first file number is 0, as EASy68K numbers its eight
        expect(registerOf(emulator, 'D7')).toBe(0n)
        expect(registerOf(emulator, 'D6')).toBe(5n)
        expect(textOf(fileSystem, 'out/greeting.txt')).toBe('hello')
    })

    it('takes the write back with the instruction that made it, and the File with the open', async () => {
        const { emulator, fileSystem } = await withFiles(WRITE_READ_PRINT)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(textOf(fileSystem, 'out/greeting.txt')).toBe('hello')
        //back step by step until the File is empty again, which is the write task's own step
        while (emulator.canUndo && textOf(fileSystem, 'out/greeting.txt') === 'hello') {
            emulator.undo(1)
        }
        expect(textOf(fileSystem, 'out/greeting.txt')).toBe('')
        //the next instruction is the write's trap again, line 9 below the ORG, its arguments set
        expect(emulator.line).toBe(9)
        expect(registerOf(emulator, 'D2')).toBe(5n)
        //and the open before it created the File, so undoing it removes the File
        while (emulator.canUndo && textOf(fileSystem, 'out/greeting.txt') !== undefined) {
            emulator.undo(1)
        }
        expect(textOf(fileSystem, 'out/greeting.txt')).toBeUndefined()
        //running again does it all again, from the same file number
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(textOf(fileSystem, 'out/greeting.txt')).toBe('hello')
        expect(registerOf(emulator, 'D7')).toBe(0n)
        expect(registerOf(emulator, 'D6')).toBe(5n)
    })

    it('opens an existing File for reading and writing, and fails on one that is missing', async () => {
        const { emulator } = await withFiles(
            trap(51, ['    lea missing,a1']) +
                '    move.l d1,d3\n' +
                '    move.w d0,d4\n' +
                trap(51, ['    lea name,a1']) +
                '    move.w d0,d5\n' +
                trap(9) +
                '    org $2000\n' +
                "name:    dc.b 'data.txt',0\n" +
                "missing: dc.b 'nothing.txt',0\n",
            { 'data.txt': plain('abc') }
        )
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D3')).toBe(0xffffffffn)
        expect(registerOf(emulator, 'D4') & 0xffffn).toBe(2n)
        expect(registerOf(emulator, 'D1')).toBe(0n)
        expect(registerOf(emulator, 'D5') & 0xffffn).toBe(0n)
    })

    it('answers a ninth open with no file, as EASy68K has eight', async () => {
        const { emulator } = await withFiles(
            [
                '    lea numbers,a2',
                '    lea codes,a3',
                '    move.w #8,d7',
                'again:',
                '    lea name,a1',
                '    move.b #51,d0',
                '    trap #15',
                '    move.l d1,(a2)+',
                '    move.w d0,(a3)+',
                '    dbra d7,again'
            ].join('\n') +
                '\n' +
                trap(9) +
                '    org $2000\n' +
                'numbers: ds.l 9\n' +
                'codes:   ds.w 9\n' +
                "name:    dc.b 'data.txt',0\n",
            { 'data.txt': plain('abc') }
        )
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        const numbers = emulator.readMemoryBytes(0x2000n, 36)
        const view = new DataView(numbers.buffer, numbers.byteOffset, numbers.byteLength)
        expect(Array.from({ length: 9 }, (_, i) => view.getInt32(i * 4))).toEqual([
            0, 1, 2, 3, 4, 5, 6, 7, -1
        ])
        const codes = emulator.readMemoryBytes(0x2024n, 18)
        const codeView = new DataView(codes.buffer, codes.byteOffset, codes.byteLength)
        expect(Array.from({ length: 9 }, (_, i) => codeView.getUint16(i * 2))).toEqual([
            0, 0, 0, 0, 0, 0, 0, 0, 2
        ])
    })

    it('reports a short read, then the end of the File without touching D2.L', async () => {
        const { emulator } = await withFiles(
            trap(51, ['    lea name,a1']) +
                '    move.l d1,d7\n' +
                trap(53, ['    move.l d7,d1', '    lea buffer,a1', '    move.l #64,d2']) +
                '    move.w d0,d4\n' +
                '    move.l d2,d5\n' +
                trap(53, ['    move.l d7,d1', '    lea buffer,a1']) +
                '    move.w d0,d6\n' +
                trap(9) +
                '    org $2000\n' +
                "name:   dc.b 'data.txt',0\n" +
                'buffer: dcb.b 64,0\n',
            { 'data.txt': plain('abc') }
        )
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D4') & 0xffffn).toBe(0n)
        expect(registerOf(emulator, 'D5')).toBe(3n)
        //the end of the file is 1, and the count is left as the program set it
        expect(registerOf(emulator, 'D6') & 0xffffn).toBe(1n)
        expect(registerOf(emulator, 'D2')).toBe(3n)
    })

    it('checks, deletes and closes all, each with its result in D0.W', async () => {
        const { emulator, fileSystem } = await withFiles(
            trap(59, ['    lea name,a1']) +
                '    move.w d0,d3\n' +
                trap(51, ['    lea name,a1']) +
                '    move.l d1,d7\n' +
                trap(57, ['    lea name,a1']) +
                '    move.w d0,d4\n' +
                trap(59, ['    lea name,a1']) +
                '    move.w d0,d5\n' +
                //the deleted File is still open, and still readable through its number
                trap(53, ['    move.l d7,d1', '    lea buffer,a1', '    move.l #8,d2']) +
                '    move.l d2,d6\n' +
                trap(50) +
                trap(53, ['    move.l d7,d1', '    lea buffer,a1', '    move.l #8,d2']) +
                '    move.w d0,d1\n' +
                trap(9) +
                '    org $2000\n' +
                "name:   dc.b 'data.txt',0\n" +
                'buffer: dcb.b 8,0\n',
            { 'data.txt': plain('abc') }
        )
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D3') & 0xffffn).toBe(0n)
        expect(registerOf(emulator, 'D4') & 0xffffn).toBe(0n)
        expect(registerOf(emulator, 'D5') & 0xffffn).toBe(2n)
        expect(registerOf(emulator, 'D6')).toBe(3n)
        //closed by task 50, so the last read fails
        expect(registerOf(emulator, 'D1') & 0xffffn).toBe(2n)
        expect(textOf(fileSystem, 'data.txt')).toBeUndefined()
    })

    const DIALOG =
        trap(58, ['    move.l #1,d1', '    lea title,a1', '    move.l #0,a2', '    lea path,a3']) +
        '    move.w d0,d5\n' +
        trap(9) +
        '    org $2000\n' +
        "title: dc.b 'Save the scores',0\n" +
        'path:  dcb.b 256,0\n'

    it('answers the file dialog with the path typed in the Prompt', async () => {
        const { emulator } = await withFiles(DIALOG)
        const running = emulator.run(INSTRUCTION_LIMIT)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(Prompt.question).toContain('Save the scores')
        Prompt.answerText('scores.txt')
        await running
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D1')).toBe(1n)
        expect(new TextDecoder().decode(emulator.readMemoryBytes(0x2010n, 11))).toBe('scores.txt\0')
    })

    it('shows the file dialog’s suggested path without echoing the dialog answer', async () => {
        const body = DIALOG.replace('path:  dcb.b 256,0', "path:  dc.b 'old.txt',0\n    ds.b 248")
        const { emulator } = await withFiles(body)
        try {
            const running = emulator.run(INSTRUCTION_LIMIT)
            await new Promise((resolve) => setTimeout(resolve, 20))
            expect(Prompt.placeholder).toBe('old.txt')
            Prompt.answerText('new.txt')
            await running
            expect(emulator.errors).toEqual([])
            expect(emulator.stdOut).toBe('')
            expect(new TextDecoder().decode(emulator.readMemoryBytes(0x2010n, 8))).toBe('new.txt\0')
        } finally {
            emulator.dispose()
        }
    })

    it('answers a cancelled file dialog with 0 in D1.L, leaving the buffer alone', async () => {
        const { emulator } = await withFiles(DIALOG)
        const running = emulator.run(INSTRUCTION_LIMIT)
        await new Promise((resolve) => setTimeout(resolve, 20))
        expect(Prompt.promise).not.toBeNull()
        Prompt.cancel()
        await running
        expect(emulator.errors).toEqual([])
        expect(registerOf(emulator, 'D1')).toBe(0n)
        expect(registerOf(emulator, 'D5') & 0xffffn).toBe(0n)
        expect([...emulator.readMemoryBytes(0x2010n, 4)]).toEqual([0, 0, 0, 0])
    })

    it('treats an empty file-dialog answer as Cancel, without echo or memory writes', async () => {
        const { emulator } = await withFiles(DIALOG)
        try {
            const running = emulator.run(INSTRUCTION_LIMIT)
            await new Promise((resolve) => setTimeout(resolve, 20))
            Prompt.answerText('')
            await running
            expect(emulator.errors).toEqual([])
            expect(registerOf(emulator, 'D1')).toBe(0n)
            expect(emulator.stdOut).toBe('')
            expect(inkCount(emulator)).toBe(0)
            expect([...emulator.readMemoryBytes(0x2010n, 4)]).toEqual([0, 0, 0, 0])
        } finally {
            emulator.dispose()
        }
    })

    it('runs a testcase on its own copy of the Files', async () => {
        const { emulator, fileSystem } = await withFiles(WRITE_READ_PRINT)
        const [result] = await emulator.test(
            ORG + WRITE_READ_PRINT,
            [
                {
                    input: [],
                    expectedOutput: 'hello\n',
                    startingRegisters: {},
                    expectedRegisters: { D6: 5n },
                    startingMemory: [],
                    expectedMemory: []
                }
            ],
            INSTRUCTION_LIMIT
        )
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
        expect(textOf(fileSystem, 'out/greeting.txt')).toBeUndefined()
    })
})

/**
 * EASy68K's sound tasks against real Files: the editor reports what happened and the Core writes
 * D0.W as EASy68K does ([audio.md](../../../../../../docs/design/audio.md#easy68ks-files-and-answers)).
 * The Audio's clock stands still, so a Sound the standard player started is busy for the whole test.
 */
describe('M68K sound tasks', () => {
    const base64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64')
    const FILES: ProjectFiles = {
        'beep.wav': { encoding: 'base64', content: base64(makeWav({ lengthMs: 500 })) },
        'song.mid': { encoding: 'base64', content: base64(makeMidi(4)) },
        'notes.txt': { encoding: 'plain', content: 'hello' }
    }
    const NAMES =
        "beep: dc.b 'beep.wav',0\nsong: dc.b 'song.mid',0\ntext: dc.b 'notes.txt',0\n" +
        "nope: dc.b 'nope.wav',0\n"

    async function withSounds(body: string) {
        const code = ORG + body + trap(9) + NAMES
        const output = new RecordingAudioOutput()
        const emulator = M68KEmulator(code, {
            peripherals: { fileSystem: new FileSystem(FILES), audio: new Audio({ output }) }
        })
        await emulator.compile(200, code)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        return { emulator, output }
    }
    const sounds = (output: RecordingAudioOutput) =>
        output.commands.filter((c) => c.type === 'sound').length
    /** D0.W after the task, kept in D5 before the next one overwrites it. */
    const keep = (register: string) => `    move.l d0,${register}\n`

    it('plays a File on the standard player, busy for its length, and leaves D0 for a missing one', async () => {
        const { emulator, output } = await withSounds(
            trap(70, ['    lea beep,a1']) +
                keep('d5') +
                trap(70, ['    lea beep,a1']) +
                keep('d6') +
                trap(70, ['    lea nope,a1']) +
                keep('d7')
        )
        expect(registerOf(emulator, 'D5') & 0xffffn).toBe(1n)
        expect(registerOf(emulator, 'D6') & 0xffffn).toBe(0n)
        //EASy68K writes nothing for a File that is not there, so D0 still holds the task number
        expect(registerOf(emulator, 'D7') & 0xffffn).toBe(70n)
        expect(sounds(output)).toBe(1)
        expect(emulator.notes.map((n) => n.text)).toEqual(["Sound File 'nope.wav' not found"])
    })

    it('loads slots and plays them, leaving D0 alone for an empty one', async () => {
        const { emulator } = await withSounds(
            trap(71, ['    lea beep,a1', '    move.b #3,d1']) +
                keep('d4') +
                trap(72, ['    move.b #3,d1']) +
                keep('d5') +
                trap(72, ['    move.b #9,d1']) +
                keep('d6')
        )
        //task 71 writes nothing
        expect(registerOf(emulator, 'D4') & 0xffffn).toBe(71n)
        expect(registerOf(emulator, 'D5') & 0xffffn).toBe(1n)
        expect(registerOf(emulator, 'D6') & 0xffffn).toBe(72n)
    })

    it('mixes WAV and MIDI Files on the DirectX player and refuses what it cannot play', async () => {
        const { emulator, output } = await withSounds(
            trap(73, ['    lea beep,a1']) +
                keep('d4') +
                trap(73, ['    lea song,a1']) +
                keep('d5') +
                trap(74, ['    lea text,a1', '    move.b #1,d1']) +
                keep('d6') +
                trap(75, ['    move.b #1,d1']) +
                keep('d7')
        )
        expect(registerOf(emulator, 'D4') & 0xffffn).toBe(1n)
        expect(registerOf(emulator, 'D5') & 0xffffn).toBe(1n)
        expect(registerOf(emulator, 'D6') & 0xffffn).toBe(0n)
        expect(registerOf(emulator, 'D7') & 0xffffn).toBe(0n)
        expect(sounds(output)).toBe(2)
        expect(emulator.notes.map((n) => n.text)).toEqual([
            "Sound File 'notes.txt' is neither a WAV nor a MIDI File, which cannot be played"
        ])
    })

    it('loops with task 76 until the program ends', async () => {
        const { emulator, output } = await withSounds(
            trap(71, ['    lea beep,a1', '    move.b #0,d1']) +
                trap(76, ['    move.b #0,d1', '    move.l #1,d2']) +
                keep('d5')
        )
        expect(registerOf(emulator, 'D5') & 0xffffn).toBe(1n)
        expect(output.commands.some((c) => c.type === 'sound' && c.loop)).toBe(true)
        //the program ended on its own, which stops its loops
        expect(output.commands.at(-1)?.type).toBe('stop')
    })

    it('stops everything with control 3, and sends nothing a slice started and stopped', async () => {
        const { emulator, output } = await withSounds(
            trap(71, ['    lea beep,a1', '    move.b #0,d1']) +
                trap(76, ['    move.b #0,d1', '    move.l #1,d2']) +
                trap(76, ['    move.b #0,d1', '    move.l #3,d2']) +
                keep('d6')
        )
        expect(registerOf(emulator, 'D6') & 0xffffn).toBe(1n)
        expect(output.commands.filter((c) => c.type !== 'stopAll')).toEqual([])
    })

    it('lets EASy68K’s busy loop finish in a Testcase, where nothing is ever playing', async () => {
        const body =
            trap(71, ['    lea beep,a1', '    move.b #0,d1']) +
            trap(72, ['    move.b #0,d1']) +
            'wait:\n' +
            trap(72, ['    move.b #0,d1']) +
            '    tst.w d0\n    beq wait\n' +
            '    lea done,a1\n' +
            trap(14) +
            trap(9) +
            NAMES +
            "done: dc.b 'done',0\n"
        const code = ORG + body
        const emulator = M68KEmulator(code, {
            peripherals: { fileSystem: new FileSystem(FILES), audio: new Audio() }
        })
        const results = await emulator.test(
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
        expect(results[0]?.errors ?? []).toEqual([])
        expect(results[0]?.passed).toBe(true)
    })

    it('sends a Sound played before a read while the read waits, not once it is answered', async () => {
        const code = ORG + trap(70, ['    lea beep,a1']) + trap(4) + trap(9) + NAMES
        const output = new RecordingAudioOutput()
        const emulator = M68KEmulator(code, {
            peripherals: { fileSystem: new FileSystem(FILES), audio: new Audio({ output }) }
        })
        await emulator.compile(200, code)
        const run = emulator.run(INSTRUCTION_LIMIT)
        for (let i = 0; i < 200 && emulator.interrupt === undefined; i++) {
            await new Promise((resolve) => setTimeout(resolve, 5))
        }
        expect(emulator.interrupt).toBeDefined()
        expect(sounds(output)).toBe(1)
        emulator.peripherals.terminal.insertText('7')
        emulator.peripherals.terminal.pressEnter()
        await run
        expect(emulator.errors).toEqual([])
    })

    it('takes a Sound back with the trap that played it', async () => {
        const code = ORG + trap(70, ['    lea beep,a1']) + '    nop\n' + trap(9) + NAMES
        const output = new RecordingAudioOutput()
        const emulator = M68KEmulator(code, {
            peripherals: { fileSystem: new FileSystem(FILES), audio: new Audio({ output }) }
        })
        await emulator.compile(200, code)
        for (let i = 0; i < 6 && sounds(output) === 0; i++) await emulator.step()
        expect(sounds(output)).toBe(1)
        emulator.undo(1)
        expect(output.commands.filter((c) => c.type === 'stop')).toHaveLength(1)
    })
})

describe('M68K breakpoints', () => {
    /**
     * Two prompts in a row with a breakpoint on the instruction between them: the Core resumes a
     * program after every answered trap, and it used to be told to skip a breakpoint on the
     * instruction it resumed at, which is the instruction right after the trap. A breakpoint there
     * stopped nothing and the whole Run went by
     * ([ADR 0023](../../../../../../docs/adr/0023-run-continues-past-the-breakpoint-it-is-parked-on.md)).
     */
    const TWO_PROMPTS = [
        '    lea first,a1',
        '    move.b #18,d0',
        '    trap #15',
        '    move.l d1,d2',
        '    lea second,a1',
        '    move.b #18,d0',
        '    trap #15',
        '    add.l d1,d2',
        '    move.b #9,d0',
        '    trap #15',
        "first:  dc.b 'First: ',0",
        "second: dc.b 'Second: ',0"
    ].join('\n')

    it('stops on a breakpoint on the instruction after a trap', async () => {
        const code = ORG + TWO_PROMPTS
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.peripherals.terminal.useScriptedInput(['5', '7'])
        //`move.l d1,d2`, the line after the first trap, counting the ORG as line 0
        emulator.toggleBreakpoint(4)

        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.line).toBe(4)
        expect(emulator.terminated).toBe(false)
        expect(registerOf(emulator, 'D1')).toBe(5n)
        expect(registerOf(emulator, 'D2')).toBe(0n)

        //and Run continues from the breakpoint it is parked on rather than stopping on it again
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(true)
        expect(registerOf(emulator, 'D2')).toBe(12n)
    })

    it('stops again on the same breakpoint when the program comes back round to it', async () => {
        //the skip is for the instruction the Run starts on, not for the address: a loop that closes
        //on its breakpoint stops every time it reaches it
        const code =
            ORG +
            [
                '    move.l #3,d0',
                'loop:',
                '    sub.l #1,d0',
                '    bne loop',
                '    move.b #9,d0',
                '    trap #15'
            ].join('\n')
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        emulator.toggleBreakpoint(3)

        for (const remaining of [3n, 2n, 1n]) {
            await emulator.run(INSTRUCTION_LIMIT)
            expect(emulator.line).toBe(3)
            expect(registerOf(emulator, 'D0')).toBe(remaining)
        }
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.terminated).toBe(true)
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
        //EASy68K calendar hundredths since local midnight, wrapping at the next midnight.
        expect(time).toBeGreaterThanOrEqual(0)
        expect(time).toBeLessThan(24 * 60 * 60 * 100)
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
        //the Core names the register and what the task takes; the trap table names the task
        expect(emulator.errors.join('\n')).toContain(
            'Trap task 92 (set drawing mode) was given a value it cannot take: D1.B is 14'
        )
        expect(emulator.termination?.kind).toBe('error')
    })
})

/**
 * Pokes against the real Core ([the design record](../../../../../../docs/design/pokes.md),
 * [ADR 0022](../../../../../../docs/adr/0022-core-native-poke-records.md)): a poked value is one step of
 * the same history the instructions use, told apart by its kind, and undone like any other.
 */
describe('M68K Pokes', () => {
    const TWO_MOVES = ['    move.l #1,d0', '    move.l #2,d1'].join('\n') + '\n'

    /** Built with a history, and stopped between two instructions, which is when a Poke is possible. */
    async function stepped(body: string, steps = 1) {
        const code = ORG + body
        const emulator = M68KEmulator(code)
        await emulator.compile(200, code)
        for (let i = 0; i < steps; i++) await emulator.step()
        return emulator
    }

    it('records a poked register as a step of its own, and undoes it', async () => {
        const emulator = await stepped(TWO_MOVES + trap(9))
        expect(registerOf(emulator, 'D0')).toBe(1n)
        expect(emulator.canPoke).toBe(true)
        const line = emulator.line

        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'D0', value: 0xcafen }])
        ).toBe(true)
        expect(registerOf(emulator, 'D0')).toBe(0xcafen)

        const [step] = emulator.latestSteps
        expect(step.kind).toBe('poke')
        //no instruction ran, so the row has no line to go to
        expect(step.line).toBe(-1)
        expect(step.writes).toEqual([{ type: 'register', name: 'D0', old: 1n, new: 0xcafen }])
        expect(emulator.canUndo).toBe(true)

        //a Poke changed no flag, so the Status flags highlight nothing: the CCR the row reports as
        //the one before it is the CCR the machine is on
        for (const flag of emulator.statusRegisters) expect(flag.prev).toBe(flag.value)
        //and the line the panel is on is still the instruction the program is about to run
        expect(emulator.line).toBe(line)

        emulator.undo(1)
        expect(registerOf(emulator, 'D0')).toBe(1n)
        expect(emulator.latestSteps[0].kind).toBe('instruction')
    })

    it('names the width an instruction wrote, which the Core spells by name', async () => {
        //serde crosses the `Size` enum as its variant name, not the number the types declare, and a
        //row that lost the width read "undefined bytes"
        const emulator = await stepped('    move.w #2,d1\n' + trap(9))
        const [step] = emulator.latestSteps
        expect(step.kind).toBe('instruction')
        expect(step.mutations).toContainEqual({
            type: 'WriteRegister',
            value: { register: 'd1', old: 0n, new: 2n, size: RegisterSize.Word }
        })
    })

    it('refuses a value the register cannot hold, and records nothing for a value it already has', async () => {
        const emulator = await stepped(TWO_MOVES + trap(9))
        expect(() =>
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [
                { register: 'D0', value: 0x1_0000_0000n }
            ])
        ).toThrow('does not fit D0')
        //poking what is already there is not a change, so there is nothing to undo
        expect(emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'D0', value: 1n }])).toBe(
            false
        )
        expect(emulator.latestSteps[0].kind).toBe('instruction')

        //the widest value the register can hold is not the same thing as one too wide for it
        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'D0', value: 0xffffffffn }])
        ).toBe(true)
        expect(registerOf(emulator, 'D0')).toBe(0xffffffffn)
        expect(emulator.latestSteps[0].writes).toEqual([
            { type: 'register', name: 'D0', old: 1n, new: 0xffffffffn }
        ])
    })

    it('records poked memory as one step, however many bytes it spans', async () => {
        const emulator = await stepped(TWO_MOVES + trap(9))
        const bytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef])

        expect(emulator.pokeMemory(0x3000n, bytes)).toBe(true)
        expect([...emulator.readMemoryBytes(0x3000n, 4)]).toEqual([...bytes])

        const [step] = emulator.latestSteps
        expect(step.kind).toBe('poke')
        //memory this program never wrote starts at 0xFF on this Core
        expect(step.writes).toEqual([
            { type: 'memory', address: 0x3000n, old: [255, 255, 255, 255], new: [...bytes] }
        ])

        emulator.undo(1)
        expect([...emulator.readMemoryBytes(0x3000n, 4)]).toEqual([255, 255, 255, 255])
    })

    it('puts back the value the program found when the instruction after a Poke is undone too', async () => {
        const emulator = await stepped(TWO_MOVES + trap(9))
        emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'D1', value: 0x55n }])
        //the second move overwrites the poked value, so undoing both has to walk back through it
        await emulator.step()
        expect(registerOf(emulator, 'D1')).toBe(2n)

        emulator.undo(1)
        expect(registerOf(emulator, 'D1')).toBe(0x55n)
        emulator.undo(1)
        expect(registerOf(emulator, 'D1')).toBe(0n)
    })

    it('leaves the Screen journal where it is when a Poke is undone', async () => {
        const body =
            trap(80, ['    move.l #$00FFFFFF,d1']) +
            trap(82, ['    move.l #10,d1', '    move.l #10,d2']) +
            trap(9)
        //the two moves and the trap of each task: seven instructions, and the pixel is drawn
        const emulator = await stepped(body, 7)
        const screen = emulator.peripherals.screen
        expect(inkCount(emulator)).toBe(1)
        const journaled = screen.history.sequence

        expect(
            emulator.pokeRegisters(CPU_REGISTER_FILE_ID, [{ register: 'D2', value: 0x99n }])
        ).toBe(true)
        expect(screen.history.sequence).toBe(journaled)

        //a Poke drew nothing, so undoing it must not pop the record of the instruction that did
        emulator.undo(1)
        expect(screen.history.sequence).toBe(journaled)
        expect(inkCount(emulator)).toBe(1)
        expect(registerOf(emulator, 'D2')).toBe(10n)
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

describe('M68K termination', () => {
    async function build(body: string) {
        const code = ORG + body
        const emulator = M68KEmulator(code)
        //a history, so the end can be undone
        await emulator.compile(200, code)
        return emulator
    }

    it('says task 9 exited, by a Run or a Step', async () => {
        const program = '    move.l #1,d1\n' + trap(9) + '    move.l #2,d1\n'
        const ran = await build(program)
        await ran.run(INSTRUCTION_LIMIT)
        expect(ran.terminated).toBe(true)
        //EASy68K's task 9 has no status to report
        expect(ran.termination).toEqual({ kind: 'exit' })
        const stepped = await build(program)
        for (let steps = 0; !stepped.terminated && steps < 10; steps++) await stepped.step()
        expect(stepped.termination).toEqual({ kind: 'exit' })
        expect(registerOf(stepped, 'D1')).toBe(1n)
    })

    it('marks the program ended only when the run is over, beside its running time', async () => {
        //the Log reads both as soon as `terminated` changes, so the slice must not say it first
        const emulator = await build(trap(9))
        const runSlice = emulator._runSlice.bind(emulator)
        let endedDuringTheRun: boolean | undefined
        emulator._runSlice = async (request) => {
            const slice = await runSlice(request)
            endedDuringTheRun = emulator.terminated
            return slice
        }
        await emulator.run(INSTRUCTION_LIMIT)
        expect(endedDuringTheRun).toBe(false)
        expect(emulator.terminated).toBe(true)
        expect(emulator.executionTime).toBeGreaterThanOrEqual(0)
    })

    it('says where a program that does not end itself ran into memory it never wrote', async () => {
        //two `moveq`s, two bytes each, so the first word nobody wrote is at $1004
        const emulator = await build('    move.l #1,d1\n    move.l #2,d2\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.terminated).toBe(true)
        expect(emulator.termination).toEqual({ kind: 'end', unwrittenMemory: '$1004' })
    })

    it('leaves a program simhalt paused unended, and ends it past the last instruction', async () => {
        //`simhalt` is four bytes, $FFFF $FFFF, which the program placed itself
        const emulator = await build('    move.l #1,d1\n    simhalt\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.terminated).toBe(false)
        expect(emulator.termination).toBeUndefined()
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.termination).toEqual({ kind: 'end', unwrittenMemory: '$1006' })
    })

    it('shows in the History what ran on no line, decoded from memory', async () => {
        //`$4E71` is the word of `nop`, which the program runs into from its last instruction
        const emulator = await build('    move.l #1,d1\n    dc.w $4E71\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.termination).toEqual({ kind: 'end', unwrittenMemory: '$1004' })
        const [data, code] = emulator.latestSteps
        expect(data).toMatchObject({ pc: 0x1002, line: -1, disassembly: 'NOP' })
        expect(code.line).toBe(1)
        expect(code.disassembly).toBeUndefined()
    })

    it('runs on into data that follows the code, as a 68000 does', async () => {
        //`$4AFC` is the word of `illegal`, and no line was laid out where it is
        const emulator = await build('    move.l #1,d1\n    dc.w $4AFC\n')
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.termination?.kind).toBe('error')
        expect(emulator.errors).toEqual(['Error at $1002: Illegal instruction exception'])
    })

    it('forgets how the program ended when Undo takes task 9 back', async () => {
        const emulator = await build(trap(9))
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.termination).toEqual({ kind: 'exit' })
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.terminated).toBe(false)
        expect(emulator.termination).toBeUndefined()
    })

    it('ends the program on a runtime error, until Undo takes it back', async () => {
        const emulator = await build('    move.l #1,a0\n    move.w (a0),d0\n' + trap(9))
        await emulator.run(INSTRUCTION_LIMIT)
        //The Core’s typed exception and the shared termination state describe the same failure.
        expect(emulator.terminated).toBe(true)
        expect(emulator.termination).toEqual({ kind: 'error', message: emulator.errors[0] })
        expect(emulator.errors[0]).toContain('Address error')
        expect(emulator.undo(1)).toBe(1)
        expect(emulator.terminated).toBe(false)
        expect(emulator.termination).toBeUndefined()
    })

    it('reports a Step’s runtime error on the instruction that failed', async () => {
        const emulator = await build('    move.l #1,a0\n    move.w (a0),d0\n' + trap(9))
        await emulator.step()
        await expect(emulator.step()).rejects.toBeDefined()
        expect(emulator.termination?.kind).toBe('error')
        expect(emulator.errors[0]).toContain('Address error')
        //the `move.w`, below ORG and the `move.l`
        expect(emulator.line).toBe(2)
    })
})

describe('M68K machine code', () => {
    it('gives each line its encoding, and what it assembled as where it differs', async () => {
        const code =
            ORG + ['loop:', '    move.l #5,d0', '    add.l #1,d0', '    bra loop'].join('\n')
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        expect(
            emulator.buildArtifacts.map(({ line, address, opcode, assembledAs }) => ({
                line,
                address,
                opcode,
                assembledAs
            }))
        ).toEqual([
            { line: 2, address: 0x1000n, opcode: '70 05', assembledAs: 'MOVEQ #5,D0' },
            { line: 3, address: 0x1002n, opcode: '52 80', assembledAs: 'ADDQ.L #1,D0' },
            { line: 4, address: 0x1004n, opcode: '60 fa', assembledAs: 'BRA.S loop' }
        ])
        emulator.dispose()
    })

    it('leaves out what a line assembled as when it is what the line wrote', async () => {
        const code = ORG + '    move.w d1,d2\n'
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        expect(emulator.buildArtifacts).toEqual([
            { file: emulator.entry, line: 1, address: 0x1000n, opcode: '34 01' }
        ])
        emulator.dispose()
    })
})

describe('M68K Build output', () => {
    /** The records of an S-record file, each its type and its fields after the count. */
    function records(text: string) {
        return text
            .split('\r\n')
            .filter(Boolean)
            .map((record) => ({ type: record.slice(0, 2), body: record.slice(4, -2) }))
    }

    it('saves the program as the S-record EASy68K writes, beside the Entry as main.S68', async () => {
        const sources = {
            entry: 'main.x68',
            files: {
                'main.x68': {
                    encoding: 'plain' as const,
                    content: ORG + 'start: move.l #5,d0\n    simhalt\n    end start\n'
                }
            }
        }
        const emulator = M68KEmulator(sources)
        const saved: { path: string; text: string; format: string }[] = []
        const host = {
            claim: async () => 'save' as const,
            save: (_sources: BuildSources, path: string, bytes: Uint8Array, format) => {
                saved.push({ path, text: new TextDecoder().decode(bytes), format })
                emulator.peripherals.fileSystem.writeBytes(path, bytes, true, 'plain')
            },
            isBuildOutput: () => false
        } satisfies BuildOutputHost
        emulator.setBuildOutputHost(host)
        await emulator.compile(100, sources)
        expect(emulator.errors).toEqual([])
        expect(saved.map(({ path, format }) => ({ path, format }))).toEqual([
            { path: 'main.S68', format: 'srecord' }
        ])
        const [header, data, entry] = records(saved[0].text)
        //EASy68K's header, then `moveq #5,d0` and `simhalt` at $1000, then the entry point
        expect(header.type).toBe('S0')
        expect(Buffer.from(header.body.slice(4), 'hex').toString('latin1')).toBe(
            '68KPROG   20CREATED BY EASY68K'
        )
        expect(data).toEqual({ type: 'S1', body: '10007005FFFFFFFF' })
        expect(entry).toEqual({ type: 'S8', body: '001000' })
        //the Debug session's Files are the Build's, its output included
        expect(Object.keys(emulator.buildSources!.files)).toEqual(['main.x68', 'main.S68'])
        emulator.dispose()
    })
})

describe('M68K writes into code', () => {
    /** Turns the second instruction after the store into a `nop` before it runs. */
    const PATCHES_ITSELF = [
        '    lea target,a0',
        '    move.w #$4E71,(a0)',
        '    move.l #1,d1',
        'target: add.l #5,d1',
        '    move.b #9,d0',
        '    trap #15'
    ].join('\n')

    async function build(body: string) {
        const code = ORG + body
        const emulator = M68KEmulator(code)
        await emulator.compile(100, code)
        return emulator
    }

    it('pauses a Run after the store, names what it overwrote, and goes on with the new bytes', async () => {
        const emulator = await build(PATCHES_ITSELF)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(false)
        //paused after the `move.w`, on the `move.l` after it
        expect(emulator.line).toBe(3)
        expect(emulator.notes.map((note) => note.text)).toEqual([
            'The program wrote into its own code at $100C, line 5: `add.l #5,d1`. Run again to go on with the new bytes.'
        ])
        const [step] = emulator.latestSteps
        expect(step.mutations).toContainEqual({
            type: 'Other',
            value: 'Wrote into its code at $100C, line 5: add.l #5,d1'
        })

        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.termination).toEqual({ kind: 'exit' })
        //the `add.l` was a `nop` by the time it ran
        expect(registerOf(emulator, 'D1')).toBe(1n)
        emulator.dispose()
    })

    it('runs straight through when the Preference is off', async () => {
        const preference = preferencesStore.values.pauseOnCodeWrite
        preference.value = false
        try {
            const emulator = await build(PATCHES_ITSELF)
            await emulator.run(INSTRUCTION_LIMIT)
            expect(emulator.termination).toEqual({ kind: 'exit' })
            expect(registerOf(emulator, 'D1')).toBe(1n)
            expect(emulator.notes).toEqual([])
            emulator.dispose()
        } finally {
            preference.value = true
        }
    })

    it('pauses after a trap whose answer was read into code', async () => {
        //task 2 stores the line typed at (a1), here over the instruction after the trap
        const emulator = await build(
            [
                '    lea after,a1',
                '    move.b #2,d0',
                '    trap #15',
                'after: move.l #7,d1',
                '    move.b #9,d0',
                '    trap #15'
            ].join('\n')
        )
        emulator.peripherals.terminal.useScriptedInput(['NN'])
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        expect(emulator.terminated).toBe(false)
        expect(emulator.notes.map((note) => note.text)).toEqual([
            'The program wrote into its own code at $100C, line 5: `move.l #7,d1`. Run again to go on with the new bytes.'
        ])
        emulator.dispose()
    })

    it('marks the line whose code changed, with what runs there now, until Undo puts it back', async () => {
        const emulator = await build(PATCHES_ITSELF)
        expect(emulator.changedCode).toEqual([])
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.changedCode).toEqual([
            { file: emulator.entry, line: 4, address: 0x100cn, runsNow: 'NOP' }
        ])
        emulator.undo(1)
        expect(emulator.changedCode).toEqual([])
        emulator.dispose()
    })

    it('marks a line a Poke changed', async () => {
        const emulator = await build(PATCHES_ITSELF)
        //`moveq #1,d1` at $100A becomes `moveq #3,d1`
        expect(emulator.pokeMemory(0x100an, new Uint8Array([0x72, 0x03]))).toBe(true)
        expect(emulator.changedCode).toEqual([
            { file: emulator.entry, line: 3, address: 0x100an, runsNow: 'MOVEQ #3,D1' }
        ])
        emulator.dispose()
    })

    it('says in the History what a changed line ran', async () => {
        const emulator = await build(PATCHES_ITSELF)
        await emulator.run(INSTRUCTION_LIMIT)
        await emulator.step()
        await emulator.step()
        //newest first: the `nop` the program made of `add.l #5,d1`, then the `moveq` before it
        const [patched, before] = emulator.latestSteps
        expect(patched.line).toBe(4)
        expect(patched.disassembly).toBe('NOP')
        expect(before.line).toBe(3)
        expect(before.disassembly).toBeUndefined()
        emulator.dispose()
    })

    it('records the write in the History of a Step, which never pauses for it', async () => {
        const emulator = await build(PATCHES_ITSELF)
        await emulator.step()
        await emulator.step()
        expect(emulator.notes).toEqual([])
        expect(emulator.latestSteps[0].mutations).toContainEqual({
            type: 'Other',
            value: 'Wrote into its code at $100C, line 5: add.l #5,d1'
        })
        //and Undo puts the instruction back
        emulator.undo(1)
        await emulator.step()
        await emulator.run(INSTRUCTION_LIMIT)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(registerOf(emulator, 'D1')).toBe(1n)
        emulator.dispose()
    })
})

describe('M68K slices', () => {
    /**
     * Clears and repaints the whole 640 by 480 image as fast as it can. The Core charges one
     * instruction per trap, so five instructions a frame: the case where the instruction budget says
     * nothing about how long the host will be held (phase 8).
     */
    const DRAWING_LOOP = [
        '    move.b  #92,d0',
        '    move.l  #17,d1',
        '    trap    #15',
        'loop:',
        '    move.b  #11,d0',
        '    move.l  #$FF00,d1',
        '    trap    #15',
        '    move.b  #94,d0',
        '    trap    #15',
        '    bra     loop'
    ].join('\n')

    it('names the run’s own limit when the last slice exhausts it', async () => {
        //a trap loop: the Core charges one instruction per trap and reports an exhausted limit by
        //throwing an error naming the halt limit it was given, which is a slice's share of the run
        const code =
            ORG + '    move.b  #6,d0\n    move.l  #65,d1\nloop:\n    trap #15\n    bra loop\n'
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        const runner = emulator as unknown as {
            _runSlice: (request: {
                instructionBudget: number
                timeBudgetMs: number
                breakpoints: number[]
                skipBreakpointAtPc: boolean
                runInstructionLimit: number
                speedCorrection: number
            }) => Promise<unknown>
        }
        await expect(
            runner._runSlice({
                instructionBudget: 5,
                timeBudgetMs: 50,
                breakpoints: [],
                skipBreakpointAtPc: true,
                runInstructionLimit: 200,
                speedCorrection: 1
            })
        ).rejects.toEqual({ type: 'ExecutionLimit', value: 200 })
    })

    it('ends a slice on its deadline when its instructions are screens of work', async () => {
        const code = ORG + DRAWING_LOOP
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        //the adapter’s estimate would let twelve thousand instructions into a 1 ms slice, and this
        //program charges five of them per whole-image clear and repaint
        const slice = await (
            emulator as unknown as {
                _runSlice: (request: {
                    instructionBudget: number
                    timeBudgetMs: number
                    breakpoints: number[]
                    skipBreakpointAtPc: boolean
                    runInstructionLimit: number
                    speedCorrection: number
                }) => Promise<{ reason: string; instructions: number }>
            }
        )._runSlice({
            instructionBudget: 1_000_000,
            timeBudgetMs: 1,
            breakpoints: [],
            skipBreakpointAtPc: true,
            runInstructionLimit: 1_000_000,
            speedCorrection: 1
        })
        expect(slice.reason).toBe('budget')
        expect(slice.instructions).toBeGreaterThan(0)
        expect(slice.instructions).toBeLessThan(1_000)
    })
})

describe('M68K trap documentation', () => {
    it('documents a task for every group', async () => {
        const groups = new Set(M68K_TRAP_DOCS.map((doc) => doc.group))
        expect([...groups].sort()).toEqual(['files', 'graphics', 'input', 'sound', 'text', 'time'])
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
     * Three of the four programs loop until Stop, so they are bounded by the instruction limit,
     * which counts every instruction the Core runs, traps included; a delay charges none. Twenty
     * thousand is a few dozen frames of these programs.
     */
    const FRAME_LOOP_LIMIT = 20_000

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

    /** Program time on the virtual clock, so a few dozen frames of delays take no real time. */
    const virtualClock = () => ({ clock: new ProgramClock({ mode: 'virtual' }) })

    async function runExample(name: string, limit: number) {
        const code = load(name)
        const emulator = M68KEmulator(code, { peripherals: virtualClock() })
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
        //on the real clock, before the square reaches the right edge
        const early = await runHoldingRight(600)
        const later = await runHoldingRight(2000)
        expectStoppedAtLimit(later)
        expect(inkCentroidX(later)).toBeGreaterThan(inkCentroidX(early))
        //the title is in the transcript and on the Screen at the same time (ADR 0003)
        expect(later.stdOut).toContain('Arrow keys move the square')
        expect(inkCount(later)).toBeGreaterThan(1_000)
    })

    it('draws the flappy bird ready screen', async () => {
        const emulator = await runExample('flappy-bird.x68', 2 * FRAME_LOOP_LIMIT)
        expectStoppedAtLimit(emulator)
        expect(emulator.peripherals.screen.doubleBuffering).toBe(true)
        //the sky is a filled rectangle over the whole screen, so nothing is left at the background
        expect(inkCount(emulator)).toBe(640 * 480)
        //and the bird is where it waits for the first flap, in the yellow the program picks.
        //Left of the wing, which is the one part of it that moves from frame to frame
        expect(pixelAt(emulator, 156, 220)).toBe(0xface3e)
    })

    it('paints under the pointer while the left button is held', async () => {
        const code = load('mouse-paint.x68')
        const emulator = M68KEmulator(code, { peripherals: virtualClock() })
        await emulator.compile(0, code)
        emulator.peripherals.mouse.buttonDown('left', 200, 150)
        await emulator.run(FRAME_LOOP_LIMIT)
        expectStoppedAtLimit(emulator)
        //a disc of the brush radius around the pointer, in the aqua the program picks
        expect(pixelAt(emulator, 200, 150)).toBe(0x00ffff)
    })
})

describe('M68K testcases', () => {
    /**
     * `simhalt` pauses the Core rather than terminating it, and an interactive Run stops there. A
     * Testcase used to resume past it and assert against whatever followed — which in the usual
     * EASy68K layout is the program's subroutines.
     */
    it('stops at simhalt instead of running into the code after it', async () => {
        const code = `${ORG}start:
    move.w #1,d0
    simhalt
after:
    move.w #99,d1
    simhalt
`
        const testcase: Testcase = {
            input: [],
            expectedOutput: '',
            startingRegisters: {},
            expectedRegisters: { D0: 1n, D1: 0n },
            startingMemory: [],
            expectedMemory: []
        }
        const emulator = M68KEmulator(code)
        await emulator.check()
        const [result] = await emulator.test(code, [testcase], INSTRUCTION_LIMIT, 100)
        expect(result.errors).toEqual([])
        expect(result.passed).toBe(true)
    })
})

describe('M68K Synth', () => {
    const SYNTH_LOOP =
        ['loop:', '    move.w d1,$E00100', '    addq.w #1,d1', '    bra loop'].join('\n') + '\n'

    it('ends a Testcase that loops on Synth stores at its instruction limit', async () => {
        const code = ORG + SYNTH_LOOP
        const emulator = M68KEmulator(code, { peripherals: { audio: new Audio() } })
        const started = performance.now()
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
            3000
        )
        expect(results[0]?.passed).toBe(false)
        expect(JSON.stringify(results[0]?.errors)).toContain('3000')
        expect(performance.now() - started).toBeLessThan(5000)
    })

    it('counts every instruction a slice ran across its stops at Synth stores', async () => {
        const code = ORG + SYNTH_LOOP
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)
        const runner = emulator as unknown as {
            _runSlice: (request: {
                instructionBudget: number
                timeBudgetMs: number
                breakpoints: number[]
                skipBreakpointAtPc: boolean
                runInstructionLimit: number
                speedCorrection: number
            }) => Promise<unknown>
        }
        //a speed that gives a slice of a second 30 instructions of a run of 1000, so its deadline
        //never comes first
        const request = {
            timeBudgetMs: 1000,
            breakpoints: [],
            skipBreakpointAtPc: true,
            speedCorrection: 30 / 12_000_000,
            instructionBudget: 1000,
            runInstructionLimit: 1000
        }
        //30 instructions, ten of them stores that each stopped the Core, and the slice says 30
        expect(await runner._runSlice(request)).toEqual({ reason: 'budget', instructions: 30 })
        //the last slice of the run stops the program at the run's own limit
        await expect(
            runner._runSlice({ ...request, instructionBudget: 30, runInstructionLimit: 60 })
        ).rejects.toEqual({ type: 'ExecutionLimit', value: 60 })
    })

    it('runs the Synth chapter’s example, a note that starts and fades', async () => {
        const overview = synthEntries('M68K', 'm68k', '/documentation')[0]
        const code = /```\w+\n([\s\S]*?)```/.exec(overview.searchText)![1]
        const output = new RecordingAudioOutput()
        const emulator = M68KEmulator(code, {
            peripherals: {
                audio: new Audio({ output }),
                clock: new ProgramClock({ mode: 'virtual' })
            }
        })
        await emulator.compile(200, code)
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.errors).toEqual([])
        const writes = output.commands.flatMap((c) => (c.type === 'synth' ? c.writes : []))
        const gates = writes.filter((value, i) => i % 2 === 1 && writes[i - 1] === 0x10)
        expect(gates).toEqual([1, 0])
    })

    const synthWrites = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) => (c.type === 'synth' ? c.writes : []))
    const uploads = (output: RecordingAudioOutput) =>
        output.commands.flatMap((c) => (c.type === 'synthUpload' ? [[c.offset, ...c.bytes]] : []))
    /** Channel 0 at 440 Hz and volume 100 with its gate on, then the frequency read back and printed. */
    const TONE =
        [
            '    lea $E00100,a0',
            '    move.w #440,(a0)',
            '    move.b #100,$12(a0)',
            '    move.b #1,$10(a0)',
            '    moveq #0,d1',
            '    move.w (a0),d1'
        ].join('\n') +
        '\n' +
        trap(3)

    async function withSynth(body: string, options: { run?: boolean } = {}) {
        const code = ORG + body + trap(9)
        const output = new RecordingAudioOutput()
        const emulator = M68KEmulator(code, { peripherals: { audio: new Audio({ output }) } })
        await emulator.compile(200, code)
        if (options.run ?? true) await emulator.run(INSTRUCTION_LIMIT)
        return { emulator, output, code }
    }

    it('hands every store in the block to the Synth as it happens, in big-endian order', async () => {
        const { emulator, output } = await withSynth(TONE)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('440')
        expect(synthWrites(output)).toEqual([0, 440, 0x12, 100, 0x10, 1])
        expect(output.commands.at(-1)).toEqual({ type: 'releaseChips' })
    })

    it('names its block as a device region in the memory view', async () => {
        const { emulator } = await withSynth('    nop\n', { run: false })
        expect(emulator.memoryRegions.filter((region) => region.kind === 'device')).toEqual([
            expect.objectContaining({ name: 'Synth', start: 0xe00100n, end: 0xe00300n })
        ])
    })

    it('leaves a program’s own bytes in the block, zeroes the rest and says so', async () => {
        const code = ORG + '    move.b #1,d0\n' + '    ORG $E00110\n' + 'table: dc.b 7,8\n'
        const emulator = M68KEmulator(code)
        await emulator.compile(200, code)
        expect([...emulator.readMemoryBytes(0xe00110n, 2)]).toEqual([7, 8])
        expect([...emulator.readMemoryBytes(0xe00100n, 4)]).toEqual([0, 0, 0, 0])
        expect([...emulator.readMemoryBytes(0xe002fcn, 4)]).toEqual([0, 0, 0, 0])
        expect(emulator.notes.map((note) => note.text).join(' ')).toContain('$E00100 to $E002FF')
    })

    it('starts the block at zero, where the rest of memory starts at $FF', async () => {
        const { emulator } = await withSynth(
            ['    moveq #0,d1', '    move.w $E00100,d1'].join('\n') + '\n' + trap(3)
        )
        expect(emulator.stdOut).toBe('0')
    })

    it('decodes a long and a movem into the registers they cover, and keeps a gate pulse', async () => {
        const { emulator, output } = await withSynth(
            [
                '    lea $E00120,a0',
                '    move.l #$03700800,(a0)',
                '    move.l #$00010000,d2',
                '    move.l #$00000000,d3',
                '    movem.l d2-d3,$10(a0)',
                '    move.b #1,$10(a0)'
            ].join('\n') + '\n'
        )
        expect(emulator.errors).toEqual([])
        expect(synthWrites(output)).toEqual([
            0x20, 0x370, 0x22, 0x800, 0x30, 0, 0x31, 1, 0x32, 0, 0x33, 0, 0x30, 1
        ])
    })

    it('copies an upload when it is started, before the program changes its buffer', async () => {
        const { emulator, output } = await withSynth(
            [
                '    lea $E00100,a0',
                '    lea wave,a1',
                '    move.l a1,$180(a0)',
                '    move.w #4,$184(a0)',
                '    move.w #100,$186(a0)',
                '    move.b #0,$188(a0)',
                '    move.b #9,(a1)',
                '    bra done',
                'wave: dc.b 1,2,3,4',
                'done:'
            ].join('\n') + '\n'
        )
        expect(emulator.errors).toEqual([])
        expect(uploads(output)).toEqual([[100, 1, 2, 3, 4]])
    })

    it('stops at a Breakpoint on the instruction after a watched store', async () => {
        const body =
            ['    move.b #1,$E00110', '    move.l #7,d4', '    move.l #8,d5'].join('\n') + '\n'
        const { emulator, output, code } = await withSynth(body, { run: false })
        emulator.toggleBreakpoint(code.split('\n').indexOf('    move.l #7,d4'))
        await emulator.run(INSTRUCTION_LIMIT)
        expect(emulator.terminated).toBe(false)
        expect(registerOf(emulator, 'D4')).toBe(0n)
        expect(synthWrites(output)).toEqual([0x10, 1])
    })

    it('plays its rewound registers after an Undo', async () => {
        const { emulator, output } = await withSynth(
            [
                '    move.b #100,$E00112',
                '    move.b #1,$E00110',
                '    move.b #0,$E00110',
                '    nop'
            ].join('\n') + '\n',
            { run: false }
        )
        const gates = () =>
            synthWrites(output).filter((value, i, all) => i % 2 === 1 && all[i - 1] === 0x10)
        await emulator.step()
        await emulator.step()
        await emulator.step()
        expect(gates()).toEqual([1, 0])
        emulator.undo(1)
        expect(gates()).toEqual([1, 0, 1])
        expect(emulator.peripherals.audio.activity.playingForMs).toBe(Infinity)
    })

    it('plays a Poke into the block, and its Undo', async () => {
        const { emulator, output } = await withSynth(['    nop', '    nop'].join('\n') + '\n', {
            run: false
        })
        await emulator.step()
        expect(emulator.pokeMemory(0xe00110n, Uint8Array.from([1]))).toBe(true)
        expect(synthWrites(output)).toEqual([0x10, 1])
        emulator.undo(1)
        const writes = synthWrites(output)
        expect(writes[writes.indexOf(0x10, 2) + 1]).toBe(0)
    })

    it('plays nothing in a Testcase, whose reads still see the registers', async () => {
        const code = ORG + TONE + trap(9)
        const output = new RecordingAudioOutput()
        const emulator = M68KEmulator(code, { peripherals: { audio: new Audio({ output }) } })
        const results = await emulator.test(
            code,
            [
                {
                    input: [],
                    expectedOutput: '440',
                    startingRegisters: {},
                    expectedRegisters: {},
                    startingMemory: [],
                    expectedMemory: []
                }
            ],
            INSTRUCTION_LIMIT
        )
        expect(results[0]?.errors ?? []).toEqual([])
        expect(results[0]?.passed).toBe(true)
        expect(synthWrites(output)).toEqual([])
    })
})
