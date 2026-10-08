import { describe, expect, it } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import type { BuildSources } from '$lib/projectFiles'

describe('shipped aligned_alloc overflow handling', () => {
    it.each(['MIPS', 'RISC-V', 'RISC-V-64'] as const)(
        '%s rejects overflowing requests and leaves the heap usable',
        async (language) => {
            const code =
                language === 'MIPS'
                    ? '.text\n.globl main\nmain:\nli $a0,0x80000000\nmove $a1,$a0\njal aligned_alloc\nnop\nmove $s0,$v0\nli $a0,64\nli $a1,128\njal aligned_alloc\nnop\nmove $s1,$v0\nli $v0,10\nsyscall\n'
                    : `.text\n.globl main\nmain:\nli a0,1\nslli a0,a0,${language === 'RISC-V-64' ? 63 : 31}\nmv a1,a0\ncall aligned_alloc\nmv s0,a0\nli a0,64\nli a1,128\ncall aligned_alloc\nmv s1,a0\nli a0,0\nli a7,93\necall\n`
            const sources: BuildSources = {
                entry: 'main.s',
                files: { 'main.s': { encoding: 'plain', content: code } },
                assemblerProfile: 'gnu-compiler-v1',
                runtimeAbi: 'v1',
                entrySymbol: '_start'
            }
            const emulator =
                language === 'MIPS'
                    ? MIPSEmulator(sources, { language, automaticChecking: false })
                    : RISCVEmulator(sources, { language, automaticChecking: false })
            try {
                await emulator.compile(200_000, sources)
                await emulator.run(10_000)
                expect(emulator.errors).toEqual([])
                expect(
                    emulator.registers.find((r) => r.name === (language === 'MIPS' ? '$s0' : 's0'))
                        ?.value
                ).toBe(0n)
                const pointer = emulator.registers.find(
                    (r) => r.name === (language === 'MIPS' ? '$s1' : 's1')
                )!.value
                expect(pointer).toBeGreaterThan(0n)
                expect(pointer & 63n).toBe(0n)
                expect(pointer).toBeLessThan(0x80000000n)
            } finally {
                emulator.dispose()
            }
        }
    )
})
