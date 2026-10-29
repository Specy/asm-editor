import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import CyclesLine from './CyclesLine.svelte'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'
import type { CycleCount } from '#lib/languages/commonLanguageFeatures.svelte.ts'

/**
 * The cycle counter under the registers ([m68k-machine.md](../../../../../../../docs/design/m68k-machine.md),
 * decision 30): the count in thousands, then what the newest step took.
 */
const cleanups: (() => void)[] = []
afterEach(() => cleanups.splice(0).forEach((cleanup) => cleanup()))

function render(cycles: CycleCount, processor?: string) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(CyclesLine, { target, props: { cycles, processor } })
    flushSync()
    cleanups.push(() => {
        void unmount(app)
        target.remove()
    })
    const line = target.querySelector('.cycles-line')
    return { text: line?.textContent?.replace(/\s+/g, ' ').trim(), tooltip: tooltipText(line) }
}

describe('the cycle counter', () => {
    it('reads the count in thousands, with the newest step’s cost after it', () => {
        const shown = render({ total: 12_345n, last: 8 })
        expect(shown.text).toBe('Cycles 12,345 (+8)')
        expect(shown.tooltip).toBe(
            'The clock cycles a 68000 takes to run this program: 12,345 since it started or trap #15 task 30 last cleared the counter. The newest step took 8.'
        )
    })

    it('reads the count alone when no step says what it took, as after a Poke', () => {
        expect(render({ total: 0n }).text).toBe('Cycles 0')
    })

    it('reads a count past 32 bits whole', () => {
        expect(render({ total: 5_000_000_000n, last: 44 }).text).toBe('Cycles 5,000,000,000 (+44)')
    })

    it('names the processor a later program is written for', () => {
        expect(render({ total: 38n }, '68010').tooltip).toBe(
            'The clock cycles a 68010 takes to run this program: 38 since it started or trap #15 task 30 last cleared the counter.'
        )
    })

    //a 68020's are the manual's cache case, which the line marks and the hover explains
    it('marks an estimate, and says on hover why it is one', () => {
        const shown = render({ total: 12_345n, last: 8, estimate: true }, '68020')
        expect(shown.text).toBe('Cycles ≈ 12,345 (+8)')
        expect(shown.tooltip).toBe(
            'An estimate of the clock cycles a 68020 takes to run this program: 12,345 since it started or trap #15 task 30 last cleared the counter. A 68020 overlaps each instruction with the next and keeps recent code in a cache, so the time of one depends on its neighbours. Its manual gives each instruction’s time for the case where the instruction is in the cache already, which is what is counted here. The newest step took 8.'
        )
    })
})
