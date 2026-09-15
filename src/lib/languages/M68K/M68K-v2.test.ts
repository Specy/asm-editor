import { describe, expect, it } from 'vitest'
import { M68KEmulator } from './M68KEmulator.svelte'

describe('M68K v2 execution', () => {
    it('ends the current Run at SIMHALT and resumes after it on the next Run', async () => {
        const code = ['    org $1000', '    moveq #1,d0', '    simhalt', '    moveq #2,d0'].join(
            '\n'
        )
        const emulator = M68KEmulator(code)
        await emulator.compile(0, code)

        await emulator.run(100)
        expect(emulator.terminated).toBe(false)
        expect(emulator.registers.find((register) => register.name === 'D0')?.value).toBe(1n)

        await emulator.run(100)
        expect(emulator.terminated).toBe(true)
        expect(emulator.registers.find((register) => register.name === 'D0')?.value).toBe(2n)
        emulator.dispose()
    })
})
