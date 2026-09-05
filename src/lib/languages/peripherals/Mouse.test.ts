import { describe, expect, it } from 'vitest'
import { Keyboard } from './Keyboard'
import { KEY_CODES } from './keyCodes'
import { DEFAULT_DOUBLE_CLICK_INTERVAL_MS, Mouse, MOUSE_EVENT_COUNTER_MODULO } from './Mouse'

/** The Screen the Mouse clamps against, resizable so a mid-run resize can be checked. */
function makeMouse(width = 320, height = 200) {
    const size = { width, height }
    const clock = { time: 0 }
    const keyboard = new Keyboard({ now: () => clock.time })
    const mouse = new Mouse({
        screen: { getSize: () => size },
        keyboard,
        now: () => clock.time
    })
    return { mouse, keyboard, clock, size }
}

describe('coordinates', () => {
    it('reports logical Screen pixels with the drawing origin', () => {
        const { mouse } = makeMouse(320, 200)
        mouse.moveTo(160, 100)
        expect(mouse.state()).toMatchObject({ x: 160, y: 100 })
    })

    it('clamps a drag that left the Screen to the nearest point inside', () => {
        const { mouse } = makeMouse(320, 200)
        mouse.buttonDown('left', 10, 10)
        mouse.moveTo(400, 120)
        //X pins to the last column while Y keeps following the pointer
        expect(mouse.state()).toMatchObject({ x: 319, y: 120 })
        mouse.moveTo(-40, -40)
        expect(mouse.state()).toMatchObject({ x: 0, y: 0 })
    })

    it('keeps the last position inside when the pointer leaves with no button', () => {
        const { mouse } = makeMouse(320, 200)
        mouse.moveTo(200, 150)
        mouse.moveTo(2000, 150)
        expect(mouse.state()).toMatchObject({ x: 319, y: 150 })
    })

    it('asks the Screen for its size at every event, so a resize is honored', () => {
        const { mouse, size } = makeMouse(320, 200)
        mouse.moveTo(300, 190)
        expect(mouse.state()).toMatchObject({ x: 300, y: 190 })
        size.width = 64
        size.height = 64
        mouse.moveTo(300, 190)
        expect(mouse.state()).toMatchObject({ x: 63, y: 63 })
    })

    it('truncates a fractional position to its pixel', () => {
        const { mouse } = makeMouse(320, 200)
        mouse.moveTo(10.9, 20.2)
        expect(mouse.state()).toMatchObject({ x: 10, y: 20 })
    })
})

describe('the three views', () => {
    it('answers with zeroes until the event has happened', () => {
        const { mouse } = makeMouse()
        expect(mouse.lastDown().event).toBe(0)
        expect(mouse.lastUp().event).toBe(0)
        expect(mouse.state()).toMatchObject({
            x: 0,
            y: 0,
            left: false,
            right: false,
            middle: false
        })
    })

    it('keeps each snapshot until the next event of its kind', () => {
        const { mouse } = makeMouse()
        mouse.buttonDown('left', 20, 30)
        mouse.buttonUp('left', 25, 35)
        mouse.moveTo(100, 100)
        //the click is still visible long after the pointer moved on
        expect(mouse.lastDown()).toMatchObject({ x: 20, y: 30, left: true })
        expect(mouse.lastUp()).toMatchObject({ x: 25, y: 35, left: false })
        expect(mouse.state()).toMatchObject({ x: 100, y: 100, left: false })
    })

    it('records every button separately', () => {
        const { mouse } = makeMouse()
        mouse.buttonDown('right', 5, 5)
        expect(mouse.lastDown()).toMatchObject({ right: true, left: false, middle: false })
        mouse.buttonDown('middle')
        expect(mouse.lastDown()).toMatchObject({ right: true, middle: true })
        expect(mouse.isButtonDown('middle')).toBe(true)
    })

    it('samples the modifiers held at the moment of the event', () => {
        const { mouse, keyboard } = makeMouse()
        keyboard.pressKey(KEY_CODES.SHIFT)
        mouse.buttonDown('left', 1, 1)
        keyboard.releaseKey(KEY_CODES.SHIFT)
        keyboard.pressKey(KEY_CODES.ALT)
        mouse.buttonUp('left')
        expect(mouse.lastDown()).toMatchObject({ shift: true, alt: false, ctrl: false })
        expect(mouse.lastUp()).toMatchObject({ shift: false, alt: true, ctrl: false })
    })

    it('reports no modifier when there is no Keyboard', () => {
        const mouse = new Mouse({ screen: { getSize: () => ({ width: 8, height: 8 }) } })
        mouse.buttonDown('left', 1, 1)
        expect(mouse.lastDown()).toMatchObject({ shift: false, alt: false, ctrl: false })
    })
})

describe('the double-click flag', () => {
    it('flags a second press of the same button inside the interval', () => {
        const { mouse, clock } = makeMouse()
        mouse.buttonDown('left', 4, 4)
        mouse.buttonUp('left')
        expect(mouse.lastDown().double).toBe(false)
        clock.time += DEFAULT_DOUBLE_CLICK_INTERVAL_MS - 1
        mouse.buttonDown('left', 4, 4)
        expect(mouse.lastDown().double).toBe(true)
    })

    it('does not flag a slow second press or a different button', () => {
        const { mouse, clock } = makeMouse()
        mouse.buttonDown('left', 4, 4)
        mouse.buttonUp('left')
        clock.time += DEFAULT_DOUBLE_CLICK_INTERVAL_MS + 1
        mouse.buttonDown('left', 4, 4)
        expect(mouse.lastDown().double).toBe(false)
        mouse.buttonUp('left')
        mouse.buttonDown('right', 4, 4)
        expect(mouse.lastDown().double).toBe(false)
    })

    it('never flags a button up', () => {
        const { mouse } = makeMouse()
        mouse.buttonDown('left', 4, 4)
        mouse.buttonUp('left')
        mouse.buttonDown('left', 4, 4)
        mouse.buttonUp('left')
        expect(mouse.lastDown().double).toBe(true)
        expect(mouse.lastUp().double).toBe(false)
    })
})

describe('the event counter', () => {
    it('counts moves and button events, and rides on every snapshot', () => {
        const { mouse } = makeMouse()
        mouse.moveTo(1, 1)
        expect(mouse.eventCount).toBe(1)
        mouse.buttonDown('left')
        expect(mouse.lastDown().event).toBe(2)
        mouse.buttonUp('left')
        expect(mouse.lastUp().event).toBe(3)
    })

    it('does not count a move that stays on the same pixel', () => {
        const { mouse } = makeMouse()
        mouse.moveTo(5, 5)
        mouse.moveTo(5.5, 5.5)
        mouse.moveTo(1000, 5)
        mouse.moveTo(2000, 5)
        //dragging further past the edge is not a new position, so it is not a new event
        expect(mouse.eventCount).toBe(2)
    })

    it('wraps at 256 so it fits the byte a Z80 port reads', () => {
        const { mouse } = makeMouse(2000, 2000)
        for (let step = 1; step <= MOUSE_EVENT_COUNTER_MODULO + 3; step++) mouse.moveTo(step, 0)
        expect(mouse.eventCount).toBe(3)
    })
})

describe('lifecycle', () => {
    it('releases every held button when the browser window loses focus', () => {
        const { mouse } = makeMouse()
        mouse.buttonDown('left', 7, 7)
        mouse.buttonDown('right', 7, 7)
        mouse.releaseAll()
        expect(mouse.state()).toMatchObject({ left: false, right: false, middle: false })
        //the release is a real event, so a program waiting for the button up sees it
        expect(mouse.lastUp()).toMatchObject({ x: 7, y: 7, right: false })
    })

    it('clears everything on reset, the Terminal clear path', () => {
        const { mouse } = makeMouse()
        mouse.buttonDown('left', 9, 9)
        mouse.buttonUp('left')
        mouse.reset()
        expect(mouse.eventCount).toBe(0)
        expect(mouse.lastDown().event).toBe(0)
        expect(mouse.lastUp().event).toBe(0)
        expect(mouse.state()).toMatchObject({ x: 0, y: 0, left: false })
    })
})
