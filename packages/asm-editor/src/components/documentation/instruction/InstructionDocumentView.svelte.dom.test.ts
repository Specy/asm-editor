import { afterEach, beforeEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import InstructionDocumentView from './InstructionDocumentView.svelte'
import { symbolSlug } from './OperandLegend.svelte'
import type { FormPattern, InstructionDocument } from '#lib/documentation/instructions/document.ts'

/**
 * The instruction view in jsdom ([the design record](../../../../../docs/design/instruction-layout.md),
 * decisions 7 and 9): a symbol tapped in a row and the legend it opens in the panel.
 */

/** Where each scroll went, and whether the legend around it was open by then. */
let scrolls: { id: string; legendOpen: boolean }[] = []

beforeEach(() => {
    scrolls = []
    HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
        scrolls.push({ id: this.id, legendOpen: !!this.closest('details')?.open })
    }
})

const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

/** A row of two forms, `<name> <ea>, Dn`, which the panel opens to list them. */
function row(name: string): FormPattern {
    return {
        parts: [
            { text: `${name} ` },
            { text: '<ea>', symbol: true },
            { text: ', ' },
            { text: 'Dn', symbol: true }
        ],
        chips: [],
        facts: [],
        forms: [
            { code: `${name} d0, d1`, facts: [] },
            { code: `${name} (a0), d1`, facts: [] }
        ],
        details: []
    }
}

/** More operands than the panel shows open, so its legend starts closed. */
function instruction(name: string): InstructionDocument {
    return {
        name,
        longName: name.toUpperCase(),
        summary: `What ${name} does.`,
        tags: [],
        headerFacts: [],
        sections: [{ tags: [], collapsed: false, groups: [{ patterns: [row(name)] }] }],
        omitted: [],
        operands: ['<ea>', 'Dn', 'An', '#<data>', '<label>'].map((symbol) => ({
            symbol,
            meaning: `What ${symbol} stands for.`
        }))
    }
}

function render(props: { document: InstructionDocument; density?: 'page' | 'panel' }) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const view = mount(InstructionDocumentView, { target, props })
    mounted.push(() => unmount(view))
    flushSync()
    return {
        legend: () => target.querySelector<HTMLDetailsElement>('details.legend')!,
        tap: async (symbol: string) => {
            const button = [...target.querySelectorAll<HTMLButtonElement>('button.symbol')].find(
                (candidate) => candidate.textContent === symbol
            )!
            button.click()
            await tick()
            flushSync()
        }
    }
}

describe("a symbol tapped in the panel's rows", () => {
    it('opens the collapsed legend and scrolls to its line once it is open, every tap', async () => {
        const view = render({ document: instruction('add'), density: 'panel' })
        const line = `operands-add-${symbolSlug('<ea>')}`
        expect(view.legend().open).toBe(false)

        await view.tap('<ea>')
        expect(view.legend().open).toBe(true)
        expect(scrolls).toEqual([{ id: line, legendOpen: true }])

        //the reader closes it, then taps the same symbol again
        view.legend().open = false
        view.legend().dispatchEvent(new Event('toggle'))
        flushSync()
        await view.tap('<ea>')
        expect(view.legend().open).toBe(true)
        expect(scrolls).toEqual([
            { id: line, legendOpen: true },
            { id: line, legendOpen: true }
        ])
    })
})
