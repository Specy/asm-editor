import { describe, expect, it } from 'vite-plus/test'
import {
    defaultLayout,
    LAYOUT_LIMITS,
    readStoredLayout
} from '#stores/workbenchLayoutStore.svelte.ts'

describe('readStoredLayout', () => {
    it('loads what it stores', () => {
        const stored = {
            panelWidths: { explorer: 300, prompt: 500 },
            bottomHeight: 240,
            debugWidth: 900,
            debugCollapsed: true,
            debugTopHeight: 480,
            collapsed: { screen: true, history: false },
            floating: { history: { open: true, left: 420, top: 60 } },
            searchLookIn: { files: true, listings: false, pseudocode: false }
        }
        expect(readStoredLayout(JSON.stringify(stored))).toEqual(stored)
    })

    it('clamps sizes to what the Workbench can lay out', () => {
        const layout = readStoredLayout(
            JSON.stringify({ panelWidths: { explorer: 5 }, bottomHeight: 1e9, debugWidth: -4 })
        )
        expect(layout.panelWidths.explorer).toBe(LAYOUT_LIMITS.panelWidth.min)
        expect(layout.bottomHeight).toBe(LAYOUT_LIMITS.bottomHeight.max)
        expect(layout.debugWidth).toBe(LAYOUT_LIMITS.debugWidth.min)
    })

    it('drops values of the wrong type and unknown keys, keeping the defaults', () => {
        const layout = readStoredLayout(
            JSON.stringify({
                panelWidths: { explorer: 'wide' },
                bottomHeight: 'tall',
                //stored before the registers stopped being resizable
                registersWidth: 260,
                collapsed: { screen: 'yes' },
                floating: { history: { open: true, left: 'x', top: 1 }, stack: 3 },
                somethingNew: 1
            })
        )
        expect(layout).toEqual(defaultLayout())
    })

    it('opens the debug column expanded from a layout stored before it could collapse', () => {
        const layout = readStoredLayout(JSON.stringify({ bottomHeight: 200, debugWidth: 700 }))
        expect(layout.debugCollapsed).toBe(false)
        //the width it collapsed from is kept apart, for opening it again
        expect(layout.debugWidth).toBe(700)
        expect(readStoredLayout(JSON.stringify({ debugCollapsed: 'yes' })).debugCollapsed).toBe(
            false
        )
    })

    it('ticks every place the Search panel looks in until the person unticks one', () => {
        expect(defaultLayout().searchLookIn).toEqual({
            files: true,
            listings: true,
            pseudocode: true
        })
        //stored before the panel existed, or with a value of the wrong type
        const layout = readStoredLayout(
            JSON.stringify({ searchLookIn: { files: false, listings: 'no', pseudocode: 0 } })
        )
        expect(layout.searchLookIn).toEqual({ files: false, listings: true, pseudocode: true })
    })

    it('survives junk', () => {
        expect(readStoredLayout(null)).toEqual(defaultLayout())
        expect(readStoredLayout('not json')).toEqual(defaultLayout())
        expect(readStoredLayout('[1,2]')).toEqual(defaultLayout())
    })
})
