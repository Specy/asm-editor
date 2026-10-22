/**
 * A pane's navigation history ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
 * decision 8), as a browser keeps one.
 */
import { describe, expect, it } from 'vite-plus/test'
import { buildSource, liveSource } from '#lib/monaco/projectSourceSelection.ts'
import {
    NAVIGATION_HISTORY_LIMIT,
    NavigationHistory,
    samePosition,
    type NavigationPosition
} from './navigationHistory.svelte'

const line = (n: number, path = 'crackme'): NavigationPosition => ({
    selection: liveSource(path),
    view: 'listing',
    line: n
})
const fn = (address: number, path = 'crackme'): NavigationPosition => ({
    selection: liveSource(path),
    view: 'pseudocode',
    functionAddress: address
})
const any = () => true

describe('a navigation history', () => {
    it('goes back to the places jumps left and forward again', () => {
        const history = new NavigationHistory()
        expect(history.canGoBack).toBe(false)
        history.record(line(10))
        history.record(line(20))
        expect(history.canGoBack).toBe(true)
        //at line 30, Back is line 20, then 10, and Forward retraces them
        expect(history.back(line(30), any)).toEqual(line(20))
        expect(history.canGoForward).toBe(true)
        expect(history.back(line(20), any)).toEqual(line(10))
        expect(history.canGoBack).toBe(false)
        expect(history.back(line(10), any)).toBeUndefined()
        expect(history.forward(line(10), any)).toEqual(line(20))
        expect(history.forward(line(20), any)).toEqual(line(30))
        expect(history.canGoForward).toBe(false)
    })

    it('forgets what was ahead at a new jump, as a browser does', () => {
        const history = new NavigationHistory()
        history.record(line(10))
        history.back(line(20), any)
        expect(history.canGoForward).toBe(true)
        history.record(line(10))
        expect(history.canGoForward).toBe(false)
        expect(history.behind).toEqual([line(10)])
    })

    it('passes over the place the pane is at and places that are gone, and drops them', () => {
        const history = new NavigationHistory()
        history.record(fn(0x1149))
        history.record(line(5, 'deleted'))
        history.record(fn(0x11e9))
        //the pane moved back to 0x11e9 by itself; 'deleted' is no longer a File
        const usable = (place: NavigationPosition) => place.selection.path !== 'deleted'
        expect(history.back(fn(0x11e9), usable)).toEqual(fn(0x1149))
        expect(history.behind).toEqual([])
        expect(history.ahead).toEqual([fn(0x11e9)])
    })

    it('keeps one of the same place in a row, and at most its limit', () => {
        const history = new NavigationHistory()
        history.record(line(1))
        history.record(line(1))
        expect(history.behind).toHaveLength(1)
        for (let n = 0; n < NAVIGATION_HISTORY_LIMIT + 10; n++) history.record(line(n + 2))
        expect(history.behind).toHaveLength(NAVIGATION_HISTORY_LIMIT)
        expect(history.behind[0]).toEqual(line(12))
    })

    it('takes a renamed File’s places with it', () => {
        const history = new NavigationHistory()
        history.record(line(3, 'old'))
        history.record(fn(0x10, 'other'))
        history.rename('old', 'new')
        expect(history.behind).toEqual([line(3, 'new'), fn(0x10, 'other')])
    })

    it("counts a place the same in the Build's version and the live one", () => {
        expect(
            samePosition(line(4), {
                selection: buildSource('crackme', 2),
                view: 'listing',
                line: 4
            })
        ).toBe(true)
        expect(samePosition(line(4), line(5))).toBe(false)
        expect(samePosition(fn(0x10), line(0x10))).toBe(false)
        expect(samePosition(fn(0x10), fn(0x10, 'other'))).toBe(false)
    })
})

describe('a Listing place', () => {
    it('is the same place by the address it stands for, whatever line it is on now', () => {
        const at = (n: number, address: number, nth = 0): NavigationPosition => ({
            selection: liveSource('crackme'),
            view: 'listing',
            line: n,
            place: { address, kind: 4, nth }
        })
        //a comment added above moved the instruction three lines down
        expect(samePosition(at(10, 0x1149), at(13, 0x1149))).toBe(true)
        expect(samePosition(at(10, 0x1149), at(10, 0x114d))).toBe(false)
        expect(samePosition(at(10, 0x1149), at(11, 0x1149, 1))).toBe(false)
        //a place kept without one, from a line standing for no address, by its line
        expect(samePosition(line(10), at(10, 0x1149))).toBe(true)
        expect(samePosition(line(10), at(12, 0x1149))).toBe(false)
        //a record of the same place twice keeps one
        const history = new NavigationHistory()
        history.record(at(10, 0x1149))
        history.record(at(13, 0x1149))
        expect(history.behind).toEqual([at(10, 0x1149)])
    })
})
