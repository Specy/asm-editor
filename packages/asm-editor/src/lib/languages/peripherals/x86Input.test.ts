import { describe, expect, it } from 'vite-plus/test'
import {
    ABS_X,
    ABS_Y,
    BTN_LEFT,
    BTN_MIDDLE,
    BTN_RIGHT,
    EV_ABS,
    EV_KEY,
    EV_REL,
    REL_WHEEL,
    tabletAxis,
    wheelNotches,
    X86Input,
    type X86InputDeviceId,
    type X86InputEvent
} from './x86Input'
import { LINUX_KEY } from './linuxKeyCodes'

function connected(width = 320, height = 240) {
    const size = { width, height }
    const input = new X86Input({ screen: { getSize: () => size } })
    const reports: [X86InputDeviceId, X86InputEvent[]][] = []
    input.setSink((device, events) => reports.push([device, events]))
    return { input, reports, size }
}

const key = (code: number, value: number) => ({ type: EV_KEY, code, value })

describe('keys', () => {
    it('reports a key down, the browser repeats and the key up, by physical key', () => {
        const { input, reports } = connected()
        input.keyDown({ code: 'KeyA' })
        input.keyDown({ code: 'KeyA' })
        input.keyDown({ code: 'KeyA' })
        input.keyUp({ code: 'KeyA' })
        expect(reports).toEqual([
            ['keyboard', [key(LINUX_KEY.A, 1)]],
            ['keyboard', [key(LINUX_KEY.A, 2)]],
            ['keyboard', [key(LINUX_KEY.A, 2)]],
            ['keyboard', [key(LINUX_KEY.A, 0)]]
        ])
    })

    it('keeps left and right modifiers apart', () => {
        const { input, reports } = connected()
        input.keyDown({ code: 'ShiftLeft' })
        input.keyDown({ code: 'ShiftRight' })
        input.keyUp({ code: 'ShiftLeft' })
        expect(reports.map(([, events]) => events[0])).toEqual([
            key(LINUX_KEY.LEFTSHIFT, 1),
            key(LINUX_KEY.RIGHTSHIFT, 1),
            key(LINUX_KEY.LEFTSHIFT, 0)
        ])
    })

    it('sends nothing for a key it has no code for or that never went down', () => {
        const { input, reports } = connected()
        input.keyDown({ code: 'Unidentified' })
        input.keyUp({ code: 'KeyB' })
        expect(reports).toEqual([])
    })
})

describe('the pointer', () => {
    it('scales the pixel under the pointer over the whole Screen to 0..32767 as QEMU does', () => {
        expect(tabletAxis(0, 320)).toBe(0)
        expect(tabletAxis(160, 320)).toBe(16383)
        //QEMU hands the tablet whole pixels, so anywhere on a zoomed pixel is that pixel
        expect(tabletAxis(160.5, 320)).toBe(16383)
        expect(tabletAxis(160.999, 320)).toBe(16383)
        expect(tabletAxis(319.999, 320)).toBe(Math.floor((319 * 32767) / 320))
    })

    it("gives back the pointer's pixel through the conversion the documentation teaches", () => {
        //(value × size + 32766) ÷ 32767, with the division dropping the remainder
        const pixelOf = (value: number, size: number) => Math.floor((value * size + 32766) / 32767)
        for (const size of [8, 240, 320, 1024]) {
            for (let pixel = 0; pixel < size; pixel++) {
                for (const fraction of [0, 0.01, 0.5, 0.99]) {
                    expect(pixelOf(tabletAxis(pixel + fraction, size), size)).toBe(pixel)
                }
            }
        }
    })

    it('clamps a position past an edge to the edge, so a drag pins that axis', () => {
        const last = Math.floor((319 * 32767) / 320)
        expect(tabletAxis(-12, 320)).toBe(0)
        expect(tabletAxis(320, 320)).toBe(last)
        expect(tabletAxis(5000, 320)).toBe(last)
        expect(tabletAxis(Number.NaN, 320)).toBe(0)
    })

    it('reports only the axes that changed, and no report for a move within a pixel', () => {
        const { input, reports } = connected()
        input.moveTo(160, 120)
        input.moveTo(160, 60)
        input.moveTo(160.7, 60.2)
        expect(reports).toEqual([
            [
                'tablet',
                [
                    { type: EV_ABS, code: ABS_X, value: 16383 },
                    { type: EV_ABS, code: ABS_Y, value: 16383 }
                ]
            ],
            ['tablet', [{ type: EV_ABS, code: ABS_Y, value: Math.floor((60 * 32767) / 240) }]]
        ])
    })

    it('spans whatever size the Screen has now', () => {
        const { input, reports, size } = connected()
        size.width = 640
        input.moveTo(320, 0)
        expect(reports[0][1][0]).toEqual({ type: EV_ABS, code: ABS_X, value: 16383 })
    })

    it('moves to a button before reporting it, and reports each button once', () => {
        const { input, reports } = connected()
        input.moveTo(0, 0)
        reports.length = 0
        input.buttonDown('left', 160, 0)
        input.buttonDown('left', 160, 0)
        input.buttonDown('right')
        input.buttonUp('left')
        input.buttonUp('middle')
        expect(reports).toEqual([
            ['tablet', [{ type: EV_ABS, code: ABS_X, value: 16383 }]],
            ['tablet', [key(BTN_LEFT, 1)]],
            ['tablet', [key(BTN_RIGHT, 1)]],
            ['tablet', [key(BTN_LEFT, 0)]]
        ])
        expect(BTN_MIDDLE).toBe(0x112)
    })
})

describe('the wheel', () => {
    it('counts each event a notch at least, and the notches a large delta turns', () => {
        expect(wheelNotches({ deltaY: 100, deltaMode: 0 })).toBe(-1)
        expect(wheelNotches({ deltaY: -53, deltaMode: 0 })).toBe(1)
        expect(wheelNotches({ deltaY: 4, deltaMode: 0 })).toBe(-1)
        expect(wheelNotches({ deltaY: 300, deltaMode: 0 })).toBe(-3)
        expect(wheelNotches({ deltaY: -3, deltaMode: 1 })).toBe(1)
        expect(wheelNotches({ deltaY: 6, deltaMode: 1 })).toBe(-2)
        expect(wheelNotches({ deltaY: 100, deltaMode: 2 })).toBe(-8)
        expect(wheelNotches({ deltaY: 0, deltaMode: 0 })).toBe(0)
    })

    it('reports REL_WHEEL +1 a notch away from the user and -1 towards', () => {
        const { input, reports } = connected()
        input.wheel({ deltaY: -100, deltaMode: 0 })
        input.wheel({ deltaY: 200, deltaMode: 0 })
        expect(reports).toEqual([
            ['tablet', [{ type: EV_REL, code: REL_WHEEL, value: 1 }]],
            ['tablet', [{ type: EV_REL, code: REL_WHEEL, value: -1 }]],
            ['tablet', [{ type: EV_REL, code: REL_WHEEL, value: -1 }]]
        ])
    })
})

describe('focus loss and the sink', () => {
    it('lifts every held key and button with its own up event', () => {
        const { input, reports } = connected()
        input.keyDown({ code: 'KeyW' })
        input.keyDown({ code: 'ControlRight' })
        input.buttonDown('middle')
        reports.length = 0
        input.releaseAll()
        expect(reports).toEqual([
            ['keyboard', [key(LINUX_KEY.W, 0)]],
            ['keyboard', [key(LINUX_KEY.RIGHTCTRL, 0)]],
            ['tablet', [key(BTN_MIDDLE, 0)]]
        ])
        input.releaseAll()
        expect(reports).toHaveLength(3)
    })

    it('sends and tracks nothing without a sink, so a held key goes down at its next repeat', () => {
        const input = new X86Input({ screen: { getSize: () => ({ width: 320, height: 240 }) } })
        input.keyDown({ code: 'KeyD' })
        input.moveTo(10, 10)
        input.buttonDown('left')
        input.wheel({ deltaY: 100, deltaMode: 0 })
        input.releaseAll()
        const reports: X86InputEvent[][] = []
        input.setSink((_, events) => reports.push(events))
        input.keyDown({ code: 'KeyD' })
        expect(reports).toEqual([[key(LINUX_KEY.D, 1)]])
    })

    it('forgets what was held and where the pointer was at a reset, sending nothing', () => {
        const { input, reports } = connected()
        input.keyDown({ code: 'KeyS' })
        input.moveTo(10, 10)
        reports.length = 0
        input.reset()
        input.keyUp({ code: 'KeyS' })
        input.releaseAll()
        expect(reports).toEqual([])
        //a reader that starts afresh is told where the pointer is, even where it was before
        input.moveTo(10, 10)
        expect(reports).toHaveLength(1)
        expect(reports[0][1]).toHaveLength(2)
    })
})
