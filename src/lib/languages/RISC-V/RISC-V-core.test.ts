import { expect, it, vi } from 'vitest'
import { RISCV } from '@specy/risc-v'
import { makeRiscVCore } from './RISC-V-core'

it('blocks a required GNU profile when an older Core could silently ignore options', () => {
    const descriptor = Object.getOwnPropertyDescriptor(RISCV, 'assemblerProfiles')
    const factory = vi.spyOn(RISCV, 'makeRiscVFromFiles').mockReturnValue({} as never)
    try {
        Object.defineProperty(RISCV, 'assemblerProfiles', { value: undefined, configurable: true })
        expect(() => makeRiscVCore({ 'main.s': '' }, 'main.s', 'gnu-compiler-v1')).toThrow(
            /does not support/
        )
        expect(factory).not.toHaveBeenCalled()
        makeRiscVCore({ 'main.s': '' }, 'main.s', 'rars')
        expect(factory).toHaveBeenCalledOnce()
    } finally {
        if (descriptor) Object.defineProperty(RISCV, 'assemblerProfiles', descriptor)
        factory.mockRestore()
    }
})
