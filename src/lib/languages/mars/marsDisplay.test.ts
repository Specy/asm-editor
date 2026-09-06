import { describe, expect, it } from 'vitest'
import {
    DEFAULT_PROJECT_DISPLAY,
    formatMarsBaseAddress,
    MARS_BASE_ADDRESS_CHOICES,
    MARS_DISPLAY_SIZE_CHOICES,
    MARS_UNIT_SIZE_CHOICES,
    marsDisplayEquals,
    marsDisplayGeometry,
    marsWordAddress,
    normalizeMarsDisplay
} from './marsDisplay'

/**
 * The five parameters against MARS's own `BitmapDisplay`: the choice lists, the default indices and
 * the grid the tool builds from them (`createNewGrid`, rows = height / unitHeight).
 */

describe('the MARS display parameters', () => {
    it("offers the tool's own choices and defaults", () => {
        expect([...MARS_UNIT_SIZE_CHOICES]).toEqual([1, 2, 4, 8, 16, 32])
        expect([...MARS_DISPLAY_SIZE_CHOICES]).toEqual([64, 128, 256, 512, 1024])
        expect(MARS_BASE_ADDRESS_CHOICES.map((choice) => choice.address)).toEqual([
            0x10000000, 0x10008000, 0x10010000, 0x10040000, 0xffff0000
        ])
        //defaultDisplayWidthIndex 3, defaultDisplayHeightIndex 2, defaultBaseAddressIndex 2
        expect(DEFAULT_PROJECT_DISPLAY).toEqual({
            unitWidth: 1,
            unitHeight: 1,
            width: 512,
            height: 256,
            baseAddress: 0x10010000
        })
    })

    it('labels a base address the way the combo box does', () => {
        expect(formatMarsBaseAddress(0x10010000)).toBe('0x10010000 (static data)')
        expect(formatMarsBaseAddress(0xffff0000)).toBe('0xffff0000 (memory map)')
    })

    it('snaps anything off the lists back onto them', () => {
        const snapped = normalizeMarsDisplay({
            unitWidth: 3,
            unitHeight: 40,
            width: 100,
            height: 900,
            baseAddress: 0x12345678
        })
        expect(snapped).toEqual({
            unitWidth: 2,
            unitHeight: 32,
            width: 128,
            height: 1024,
            //not one of the five, and kept: a `@screen base=<label>` resolves to wherever the
            //assembler put the label, which is never one of the tool's five menu entries
            baseAddress: 0x12345678
        })
    })

    it('keeps a base address on a word boundary and falls back when it is unusable', () => {
        const display = { ...DEFAULT_PROJECT_DISPLAY, baseAddress: 0x1001000e }
        expect(normalizeMarsDisplay(display).baseAddress).toBe(0x1001000c)
        expect(normalizeMarsDisplay({ ...display, baseAddress: Number.NaN }).baseAddress).toBe(
            DEFAULT_PROJECT_DISPLAY.baseAddress
        )
    })

    it('compares two displays by the grid they configure', () => {
        expect(marsDisplayEquals(DEFAULT_PROJECT_DISPLAY, { ...DEFAULT_PROJECT_DISPLAY })).toBe(
            true
        )
        expect(
            marsDisplayEquals(DEFAULT_PROJECT_DISPLAY, { ...DEFAULT_PROJECT_DISPLAY, width: 256 })
        ).toBe(false)
    })
})

describe('the grid a display describes', () => {
    it('is the display size divided by the unit size, one word per pixel', () => {
        const geometry = marsDisplayGeometry(DEFAULT_PROJECT_DISPLAY)
        expect(geometry.columns).toBe(512)
        expect(geometry.rows).toBe(256)
        expect(geometry.words).toBe(512 * 256)
        expect(geometry.baseAddress).toBe(0x10010000)
        //inclusive, and covering its whole word, which is the shape the Core's ranges take
        expect(geometry.endAddress).toBe(0x10010000 + (512 * 256 - 1) * 4)
    })

    it('shrinks a unit that covers several screen pixels', () => {
        const geometry = marsDisplayGeometry({
            unitWidth: 8,
            unitHeight: 4,
            width: 512,
            height: 256,
            baseAddress: 0x10010000
        })
        expect(geometry.columns).toBe(64)
        expect(geometry.rows).toBe(64)
    })

    it('stops the grid at the top of memory instead of wrapping past it', () => {
        //the memory map base with the largest grid would run four megabytes past 0xffffffff, and a
        //Core range that wraps is refused
        const geometry = marsDisplayGeometry({
            unitWidth: 1,
            unitHeight: 1,
            width: 1024,
            height: 1024,
            baseAddress: 0xffff0000
        })
        expect(geometry.columns).toBe(1024)
        expect(geometry.words).toBe(0x10000 / 4)
        expect(geometry.endAddress).toBe(0xfffffffc)
    })

    it('addresses a word unsigned', () => {
        expect(marsWordAddress(0xffff0000, 3)).toBe(0xffff000c)
        expect(marsWordAddress(0x10010000, 0)).toBe(0x10010000)
    })
})
