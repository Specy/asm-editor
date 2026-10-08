import { afterEach, describe, expect, it, vi } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { FileSystem } from '$lib/languages/peripherals/FileSystem'
import type { BuildSources } from '$lib/projectFiles'
import { preferencesStore } from '$stores/preferencesStore.svelte'
import { provideRuntimeLibrary } from './runtimeLibrary'

afterEach(() => {
    preferencesStore.values.stepIntoRuntimeLibrary.value = false
})

describe('atomic filesystem Undo of a runtime call', () => {
    it.each(
        (['MIPS', 'RISC-V', 'RISC-V-64'] as const).flatMap((language) =>
            [0, 1].map((budget) => ({ language, budget }))
        )
    )('$language with a $budget MiB filesystem journal', async ({ language, budget }) => {
        preferencesStore.values.stepIntoRuntimeLibrary.value = false
        const mips = language === 'MIPS'
        const runtimePath = '@runtime/v1/write_file.s'
        provideRuntimeLibrary('v1', language, {
            abi: 'v1',
            target: mips ? 'mips' : language === 'RISC-V' ? 'riscv32' : 'riscv64',
            compiler: 'test',
            members: {
                '@runtime/v1/crt0.s': mips
                    ? '.text\n.globl _start\n_start:\njal main\nli $v0,10\nsyscall\n'
                    : '.text\n.globl _start\n_start:\njal ra,main\nli a7,93\necall\n',
                [runtimePath]: mips
                    ? `.text
.globl write_file
write_file:
    move $t3,$ra
    la $a0,path
    li $a1,1
    li $a2,0
    li $v0,13
    syscall
    move $s1,$v0
    move $a0,$s1
    la $a1,message
    li $a2,3
    li $v0,15
    syscall
    move $a0,$s1
    li $v0,16
    syscall
    li $t0,500
1:
    addiu $t0,$t0,-1
    bnez $t0,1b
    jr $t3
`
                    : `.text
.globl write_file
write_file:
    mv t3,ra
    lla a0,path
    li a1,1
    li a7,1024
    ecall
    mv s1,a0
    lla a1,message
    li a2,3
    li a7,64
    ecall
    mv a0,s1
    li a7,57
    ecall
    li t0,500
1:
    addi t0,t0,-1
    bnez t0,1b
    jr t3
`
            },
            index: { _start: '@runtime/v1/crt0.s', write_file: runtimePath },
            memberSources: {}
        })
        const sources: BuildSources = {
            entry: 'main.s',
            files: {
                'main.s': {
                    encoding: 'plain',
                    content: `.text
.globl main
.globl path
.globl message
main:
    ${mips ? 'jal write_file' : 'jal ra,write_file'}
    ${mips ? 'addiu $s0,$s0,1' : 'addi s0,s0,1'}
    ${mips ? 'li $v0,10\n    syscall' : 'li a7,93\n    ecall'}
.data
path: .string "output.txt"
message: .string "new"
`
                }
            },
            assemblerProfile: 'gnu-compiler-v1',
            runtimeAbi: 'v1',
            entrySymbol: '_start'
        }
        const fs = new FileSystem({ 'output.txt': { encoding: 'plain', content: 'old' } })
        const options = {
            language,
            automaticChecking: false,
            fileSystemHistoryBudgetMb: budget,
            peripherals: { fileSystem: fs }
        }
        const emulator = mips ? MIPSEmulator(sources, options) : RISCVEmulator(sources, options)
        try {
            await emulator.compile(5000, sources)
            const snapshot = () => ({
                pc: emulator._getPc(),
                registers: emulator.registers.map(({ name, value }) => [name, value]),
                depth: emulator._undoDepth()
            })
            const before = snapshot()
            const core = (
                emulator as unknown as {
                    getInstance(): { getUndoGroupsRange(skip: number, max: number): unknown[] }
                }
            ).getInstance()
            const range = vi.spyOn(core, 'getUndoGroupsRange')
            await emulator.step()
            expect(emulator.errors).toEqual([])
            expect(fs.readText('output.txt')).toBe('new')
            expect(emulator.latestSteps[0].stretch!.instructions).toBeGreaterThan(1000)
            expect(emulator.latestSteps[0].undoable).toBe(budget > 0)
            expect(emulator.canUndo).toBe(budget > 0)
            expect(range.mock.calls.every(([, count]) => count <= 2)).toBe(true)
            const after = snapshot()
            expect(emulator.undo()).toBe(budget > 0 ? 1 : 0)
            if (budget > 0) {
                expect(snapshot()).toEqual(before)
                expect(fs.readText('output.txt')).toBe('old')
                await emulator.step()
                expect(fs.readText('output.txt')).toBe('new')
            } else {
                expect(snapshot()).toEqual(after)
                expect(fs.readText('output.txt')).toBe('new')
                // A plain instruction above the blocked call remains independently undoable.
                await emulator.step()
                expect(emulator.undo()).toBe(1)
                expect(emulator.canUndo).toBe(false)
                expect(emulator.undo()).toBe(0)
                expect(emulator._getPc()).toBe(after.pc)
            }
            // After a successful Undo the ungrouped History tool requests its usual 20 rows.
            expect(range.mock.calls.every(([, count]) => count <= 20)).toBe(true)
        } finally {
            emulator.dispose()
        }
    })
})
