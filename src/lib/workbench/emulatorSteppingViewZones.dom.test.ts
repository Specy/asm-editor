import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { flushSync } from 'svelte'
import { setupRealStepping } from './__fixtures__/realSteppingRunner.svelte'

describe('emulator stepping with viewZones (pseudo-instructions)', () => {
    it('does not re-evaluate viewZones or trigger editor viewZone re-mounts when stepping in RISC-V', async () => {
        const test = await setupRealStepping('RISC-V')

        expect(test.emulator.decorations.length).toBeGreaterThan(0)
        expect(test.getCounts().viewZonesRuns).toBe(1)
        expect(test.getCounts().editorEffectRuns).toBe(1)

        // Step 1
        await test.session.step()
        flushSync()

        expect(test.getCounts().viewZonesRuns).toBe(1)
        expect(test.getCounts().editorEffectRuns).toBe(1)

        // Step 2
        await test.session.step()
        flushSync()

        expect(test.getCounts().viewZonesRuns).toBe(1)
        expect(test.getCounts().editorEffectRuns).toBe(1)

        test.dispose()
    })

    it('does not re-evaluate viewZones or trigger editor viewZone re-mounts when stepping in MIPS', async () => {
        const test = await setupRealStepping('MIPS')

        expect(test.emulator.decorations.length).toBeGreaterThan(0)
        expect(test.getCounts().viewZonesRuns).toBe(1)
        expect(test.getCounts().editorEffectRuns).toBe(1)

        // Step 1
        await test.session.step()
        flushSync()

        expect(test.getCounts().viewZonesRuns).toBe(1)
        expect(test.getCounts().editorEffectRuns).toBe(1)

        // Step 2
        await test.session.step()
        flushSync()

        expect(test.getCounts().viewZonesRuns).toBe(1)
        expect(test.getCounts().editorEffectRuns).toBe(1)

        test.dispose()
    })
})
