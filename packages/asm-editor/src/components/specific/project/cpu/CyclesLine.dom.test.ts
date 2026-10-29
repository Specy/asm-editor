import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import CyclesLine from './CyclesLine.svelte'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'
import type { CycleCount } from '#lib/languages/commonLanguageFeatures.svelte.ts'

/**
 * The cycle counter above the PC ([m68k-machine.md](../../../../../../../docs/design/m68k-machine.md),
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
            '68000 clock cycles: 12,345 since the program started or trap #15 task 30 last reset the counter. Last step: 8 cycles.'
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
            '68010 clock cycles: 38 since the program started or trap #15 task 30 last reset the counter.'
        )
    })

    //a 68020's are the manual's cache case, which the line marks and the hover explains
    it('marks an estimate, and says on hover why it is one', () => {
        const shown = render({ total: 12_345n, last: 8, estimate: true }, '68020')
        expect(shown.text).toBe('Cycles ≈ 12,345 (+8)')
        expect(shown.tooltip).toBe(
            'Estimated 68020 clock cycles: 12,345 since the program started or trap #15 task 30 last reset the counter. 68020 timings depend on overlapping instruction execution and the instruction cache. This estimate uses the manual’s timings for instructions already in the cache. Last step: 8 cycles.'
        )
    })

    //a 68000's bit field under `opt bit` takes the 68020's time, as EASy68K counts it
    it('says why a 68000 program with a bit field counts an estimate', () => {
        const shown = render({ total: 40n, last: 8, estimate: true }, '68000 with bit fields')
        expect(shown.text).toBe('Cycles ≈ 40 (+8)')
        expect(shown.tooltip).toBe(
            'Estimated 68000 with bit fields clock cycles: 40 since the program started or trap #15 task 30 last reset the counter. Bit-field instructions enabled by opt bit use the 68020 manual’s timings for instructions already in the cache, as in EASy68K. All other instructions use exact 68000 or 68010 timings. Last step: 8 cycles.'
        )
    })
})
