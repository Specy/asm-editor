import { beforeEach, describe, expect, it } from 'vitest'
import { Screen } from './Screen'
import { SCREEN_CELL_8X16, SCREEN_CELL_8X8, glyphRows } from './bitmapFont'
import { BLACK, WHITE, rgb } from './color'

const RED = rgb(255, 0, 0)
const GREEN = rgb(0, 255, 0)
const BLUE = rgb(0, 0, 255)

function makeScreen(width = 16, height = 12) {
    return new Screen({
        width,
        height,
        backgroundColor: BLACK,
        penColor: WHITE,
        fillColor: WHITE,
        cell: SCREEN_CELL_8X8
    })
}

/** The visible image as one color per pixel, which is what every expectation below is written in. */
function visibleColors(screen: Screen): number[] {
    const colors: number[] = []
    const pixels = screen.visiblePixels
    for (let offset = 0; offset < pixels.length; offset += 4) {
        colors.push((pixels[offset] << 16) | (pixels[offset + 1] << 8) | pixels[offset + 2])
    }
    return colors
}

function visibleAt(screen: Screen, x: number, y: number): number {
    return visibleColors(screen)[y * screen.width + x]
}

/** The set of points of one color, as "x,y" strings, so an expectation reads like a picture. */
function pointsOf(screen: Screen, color: number): string[] {
    const found: string[] = []
    const colors = visibleColors(screen)
    for (let index = 0; index < colors.length; index++) {
        if (colors[index] === color) {
            found.push(`${index % screen.width},${Math.floor(index / screen.width)}`)
        }
    }
    return found
}

/** Pins one cell against the font table: lit pixels in the pen color, the rest the background. */
function expectGlyph(screen: Screen, x: number, y: number, character: string): void {
    const rows = glyphRows(character.charCodeAt(0), screen.cell.height)
    for (let row = 0; row < rows.length; row++) {
        for (let column = 0; column < screen.cell.width; column++) {
            const lit = (rows[row] & (1 << column)) !== 0
            expect(visibleAt(screen, x + column, y + row)).toBe(lit ? RED : BLACK)
        }
    }
}

describe('Screen primitives', () => {
    let screen: Screen

    beforeEach(() => {
        screen = makeScreen()
    })

    it('starts as one background-colored image with the pen at the origin', () => {
        expect(screen.getSize()).toEqual({ width: 16, height: 12 })
        expect(visibleColors(screen).every((color) => color === BLACK)).toBe(true)
        expect([screen.penX, screen.penY, screen.cursorColumn, screen.cursorRow]).toEqual([
            0, 0, 0, 0
        ])
        expect(screen.doubleBuffering).toBe(false)
    })

    it('draws one pixel in the pen color and reads it back', () => {
        screen.setPenColor(RED)
        screen.drawPixel(3, 4)
        expect(pointsOf(screen, RED)).toEqual(['3,4'])
        expect(screen.getPixel(3, 4)).toBe(RED)
        expect(screen.getPixel(4, 4)).toBe(BLACK)
    })

    it('clips a pixel outside the Screen instead of failing', () => {
        screen.setPenColor(RED)
        screen.drawPixel(-1, 4)
        screen.drawPixel(16, 4)
        screen.drawPixel(3, 12)
        expect(pointsOf(screen, RED)).toEqual([])
        //a read outside answers with the background, the color a bigger Screen would have there
        expect(screen.getPixel(-1, 0)).toBe(BLACK)
        expect(screen.getPixel(0, 12)).toBe(BLACK)
    })

    it('ignores the pen width for a single pixel, as GDI SetPixel does', () => {
        screen.setPenWidth(3)
        screen.setPenColor(RED)
        screen.drawPixel(5, 5)
        expect(pointsOf(screen, RED)).toEqual(['5,5'])
    })

    it('draws horizontal, vertical and diagonal lines including both endpoints', () => {
        screen.setPenColor(RED)
        screen.drawLine(1, 1, 4, 1)
        expect(pointsOf(screen, RED)).toEqual(['1,1', '2,1', '3,1', '4,1'])

        screen = makeScreen()
        screen.setPenColor(GREEN)
        screen.drawLine(2, 0, 2, 3)
        expect(pointsOf(screen, GREEN)).toEqual(['2,0', '2,1', '2,2', '2,3'])

        screen = makeScreen()
        screen.setPenColor(BLUE)
        screen.drawLine(0, 0, 3, 3)
        expect(pointsOf(screen, BLUE)).toEqual(['0,0', '1,1', '2,2', '3,3'])
    })

    it('moves the drawing position with every line and with move-to', () => {
        screen.setPenColor(RED)
        screen.moveTo(1, 1)
        screen.lineTo(1, 3)
        expect([screen.penX, screen.penY]).toEqual([1, 3])
        screen.lineTo(3, 3)
        expect(pointsOf(screen, RED)).toEqual(['1,1', '1,2', '1,3', '2,3', '3,3'])
        expect([screen.penX, screen.penY]).toEqual([3, 3])
    })

    it('stamps a wide pen centered on the path', () => {
        screen.setPenWidth(3)
        screen.setPenColor(RED)
        screen.drawLine(5, 5, 5, 5)
        expect(pointsOf(screen, RED)).toEqual([
            '4,4',
            '5,4',
            '6,4',
            '4,5',
            '5,5',
            '6,5',
            '4,6',
            '5,6',
            '6,6'
        ])
    })

    it('excludes the right and bottom edges of a filled rectangle', () => {
        //EASy68K draws through the Windows GDI `Rectangle`, which "extends up to, but does not
        //include, the right and bottom coordinates"; its examples only line up pixel for pixel if
        //this does the same (ADR 0003)
        screen.setPenColor(RED)
        screen.setFillColor(GREEN)
        screen.drawRectangle(2, 2, 6, 5)
        expect(visibleAt(screen, 5, 4)).toBe(RED)
        expect(visibleAt(screen, 6, 4)).toBe(BLACK)
        expect(visibleAt(screen, 4, 4)).toBe(RED)
        expect(visibleAt(screen, 4, 5)).toBe(BLACK)
        expect(visibleAt(screen, 3, 3)).toBe(GREEN)
        expect(pointsOf(screen, GREEN)).toEqual(['3,3', '4,3'])
    })

    it('draws an unfilled rectangle as its border only, with the same excluded edges', () => {
        screen.setPenColor(RED)
        screen.setFillColor(GREEN)
        screen.drawUnfilledRectangle(2, 2, 6, 5)
        expect(pointsOf(screen, GREEN)).toEqual([])
        expect(pointsOf(screen, RED)).toEqual([
            '2,2',
            '3,2',
            '4,2',
            '5,2',
            '2,3',
            '5,3',
            '2,4',
            '3,4',
            '4,4',
            '5,4'
        ])
    })

    it('draws nothing for a rectangle whose edges meet, as GDI does', () => {
        screen.setPenColor(RED)
        screen.setFillColor(GREEN)
        screen.drawRectangle(4, 4, 4, 8)
        screen.drawRectangle(4, 4, 8, 4)
        expect(pointsOf(screen, RED)).toEqual([])
        expect(pointsOf(screen, GREEN)).toEqual([])
    })

    it('normalizes a rectangle given from its far corner', () => {
        screen.setPenColor(RED)
        screen.drawUnfilledRectangle(6, 5, 2, 2)
        expect(pointsOf(screen, RED)).toEqual(
            (() => {
                const other = makeScreen()
                other.setPenColor(RED)
                other.drawUnfilledRectangle(2, 2, 6, 5)
                return pointsOf(other, RED)
            })()
        )
    })

    it('inscribes an ellipse in the same excluded-edge rectangle', () => {
        screen.setPenColor(RED)
        screen.setFillColor(GREEN)
        screen.drawEllipse(2, 2, 8, 8)
        //the bounding box is 6 by 6 over columns 2 to 7: nothing is drawn on column 8 or row 8
        expect(pointsOf(screen, RED).some((point) => point.startsWith('8,'))).toBe(false)
        expect(pointsOf(screen, RED).some((point) => point.endsWith(',8'))).toBe(false)
        expect(visibleAt(screen, 4, 2)).toBe(RED)
        expect(visibleAt(screen, 2, 4)).toBe(RED)
        expect(visibleAt(screen, 5, 5)).toBe(GREEN)
        //the corners of the bounding box stay outside the ellipse
        expect(visibleAt(screen, 2, 2)).toBe(BLACK)
        expect(visibleAt(screen, 7, 7)).toBe(BLACK)
    })

    it('draws an unfilled ellipse as its border only', () => {
        screen.setPenColor(RED)
        screen.setFillColor(GREEN)
        screen.drawUnfilledEllipse(2, 2, 8, 8)
        expect(pointsOf(screen, GREEN)).toEqual([])
        expect(visibleAt(screen, 4, 2)).toBe(RED)
        //the middle of an unfilled ellipse is untouched
        expect(visibleAt(screen, 4, 4)).toBe(BLACK)
        expect(visibleAt(screen, 5, 5)).toBe(BLACK)
    })

    it('floods the connected area of the color under the starting point', () => {
        screen.setPenColor(RED)
        screen.drawUnfilledRectangle(1, 1, 6, 6)
        screen.setFillColor(GREEN)
        screen.floodFill(3, 3)
        expect(visibleAt(screen, 3, 3)).toBe(GREEN)
        expect(visibleAt(screen, 4, 4)).toBe(GREEN)
        //the border stops it, so the pixels outside the rectangle keep the background
        expect(visibleAt(screen, 0, 0)).toBe(BLACK)
        expect(visibleAt(screen, 1, 1)).toBe(RED)
    })

    it('does not spread when the area already has the fill color', () => {
        screen.setFillColor(BLACK)
        screen.floodFill(3, 3)
        expect(pointsOf(screen, BLACK).length).toBe(16 * 12)
    })

    it('clears to the background color and homes the text cursor', () => {
        screen.setPenColor(RED)
        screen.drawPixel(1, 1)
        screen.setCursor(3, 2)
        screen.clear()
        expect(pointsOf(screen, RED)).toEqual([])
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 0])
    })

    it('clears to a color the caller names', () => {
        screen.clear(BLUE)
        expect(visibleColors(screen).every((color) => color === BLUE)).toBe(true)
    })

    it('resizes to an empty image of the new size and clamps the cursor', () => {
        screen.setCursor(1, 1)
        screen.setPenColor(RED)
        screen.drawPixel(1, 1)
        screen.resize(8, 8)
        expect(screen.getSize()).toEqual({ width: 8, height: 8 })
        expect(screen.visiblePixels.length).toBe(8 * 8 * 4)
        expect(pointsOf(screen, RED)).toEqual([])
        expect([screen.columns, screen.rows]).toEqual([1, 1])
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 0])
    })
})

describe('Screen buffering', () => {
    it('keeps drawing off screen until it is presented', () => {
        const screen = makeScreen()
        screen.setDoubleBuffering(true)
        screen.setPenColor(RED)
        screen.drawPixel(2, 2)
        expect(pointsOf(screen, RED)).toEqual([])
        expect(screen.getPixel(2, 2)).toBe(RED)
        screen.present()
        expect(pointsOf(screen, RED)).toEqual(['2,2'])
    })

    it('starts the off-screen image from what is already visible', () => {
        const screen = makeScreen()
        screen.setPenColor(RED)
        screen.drawPixel(1, 1)
        screen.setDoubleBuffering(true)
        expect(screen.getPixel(1, 1)).toBe(RED)
    })

    it('drops the off-screen image when buffering is turned off', () => {
        const screen = makeScreen()
        screen.setDoubleBuffering(true)
        screen.setPenColor(RED)
        screen.drawPixel(2, 2)
        screen.setDoubleBuffering(false)
        expect(pointsOf(screen, RED)).toEqual([])
        expect(screen.getPixel(2, 2)).toBe(BLACK)
    })
})

describe('Screen renderer signals', () => {
    it('bumps the version and the dirty flag only when the visible image changes', () => {
        const screen = makeScreen()
        screen.markPainted()
        expect(screen.dirty).toBe(false)

        screen.setPenColor(RED)
        expect(screen.dirty).toBe(false)
        expect(screen.version).toBe(0)

        screen.drawPixel(1, 1)
        expect(screen.dirty).toBe(true)
        expect(screen.version).toBe(1)

        screen.markPainted()
        screen.setDoubleBuffering(true)
        screen.drawPixel(2, 2)
        //the machine never waits for a frame, and a frame it cannot see yet is not one to paint
        expect(screen.dirty).toBe(false)
        screen.present()
        expect(screen.dirty).toBe(true)
    })

    it('asks for a repaint when a program presents without double buffering', () => {
        const screen = makeScreen()
        screen.markPainted()
        const version = screen.version
        screen.present()
        expect(screen.dirty).toBe(true)
        expect(screen.version).toBe(version + 1)
    })
})

describe('Screen text', () => {
    it('draws a glyph at a pixel position in the pen color, leaving the rest of the cell alone', () => {
        const screen = makeScreen()
        screen.setPenColor(GREEN)
        screen.setFillColor(GREEN)
        screen.drawRectangle(0, 0, 16, 12)
        screen.setPenColor(RED)
        screen.drawText(0, 0, 'A')
        const rows = glyphRows(0x41, 8)
        for (let row = 0; row < 8; row++) {
            for (let column = 0; column < 8; column++) {
                const lit = (rows[row] & (1 << column)) !== 0
                //the background of the cell is whatever was already drawn there, not the Screen's
                expect(visibleAt(screen, column, row)).toBe(lit ? RED : GREEN)
            }
        }
    })

    it('paints an opaque cell when writing at the text cursor', () => {
        const screen = makeScreen()
        screen.setFillColor(GREEN)
        screen.drawRectangle(0, 0, 16, 12)
        screen.setPenColor(RED)
        screen.writeText('A')
        const rows = glyphRows(0x41, 8)
        for (let row = 0; row < 8; row++) {
            for (let column = 0; column < 8; column++) {
                const lit = (rows[row] & (1 << column)) !== 0
                expect(visibleAt(screen, column, row)).toBe(lit ? RED : BLACK)
            }
        }
    })

    it('advances the cursor one cell per character and wraps at the right edge', () => {
        const screen = makeScreen(16, 24)
        expect([screen.columns, screen.rows]).toEqual([2, 3])
        screen.writeText('a')
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([1, 0])
        screen.writeText('b')
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 1])
        screen.writeText('c')
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([1, 1])
    })

    it('returns to the first column on a carriage return and to the next line on a line feed', () => {
        const screen = makeScreen(16, 24)
        screen.writeText('a\r')
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 0])
        screen.writeText('a\n')
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 1])
    })

    it('scrolls the whole image up one cell row at the bottom, graphics included', () => {
        const screen = makeScreen(16, 16)
        expect(screen.rows).toBe(2)
        screen.setPenColor(RED)
        screen.drawPixel(15, 9)
        screen.writeText('\n\n')
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 1])
        //the pixel moved up by one cell row with the text
        expect(pointsOf(screen, RED)).toEqual(['15,1'])
        //and the row the scroll freed is background, not a copy of the old bottom row
        expect(visibleAt(screen, 15, 9)).toBe(BLACK)
    })

    it('scrolls when the last cell of the last row wraps', () => {
        //two columns by two rows: the fourth character fills the last cell and the wrap scrolls
        const screen = makeScreen(16, 16)
        screen.setPenColor(RED)
        screen.writeText('abcd')
        expect([screen.cursorColumn, screen.cursorRow]).toEqual([0, 1])
        expectGlyph(screen, 0, 0, 'c')
        expectGlyph(screen, 8, 0, 'd')
        for (let y = 8; y < 16; y++) {
            for (let x = 0; x < 16; x++) expect(visibleAt(screen, x, y)).toBe(BLACK)
        }
    })

    it('draws a blank cell for a character the font has no shape for', () => {
        const screen = makeScreen()
        screen.setFillColor(GREEN)
        screen.drawRectangle(0, 0, 16, 12)
        screen.writeText('é')
        expect(visibleAt(screen, 0, 0)).toBe(BLACK)
        expect(screen.cursorColumn).toBe(1)
    })

    it('uses the cell size it was given, so the same text fills a different grid', () => {
        const screen = new Screen({ width: 64, height: 32, cell: SCREEN_CELL_8X16 })
        expect([screen.columns, screen.rows]).toEqual([8, 2])
        screen.setCell(SCREEN_CELL_8X8)
        expect([screen.columns, screen.rows]).toEqual([8, 4])
    })
})

describe('Screen framebuffer mode', () => {
    it('maps one word per logical pixel, taking the low 24 bits as the color', () => {
        const screen = makeScreen()
        screen.useFramebuffer(4, 2)
        expect(screen.getSize()).toEqual({ width: 4, height: 2 })
        const words = new Uint32Array(8)
        words[0] = 0xff0000
        words[5] = 0xff00ff00
        screen.syncFramebuffer(words)
        expect(visibleAt(screen, 0, 0)).toBe(RED)
        expect(visibleAt(screen, 1, 1)).toBe(GREEN)
        expect(visibleAt(screen, 1, 0)).toBe(BLACK)
    })

    it('re-reads only the range a memory observer reported dirty', () => {
        const screen = makeScreen()
        screen.useFramebuffer(4, 2)
        const words = new Uint32Array(8).fill(0xff0000)
        screen.syncFramebuffer(words, 2, 4)
        expect(pointsOf(screen, RED)).toEqual(['2,0', '3,0'])
    })

    it('journals nothing, because the Core rollback restores the pixels', () => {
        const screen = makeScreen()
        screen.useFramebuffer(4, 2)
        screen.syncFramebuffer(new Uint32Array(8).fill(0xff0000))
        screen.setPenColor(BLUE)
        screen.drawPixel(0, 0)
        expect(screen.canUndo()).toBe(false)
        expect(screen.history.depth).toBe(0)
    })

    it('goes back to journaling when drawing mode is restored', () => {
        const screen = makeScreen()
        screen.useFramebuffer(4, 2)
        screen.useDrawing()
        expect(screen.framebuffer).toBe(null)
        screen.drawPixel(0, 0)
        expect(screen.canUndo()).toBe(true)
    })
})

describe('Screen reset', () => {
    it('goes back to the state it was constructed with and forgets the history', () => {
        const screen = makeScreen()
        screen.setPenColor(RED)
        screen.setFillColor(RED)
        screen.setPenWidth(4)
        screen.setDoubleBuffering(true)
        screen.setCursor(1, 1)
        screen.moveTo(3, 3)
        screen.drawPixel(2, 2)
        screen.resize(32, 32)
        screen.reset()
        expect(screen.getSize()).toEqual({ width: 16, height: 12 })
        expect(screen.penColor).toBe(WHITE)
        expect(screen.fillColor).toBe(WHITE)
        expect(screen.penWidth).toBe(1)
        expect(screen.doubleBuffering).toBe(false)
        expect([screen.penX, screen.penY, screen.cursorColumn, screen.cursorRow]).toEqual([
            0, 0, 0, 0
        ])
        expect(visibleColors(screen).every((color) => color === BLACK)).toBe(true)
        expect(screen.canUndo()).toBe(false)
    })
})
