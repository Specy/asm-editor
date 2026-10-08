import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkAbi } from './build.mjs'
const baseline = {
    exported: { riscv32: ['printf', '_Znwj', '__divdi3'] },
    signatures: { riscv32: { printf: '_Z16__aed_sig_printfIFiPKczEEvPT_' } },
    layouts: { riscv32: { 'sizeof(max_align_t)': 32 } }
}
test('ABI rejects removed compiler support, changed public signatures and layouts', () => {
    const current = structuredClone(baseline)
    current.exported.riscv32.pop()
    current.signatures.riscv32.printf = 'changed'
    current.layouts.riscv32['sizeof(max_align_t)'] = 16
    assert.deepEqual(
        checkAbi(baseline, current).map((x) => x.split(':')[0]),
        ['riscv32', 'riscv32', 'riscv32']
    )
})
test('ABI accepts additions and preserves target-specific required symbols', () => {
    const current = structuredClone(baseline)
    current.exported.riscv32.push('new_function')
    assert.deepEqual(checkAbi(baseline, current), [])
    current.exported.riscv32 = []
    current.exported.riscv64 = baseline.exported.riscv32
    assert.equal(checkAbi(baseline, current).length, 3)
})
