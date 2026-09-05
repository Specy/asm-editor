import { describe, expect, it } from 'vitest'
import { Screen } from './Screen'
import { RECORD_OVERHEAD_BYTES, ScreenHistory } from './ScreenHistory'
import { SCREEN_CELL_8X16, SCREEN_CELL_8X8 } from './bitmapFont'
import { BLACK, WHITE, rgb } from './color'

const RED = rgb(255, 0, 0)
const GREEN = rgb(0, 255, 0)
const BLUE = rgb(0, 0, 255)

function makeScreen(historyByteBudget?: number) {
    return new Screen({
        width: 16,
        height: 16,
        backgroundColor: BLACK,
        penColor: WHITE,
        fillColor: WHITE,
        cell: SCREEN_CELL_8X8,
        historyByteBudget
    })
}

/** Everything Undo has to bring back: both images and every program-visible field (ADR 0005). */
function snapshot(screen: Screen) {
    return {
        visible: Array.from(screen.visiblePixels),
        drawing: Array.from(screen.drawingPixels),
        width: screen.width,
        height: screen.height,
        penColor: screen.penColor,
        fillColor: screen.fillColor,
        backgroundColor: screen.backgroundColor,
        penWidth: screen.penWidth,
        penX: screen.penX,
        penY: screen.penY,
        cursorColumn: screen.cursorColumn,
        cursorRow: screen.cursorRow,
        cell: { width: screen.cell.width, height: screen.cell.height },
        doubleBuffering: screen.doubleBuffering
    }
}

/**
 * Runs a list of operations, keeping the state each one started from, then undoes them one by one
 * and checks that every step lands back exactly where it was. One test per operation would pin the
 * same thing, but this also pins that records replay in the right order.
 */
function expectExactRewind(operations: ((screen: Screen) => void)[]): void {
    const screen = makeScreen()
    const before: ReturnType<typeof snapshot>[] = []
    for (const operation of operations) {
        before.push(snapshot(screen))
        operation(screen)
    }
    for (let index = operations.length - 1; index >= 0; index--) {
        expect(screen.canUndo()).toBe(true)
        expect(screen.undo()).toBe(true)
        expect(snapshot(screen)).toEqual(before[index])
    }
    expect(screen.canUndo()).toBe(false)
    expect(screen.undo()).toBe(false)
}

describe('Screen undo', () => {
    it('restores the settings an operation changed', () => {
        expectExactRewind([
            (screen) => screen.setPenColor(RED),
            (screen) => screen.setFillColor(GREEN),
            (screen) => screen.setBackgroundColor(BLUE),
            (screen) => screen.setPenWidth(3),
            (screen) => screen.moveTo(4, 5),
            (screen) => screen.setCursor(1, 1),
            (screen) => screen.setCell(SCREEN_CELL_8X16)
        ])
    })

    it('restores the pixels of every drawing primitive', () => {
        expectExactRewind([
            (screen) => screen.setPenColor(RED),
            (screen) => screen.setFillColor(GREEN),
            (screen) => screen.drawPixel(2, 2),
            (screen) => screen.drawLine(0, 0, 15, 15),
            (screen) => screen.lineTo(0, 15),
            (screen) => screen.setPenWidth(3),
            (screen) => screen.drawLine(4, 4, 12, 4),
            (screen) => screen.setPenWidth(1),
            (screen) => screen.drawRectangle(1, 1, 9, 9),
            (screen) => screen.drawUnfilledRectangle(2, 2, 8, 8),
            (screen) => screen.drawEllipse(3, 3, 13, 13),
            (screen) => screen.drawUnfilledEllipse(4, 4, 12, 12),
            (screen) => screen.drawText(0, 8, 'hi'),
            (screen) => screen.floodFill(0, 0)
        ])
    })

    it('restores the image a clear wiped, and the cursor it homed', () => {
        expectExactRewind([
            (screen) => screen.setPenColor(RED),
            (screen) => screen.drawLine(0, 0, 15, 15),
            (screen) => screen.setCursor(1, 1),
            (screen) => screen.clear(),
            (screen) => screen.clear(BLUE)
        ])
    })

    it('restores both images across a resize', () => {
        expectExactRewind([
            (screen) => screen.setPenColor(RED),
            (screen) => screen.drawRectangle(0, 0, 8, 8),
            (screen) => screen.resize(32, 24),
            (screen) => screen.drawPixel(20, 20),
            (screen) => screen.resize(4, 4)
        ])
    })

    it('restores the visible image a present replaced', () => {
        expectExactRewind([
            (screen) => screen.setPenColor(RED),
            (screen) => screen.drawPixel(1, 1),
            (screen) => screen.setDoubleBuffering(true),
            (screen) => screen.drawPixel(2, 2),
            (screen) => screen.present(),
            (screen) => screen.drawPixel(3, 3),
            (screen) => screen.present(),
            (screen) => screen.setDoubleBuffering(false)
        ])
    })

    it('separates the two images again when a buffered state is restored', () => {
        const screen = makeScreen()
        screen.setDoubleBuffering(true)
        screen.setPenColor(RED)
        screen.drawPixel(2, 2)
        screen.setDoubleBuffering(false)
        expect(screen.undo()).toBe(true)
        expect(screen.doubleBuffering).toBe(true)
        //the off-screen image is a separate array again, so drawing does not show through
        screen.drawPixel(4, 4)
        expect(screen.getPixel(4, 4)).toBe(RED)
        expect(screen.visiblePixels[(4 * 16 + 4) * 4]).toBe(0)
    })

    it('restores the whole image a scrolled text run moved', () => {
        expectExactRewind([
            (screen) => screen.setPenColor(RED),
            (screen) => screen.drawPixel(15, 15),
            (screen) => screen.writeText('ab'),
            (screen) => screen.writeText('cd'),
            (screen) => screen.writeText('\n'),
            (screen) => screen.writeText('e\r'),
            (screen) => screen.writeText('long enough to wrap twice')
        ])
    })

    it('rewinds a run of operations to a sequence noted before it', () => {
        const screen = makeScreen()
        screen.setPenColor(RED)
        screen.drawPixel(1, 1)
        const mark = screen.history.sequence
        const before = snapshot(screen)
        screen.drawLine(0, 0, 15, 15)
        screen.clear()
        screen.setPenColor(GREEN)
        expect(screen.undoToSequence(mark)).toBe(true)
        expect(snapshot(screen)).toEqual(before)
        expect(screen.history.sequence).toBe(mark)
    })

    it('reports that it cannot rewind past what the budget kept', () => {
        //one pixel record is 4 bytes of pixels plus the record overhead, so this holds two of them
        const screen = makeScreen(2 * (RECORD_OVERHEAD_BYTES + 4))
        screen.drawPixel(1, 1)
        const mark = screen.history.sequence
        screen.drawPixel(2, 2)
        screen.drawPixel(3, 3)
        screen.drawPixel(4, 4)
        expect(screen.undoToSequence(mark - 1)).toBe(false)
        expect(screen.canUndo()).toBe(false)
    })
})

describe('Screen history budget', () => {
    it('counts the pixels it copied plus a fixed overhead per record', () => {
        const screen = makeScreen()
        expect(screen.history.bytes).toBe(0)
        screen.setPenColor(RED)
        expect(screen.history.bytes).toBe(RECORD_OVERHEAD_BYTES)
        screen.drawPixel(1, 1)
        expect(screen.history.bytes).toBe(2 * RECORD_OVERHEAD_BYTES + 4)
        screen.clear()
        expect(screen.history.bytes).toBe(3 * RECORD_OVERHEAD_BYTES + 4 + 16 * 16 * 4)
    })

    it('drops the oldest records once the budget is exceeded', () => {
        const screen = makeScreen(2 * (RECORD_OVERHEAD_BYTES + 4))
        for (let index = 0; index < 5; index++) screen.drawPixel(index, index)
        expect(screen.history.depth).toBe(2)
        expect(screen.history.sequence).toBe(5)
        //the two newest are still exact: the retained records are a suffix, never a hole
        expect(screen.undo()).toBe(true)
        expect(screen.getPixel(4, 4)).toBe(BLACK)
        expect(screen.undo()).toBe(true)
        expect(screen.getPixel(3, 3)).toBe(BLACK)
        expect(screen.getPixel(2, 2)).toBe(WHITE)
        expect(screen.canUndo()).toBe(false)
    })

    it('keeps nothing when a single record is larger than the whole budget', () => {
        //undoing an older record without the newer ones would restore state out of order, so a
        //record that cannot be afforded takes the history with it
        const screen = makeScreen(RECORD_OVERHEAD_BYTES + 8)
        screen.drawPixel(1, 1)
        expect(screen.canUndo()).toBe(true)
        screen.clear()
        expect(screen.canUndo()).toBe(false)
        expect(screen.history.bytes).toBe(0)
        expect(screen.history.sequence).toBe(2)
    })

    it('evicts immediately when the budget setting is lowered', () => {
        const screen = makeScreen()
        for (let index = 0; index < 5; index++) screen.drawPixel(index, index)
        expect(screen.history.depth).toBe(5)
        screen.history.byteBudget = 2 * (RECORD_OVERHEAD_BYTES + 4)
        expect(screen.history.depth).toBe(2)
        expect(screen.history.bytes).toBe(2 * (RECORD_OVERHEAD_BYTES + 4))
    })

    it('never undoes with a budget of zero', () => {
        const screen = makeScreen(0)
        screen.drawPixel(1, 1)
        screen.clear()
        expect(screen.canUndo()).toBe(false)
        expect(screen.undo()).toBe(false)
    })

    it('forgets everything on reset', () => {
        const screen = makeScreen()
        screen.drawPixel(1, 1)
        screen.reset()
        expect(screen.history.depth).toBe(0)
        expect(screen.history.bytes).toBe(0)
        expect(screen.history.sequence).toBe(0)
    })
})

describe('ScreenHistory on its own', () => {
    const record = (bytes: number) => ({
        state: {
            width: 1,
            height: 1,
            penColor: 0,
            fillColor: 0,
            backgroundColor: 0,
            penWidth: 1,
            penX: 0,
            penY: 0,
            cursorColumn: 0,
            cursorRow: 0,
            cellWidth: 8,
            cellHeight: 8,
            doubleBuffering: false
        },
        pixels: {
            kind: 'patch' as const,
            target: 'drawing' as const,
            x: 0,
            y: 0,
            width: bytes / 4,
            height: 1,
            pixels: new Uint8ClampedArray(bytes)
        }
    })

    it('hands records back newest first and keeps its byte count', () => {
        const history = new ScreenHistory(1024)
        history.push(record(8))
        history.push(record(16))
        expect(history.depth).toBe(2)
        expect(history.bytes).toBe(2 * RECORD_OVERHEAD_BYTES + 24)
        expect(history.pop()?.pixels).toMatchObject({ width: 4 })
        expect(history.bytes).toBe(RECORD_OVERHEAD_BYTES + 8)
        expect(history.sequence).toBe(1)
        history.clear()
        expect([history.depth, history.bytes, history.sequence]).toEqual([0, 0, 0])
        expect(history.pop()).toBeUndefined()
    })

    it('treats a negative budget as no history at all', () => {
        const history = new ScreenHistory(-1)
        history.push(record(4))
        expect(history.canUndo()).toBe(false)
        expect(history.byteBudget).toBe(0)
    })
})
