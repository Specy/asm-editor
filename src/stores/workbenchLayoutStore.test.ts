import { describe, expect, it } from 'vitest'
import { defaultLayout, LAYOUT_LIMITS, readStoredLayout } from '$stores/workbenchLayoutStore.svelte'

describe('readStoredLayout', () => {
    it('loads what it stores', () => {
        const stored = {
            panelWidths: { explorer: 300, prompt: 500 },
            bottomHeight: 240,
            debugWidth: 900,
            debugTopHeight: 480,
            collapsed: { screen: true, history: false },
            floating: { history: { open: true, left: 420, top: 60 } }
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

    it('survives junk', () => {
        expect(readStoredLayout(null)).toEqual(defaultLayout())
        expect(readStoredLayout('not json')).toEqual(defaultLayout())
        expect(readStoredLayout('[1,2]')).toEqual(defaultLayout())
    })
})
