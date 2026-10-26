import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

/** An adapter's module whose first import fails, as a chunk does offline or after a deploy. */
function failingOnce(exportName: string) {
    const module = { attempts: 0 }
    const factory = () => {
        module.attempts += 1
        if (module.attempts === 1) throw new Error('Failed to fetch dynamically imported module')
        return { [exportName]: () => ({ made: exportName }) }
    }
    return { module, factory }
}

afterEach(() => {
    vi.doUnmock('./Z80/Z80Emulator.svelte')
    vi.doUnmock('./RISC-V/RISC-VEmulator.svelte')
    vi.doUnmock('@specy/risc-v')
    vi.resetModules()
})

describe('createEmulator', () => {
    it('imports a language again after an import that failed', async () => {
        const z80 = failingOnce('Z80Emulator')
        vi.doMock('./Z80/Z80Emulator.svelte', z80.factory)
        const { createEmulator } = await import('./Emulator')
        await expect(createEmulator('Z80', '')).rejects.toThrow()
        await expect(createEmulator('Z80', '')).resolves.toEqual({ made: 'Z80Emulator' })
        await createEmulator('Z80', '')
        expect(z80.module.attempts).toBe(2)
    })

    it('gives both RISC-V widths one import, which a failure for either makes again', async () => {
        const riscv = failingOnce('RISCVEmulator')
        vi.doMock('@specy/risc-v', () => ({ useWebAssembly: async () => 'javascript' }))
        vi.doMock('./RISC-V/RISC-VEmulator.svelte', riscv.factory)
        const { createEmulator } = await import('./Emulator')
        await expect(createEmulator('RISC-V-64', '')).rejects.toThrow()
        await expect(createEmulator('RISC-V', '')).resolves.toEqual({ made: 'RISCVEmulator' })
        await createEmulator('RISC-V-64', '')
        expect(riscv.module.attempts).toBe(2)
    })
})
