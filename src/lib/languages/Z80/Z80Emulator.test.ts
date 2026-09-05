import { describe, expect, it } from 'vitest'
import { Z80Emulator } from '$lib/languages/Z80/Z80Emulator.svelte'

/**
 * The slice contract against a real Core. `@specy/z80` is plain TypeScript, so it is the one adapter
 * that can be driven end to end under node, which makes it the guard for the scheduler of
 * [ADR 0007](../../../../docs/adr/0007-generic-emulator-run-scheduling.md): a program still runs to
 * its end across slices, an unbounded run yields often enough for Stop to be answered, and the
 * overall instruction limit survives being split up.
 */

const INFINITE_LOOP = ['    org $8000', 'loop:', '    jp loop'].join('\n')

describe('Z80 emulator slices', () => {
    it('runs a program to its end across slices', async () => {
        //port 1 is the unsigned decimal console port, so three 'x' come out as three 120s
        const code = [
            '    org $8000',
            '    ld b, 3',
            'loop:',
            "    ld a, 'x'",
            '    out ($01), a',
            '    djnz loop',
            '    halt'
        ].join('\n')
        const emulator = Z80Emulator(code)
        await emulator.compile(10, code)
        await emulator.run(2_000_000)
        expect(emulator.stdOut).toBe('120120120')
        expect(emulator.terminated).toBe(true)
        expect(emulator.errors).toEqual([])
    })

    it('answers Stop during an unbounded run', async () => {
        const emulator = Z80Emulator(INFINITE_LOOP)
        await emulator.compile(0, INFINITE_LOOP)
        //0 means "no limit": the whole point of slicing is that this still yields to the host
        const run = emulator.run(0)
        await new Promise((resolve) => setTimeout(resolve, 100))
        const stoppedAt = Date.now()
        emulator.clear()
        await run
        //ADR 0007's target is a tenth of a second; the run stops between two slices
        expect(Date.now() - stoppedAt).toBeLessThan(100)
        expect(emulator.errors).toEqual([])
    })

    it('ends a run at the instruction limit instead of restarting it every slice', async () => {
        const emulator = Z80Emulator(INFINITE_LOOP)
        await emulator.compile(0, INFINITE_LOOP)
        const start = Date.now()
        await emulator.run(500_000)
        //an unbroken loop reaches the limit, which is not an error on this Core, and stops there
        expect(emulator.terminated).toBe(false)
        expect(emulator.errors).toEqual([])
        expect(Date.now() - start).toBeLessThan(5_000)
    })
})
