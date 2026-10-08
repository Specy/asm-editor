import { expect, it } from 'vitest'
import { MIPSEmulator } from './MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from './RISC-V/RISC-VEmulator.svelte'
import { M68KEmulator } from './M68K/M68KEmulator.svelte'
import { Z80Emulator } from './Z80/Z80Emulator.svelte'
import { X86Emulator } from './X86/X86Emulator.svelte'
import type { Emulator } from './Emulator'

const cases = [
    [
        'MIPS',
        MIPSEmulator,
        '.data\nbuffer: .byte 1,2,3\nroom: .space 32\n.text\n.globl main\nmain:\nlui $sp,0x1002\naddiu $sp,$sp,-16\nli $v0,10\nsyscall',
        0x10020000n
    ],
    [
        'RISC-V',
        RISCVEmulator,
        '.data\nbuffer: .byte 1,2,3\nroom: .space 32\n.text\n.globl main\nmain:\nlui sp,0x10020\naddi sp,sp,-16\nli a7,10\necall',
        0x10020000n
    ],
    [
        'M68K',
        M68KEmulator,
        ' org $1000\nstart: lea $8000,a7\n move.l d0,-(a7)\n simhalt\nbuffer: dc.b 1,2,3\n dc.w 7\nroom: ds.b 32\n end start',
        0x8000n
    ],
    [
        'Z80',
        Z80Emulator,
        '; @screen trs80\n org $4000\nstart: ld sp,$8000\n push hl\n halt\nbuffer: db 1,2,3\nroom: ds 32\n end start',
        0x8000n
    ],
    [
        'X86',
        X86Emulator,
        'global _start\nsection .text\n_start:\n mov rsp,0x4fffffff0000\n push rax\n mov eax,60\n xor edi,edi\n syscall\nsection .data\nbuffer: db 1,2,3\nsection .bss\nroom: resb 32',
        0x4fffffff0000n
    ]
] as const
for (const [name, factory, source, top] of cases)
    it(`${name}: Core layout, label lookup and stack extent survive Step and Undo`, async () => {
        const emulator: Emulator = await factory(source, { automaticChecking: false })
        try {
            expect(emulator.memoryRegions).toEqual([])
            await emulator.compile(100, undefined)
            expect(emulator.dataLabels.map((label) => label.name)).toContain('buffer')
            expect(emulator.dataLabels.map((label) => label.name)).toContain('room')
            expect(emulator.memoryRegions.some((region) => region.kind === 'code')).toBe(true)
            expect(emulator.memoryRegions.some((region) => region.kind === 'reserved')).toBe(true)
            expect(emulator.resolveMemoryLabel(name === 'Z80' ? 'BUFFER' : 'buffer')).toBe(
                emulator.dataLabels.find((label) => label.name === 'buffer')!.address
            )
            const initialTop = emulator.memoryRegions.find((region) => region.kind === 'stack')!.end
            const reportedTop = name === 'RISC-V' ? initialTop : top
            await emulator.step()
            expect(emulator.memoryRegions.find((region) => region.kind === 'stack')!.end).toBe(
                reportedTop
            )
            await emulator.step()
            expect(emulator.memoryRegions.find((region) => region.kind === 'stack')!.end).toBe(
                reportedTop
            )
            emulator.undo(1)
            expect(emulator.memoryRegions.find((region) => region.kind === 'stack')!.end).toBe(
                reportedTop
            )
            emulator.undo(1)
            expect(emulator.memoryRegions.find((region) => region.kind === 'stack')!.end).toBe(
                initialTop
            )
            if (name === 'Z80')
                expect(
                    emulator.memoryRegions.filter((region) => region.kind === 'device')
                ).toHaveLength(2)
            emulator.clear()
            expect(emulator.dataLabels).toEqual([])
            expect(emulator.memoryRegions).toEqual([])
        } finally {
            emulator.dispose()
        }
    }, 20000)
