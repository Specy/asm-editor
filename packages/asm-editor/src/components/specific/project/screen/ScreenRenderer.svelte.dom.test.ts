/**
 * The Screen panel's x86 mode ([x86 devices](../../../../../../../docs/design/x86-devices.md), "The
 * keyboard device" and "The pointer"): keys and the pointer go to x86's input devices as Linux
 * input events instead of to the Keyboard and Mouse, the focused Screen keeps the wheel from
 * scrolling the page, focus loss lifts what is held, and the focus hint says where the input goes.
 * On every Target Escape is the program's and Shift+Tab gives the keyboard back
 * ([ADR 0008](../../../../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md), 2026-11-03).
 * jsdom lays nothing out, so the canvas is given the box it would have at twice its size.
 */
import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ScreenRenderer from './ScreenRenderer.svelte'
import { createInjectedPeripherals } from '#lib/languages/peripherals/peripheralSet.ts'
import {
    ABS_X,
    BTN_EXTRA,
    BTN_SIDE,
    EV_ABS,
    EV_KEY,
    EV_REL,
    REL_WHEEL,
    type X86InputDeviceId,
    type X86InputEvent
} from '#lib/languages/peripherals/x86Input.ts'
import { LINUX_KEY } from '#lib/languages/peripherals/linuxKeyCodes.ts'

beforeEach(() => {
    //jsdom has no canvas, no pointer capture and no layout
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null)
    HTMLElement.prototype.setPointerCapture ??= function () {}
    HTMLElement.prototype.releasePointerCapture ??= function () {}
    HTMLElement.prototype.hasPointerCapture ??= () => false
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
})

const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
})

function panel({ x86 = true, waitingFor }: { x86?: boolean; waitingFor?: string } = {}) {
    const peripherals = createInjectedPeripherals(x86 ? 'X86' : 'M68K')
    const reports: [X86InputDeviceId, X86InputEvent[]][] = []
    peripherals.x86Input.setSink((device, events) => {
        reports.push([device, events])
        return true
    })
    const target = document.createElement('div')
    document.body.append(target)
    const app = mount(ScreenRenderer, {
        target,
        props: {
            screen: peripherals.screen,
            keyboard: peripherals.keyboard,
            mouse: peripherals.mouse,
            x86Input: x86 ? peripherals.x86Input : undefined,
            waitingFor
        }
    })
    flushSync()
    mounted.push(() => unmount(app))
    const canvas = target.querySelector('canvas')!
    const { width, height } = peripherals.screen.getSize()
    canvas.getBoundingClientRect = () =>
        ({ left: 0, top: 0, width: width * 2, height: height * 2 }) as DOMRect
    return { canvas, peripherals, reports }
}

function key(type: 'keydown' | 'keyup', code: string, repeat = false) {
    return new KeyboardEvent(type, { code, key: code, repeat, bubbles: true, cancelable: true })
}

it('sends keys to the input devices and not to the Keyboard on x86', () => {
    const { canvas, peripherals, reports } = panel()
    canvas.focus()
    canvas.dispatchEvent(key('keydown', 'KeyA'))
    canvas.dispatchEvent(key('keydown', 'KeyA', true))
    canvas.dispatchEvent(key('keyup', 'KeyA'))
    expect(reports).toEqual([
        ['keyboard', [{ type: EV_KEY, code: LINUX_KEY.A, value: 1 }]],
        ['keyboard', [{ type: EV_KEY, code: LINUX_KEY.A, value: 2 }]],
        ['keyboard', [{ type: EV_KEY, code: LINUX_KEY.A, value: 0 }]]
    ])
    expect(peripherals.keyboard.hasTypedInput()).toBe(false)
    expect(peripherals.keyboard.lastKeys()).toEqual({ down: 0, up: 0 })
})

it("reports the whole pixel under the pointer, scaled over the whole Screen as QEMU's tablet is", () => {
    const { canvas, reports } = panel()
    //half a Screen pixel to the right of the middle, on a Screen shown at twice its size: pixel 160
    canvas.dispatchEvent(new MouseEvent('pointermove', { clientX: 321, clientY: 0, bubbles: true }))
    expect(reports[0]).toEqual([
        'tablet',
        [
            { type: EV_ABS, code: ABS_X, value: Math.floor((160 * 32767) / 320) },
            expect.objectContaining({ value: 0 })
        ]
    ])
})

it('keeps the wheel from scrolling the page only while the Screen is focused', () => {
    const { canvas, reports } = panel()
    const unfocused = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    canvas.dispatchEvent(unfocused)
    expect(unfocused.defaultPrevented).toBe(false)
    expect(reports).toEqual([])

    canvas.focus()
    const focused = new WheelEvent('wheel', { deltaY: -100, bubbles: true, cancelable: true })
    canvas.dispatchEvent(focused)
    expect(focused.defaultPrevented).toBe(true)
    expect(reports).toEqual([['tablet', [{ type: EV_REL, code: REL_WHEEL, value: 1 }]]])
})

it("hands the back and forward buttons to the program's tablet and keeps them from navigating", () => {
    const { canvas, reports } = panel()
    const pointer = (type: string, button: number) => {
        const event = new MouseEvent(type, { button, bubbles: true, cancelable: true })
        canvas.dispatchEvent(event)
        return event
    }
    //the back button focuses the Screen, as any button does
    pointer('pointerdown', 3)
    expect(document.activeElement).toBe(canvas)
    const released = pointer('pointerup', 3)
    pointer('pointerdown', 4)
    pointer('pointerup', 4)
    expect(reports.filter(([, events]) => events[0].type === EV_KEY)).toEqual([
        ['tablet', [{ type: EV_KEY, code: BTN_SIDE, value: 1 }]],
        ['tablet', [{ type: EV_KEY, code: BTN_SIDE, value: 0 }]],
        ['tablet', [{ type: EV_KEY, code: BTN_EXTRA, value: 1 }]],
        ['tablet', [{ type: EV_KEY, code: BTN_EXTRA, value: 0 }]]
    ])
    //the page goes back or forward on the release, which every event of it keeps from doing
    expect(released.defaultPrevented).toBe(true)
    expect(pointer('mouseup', 3).defaultPrevented).toBe(true)
    expect(pointer('auxclick', 4).defaultPrevented).toBe(true)
    expect(pointer('mousedown', 4).defaultPrevented).toBe(true)
})

it('keeps the back and forward buttons from navigating only while the Screen is focused', () => {
    const { canvas, peripherals } = panel({ x86: false })
    const mouseUp = (button: number) => {
        const event = new MouseEvent('mouseup', { button, bubbles: true, cancelable: true })
        canvas.dispatchEvent(event)
        return event
    }
    expect(mouseUp(3).defaultPrevented).toBe(false)
    canvas.focus()
    expect(mouseUp(3).defaultPrevented).toBe(true)
    expect(mouseUp(0).defaultPrevented).toBe(false)
    //the other Targets' Mouse has three buttons: the history buttons reach no program there
    const before = peripherals.mouse.lastDown()
    canvas.dispatchEvent(
        new MouseEvent('pointerdown', { button: 4, bubbles: true, cancelable: true })
    )
    expect(peripherals.mouse.lastDown()).toEqual(before)
})

it('lifts held keys and buttons when the Screen loses focus', () => {
    const { canvas, reports } = panel()
    canvas.focus()
    canvas.dispatchEvent(key('keydown', 'ShiftRight'))
    canvas.dispatchEvent(
        new MouseEvent('pointerdown', { button: 0, bubbles: true, cancelable: true })
    )
    reports.length = 0
    canvas.blur()
    expect(reports.map(([, events]) => events[0].value)).toEqual([0, 0])
    expect(reports.map(([device]) => device)).toEqual(['keyboard', 'tablet'])
})

it('hands Escape to an x86 program and leaves Shift+Tab to release the Screen', () => {
    const { canvas, reports } = panel()
    const outside = vi.fn()
    window.addEventListener('keydown', outside)
    try {
        canvas.focus()
        const escape = key('keydown', 'Escape')
        canvas.dispatchEvent(escape)
        canvas.dispatchEvent(key('keyup', 'Escape'))
        expect(reports).toEqual([
            ['keyboard', [{ type: EV_KEY, code: LINUX_KEY.ESC, value: 1 }]],
            ['keyboard', [{ type: EV_KEY, code: LINUX_KEY.ESC, value: 0 }]]
        ])
        expect(document.activeElement).toBe(canvas)
        //neither the page's shortcuts nor the floating window's Escape see it
        expect(outside).not.toHaveBeenCalled()

        reports.length = 0
        const back = new KeyboardEvent('keydown', {
            code: 'Tab',
            key: 'Tab',
            shiftKey: true,
            bubbles: true,
            cancelable: true
        })
        canvas.dispatchEvent(back)
        expect(back.defaultPrevented).toBe(false)
        expect(reports).toEqual([])
    } finally {
        window.removeEventListener('keydown', outside)
    }
})

it('hands Escape to the program on every other Target too, as a key and as character 27', () => {
    const { canvas, peripherals } = panel({ x86: false })
    const outside = vi.fn()
    window.addEventListener('keydown', outside)
    try {
        canvas.focus()
        const escape = key('keydown', 'Escape')
        canvas.dispatchEvent(escape)
        canvas.dispatchEvent(key('keyup', 'Escape'))
        expect(document.activeElement).toBe(canvas)
        expect(escape.defaultPrevented).toBe(true)
        //EASy68K's Escape on M68K and in the Port map, BREAK in the TRS-80 matrix, 27 at MARS's
        //receiver, and usage 0x29 at the Input controller, which hears the physical key
        expect(peripherals.keyboard.lastKeys()).toEqual({ down: 0x1b, up: 0x1b })
        expect(peripherals.keyboard.readCharacterCode()).toBe(27)
        //neither the page's shortcuts nor the floating window's Escape see it
        expect(outside).not.toHaveBeenCalled()
    } finally {
        window.removeEventListener('keydown', outside)
    }
})

it('leaves Shift+Tab to release the Screen on every other Target, its Shift reaching the program', () => {
    const { canvas, peripherals } = panel({ x86: false })
    const physical: string[] = []
    peripherals.keyboard.onPhysicalKey((code, down) => physical.push(`${down ? '+' : '-'}${code}`))
    canvas.focus()
    canvas.dispatchEvent(key('keydown', 'ShiftLeft'))
    const back = new KeyboardEvent('keydown', {
        code: 'Tab',
        key: 'Tab',
        shiftKey: true,
        bubbles: true,
        cancelable: true
    })
    canvas.dispatchEvent(back)
    //the browser's own Shift+Tab moves the focus back, which jsdom does not do itself
    expect(back.defaultPrevented).toBe(false)
    expect(peripherals.keyboard.hasTypedInput()).toBe(false)
    canvas.blur()
    expect(physical).toEqual(['+ShiftLeft', '-ShiftLeft'])
    expect(peripherals.keyboard.lastKeys()).toEqual({ down: 0x10, up: 0x10 })
})

it('says where a focused Screen sends its input', () => {
    const { canvas } = panel()
    expect(canvas.title).toBe(
        'Click to send keyboard and mouse input to the program through /dev/input. Type in the Terminal for standard input. Press Shift+Tab to return keyboard focus to the page.'
    )
    const other = panel({ x86: false })
    expect(other.canvas.title).toBe(
        'Click to send keyboard and mouse input to the program. Press Shift+Tab to return keyboard focus to the page.'
    )
})

it('asks to be clicked while the program waits for a key, until it has the keyboard', () => {
    const { canvas } = panel({ waitingFor: 'Waiting for a key' })
    expect(canvas.title).toMatch(/^Waiting for a key\. Click to send keyboard and mouse input/)
    expect(canvas.getAttribute('aria-label')).toMatch(/^Screen screen, waiting for a key, click/)
    expect(canvas.classList.contains('waiting')).toBe(true)
    canvas.focus()
    flushSync()
    expect(canvas.classList.contains('waiting')).toBe(false)
    expect(canvas.classList.contains('focused')).toBe(true)
})

it('keeps the Keyboard and Mouse paths for every other Target, the wheel included', () => {
    const { canvas, peripherals, reports } = panel({ x86: false })
    const turns: number[] = []
    peripherals.mouse.onWheel((notches) => turns.push(notches))
    const unfocused = new WheelEvent('wheel', { deltaY: 100, bubbles: true, cancelable: true })
    canvas.dispatchEvent(unfocused)
    expect(unfocused.defaultPrevented).toBe(false)
    canvas.focus()
    canvas.dispatchEvent(key('keydown', 'KeyA'))
    //a notch towards the user, at the pixel under the pointer of a Screen shown at twice its size
    const wheel = new WheelEvent('wheel', {
        deltaY: 100,
        clientX: 21,
        clientY: 41,
        bubbles: true,
        cancelable: true
    })
    canvas.dispatchEvent(wheel)
    expect(peripherals.keyboard.lastKeys().down).toBe(0x41)
    expect(wheel.defaultPrevented).toBe(true)
    expect(turns).toEqual([-1])
    expect([peripherals.mouse.x, peripherals.mouse.y]).toEqual([10, 20])
    expect(reports).toEqual([])
})
