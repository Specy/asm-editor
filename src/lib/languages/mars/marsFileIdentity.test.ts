import { afterEach, describe, expect, it } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { FileSystem } from '$lib/languages/peripherals/FileSystem'

/** A syscall PC may dispatch different services, while each execution has its own identity. */
describe.each(['MIPS', 'RISC-V', 'RISC-V-64'] as const)(
    '%s FileSystem instruction identity',
    (language) => {
        const mips = language === 'MIPS'
        const reg = (name: string) => (mips ? `$${name}` : name)
        const service = mips ? '$v0' : 'a7'
        const syscall = mips ? 'syscall' : 'ecall'
        const move = mips ? 'move' : 'mv'
        const open = mips ? 13 : 1024
        const read = mips ? 14 : 63
        const make = (code: string, fileSystem: FileSystem, fileSystemHistoryBudgetMb?: number) =>
            mips
                ? MIPSEmulator(code, { peripherals: { fileSystem }, fileSystemHistoryBudgetMb })
                : RISCVEmulator(code, {
                      language,
                      peripherals: { fileSystem },
                      fileSystemHistoryBudgetMb
                  })
        type Emulator = ReturnType<typeof make>
        const emulators: Emulator[] = []
        afterEach(() => {
            for (const emulator of emulators.splice(0)) emulator.dispose()
        })
        async function built(code: string, fileSystem: FileSystem, budgetMb?: number) {
            const emulator = make(code, fileSystem, budgetMb)
            emulators.push(emulator)
            await emulator.check()
            await emulator.compile(200, code)
            expect(emulator.compilerErrors).toEqual([])
            return emulator
        }

        it('keeps a file when Undo takes back only a later exit at the same syscall PC', async () => {
            const code = `.data\npath: .asciz "probe.txt"\n.text\nmain:\nli ${service}, ${open}\nla ${reg('a0')}, path\nli ${reg('a1')}, 1\nli ${reg('a2')}, 0\njal dispatch\nli ${service}, 10\njal dispatch\ndispatch:\n${syscall}\njr ${reg('ra')}\n`
            const fileSystem = new FileSystem()
            const emulator = await built(code, fileSystem)
            await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            expect(fileSystem.files['probe.txt']).toBeDefined()
            expect(emulator.undo(1)).toBe(1)
            expect(fileSystem.files['probe.txt']).toBeDefined()
            expect(emulator.terminated).toBe(false)
            await emulator.step()
            expect(emulator.termination).toEqual({ kind: 'exit', code: 0 })
            expect(fileSystem.files['probe.txt']).toBeDefined()
        })

        it('allows Core-only Undo past an evicted file frame and refuses the file Undo before Core state changes', async () => {
            const code = `.data\npath: .asciz "probe.txt"\n.text\nmain:\nli ${service}, ${open}\nla ${reg('a0')}, path\nli ${reg('a1')}, 1\nli ${reg('a2')}, 0\njal dispatch\nli ${service}, 10\njal dispatch\ndispatch:\n${syscall}\njr ${reg('ra')}\n`
            const fileSystem = new FileSystem()
            const emulator = await built(code, fileSystem, 0)
            await emulator.run(1000)
            expect(emulator.errors).toEqual([])
            expect(emulator.undo(1)).toBe(1)
            expect(emulator.terminated).toBe(false)
            for (let step = 0; step < 20 && emulator.canUndo; step++) emulator.undo(1)
            expect(emulator.canUndo).toBe(false)
            const pc = emulator.pc
            const registers = emulator.registers.map((register) => register.value)
            expect(emulator.undo(1)).toBe(0)
            //Even callers bypassing the public canUndo gate cannot partially rewind the Core.
            expect(() => emulator._undo()).toThrow('FileSystem Undo history exhausted')
            expect(emulator.pc).toBe(pc)
            expect(emulator.registers.map((register) => register.value)).toEqual(registers)
            expect(fileSystem.files['probe.txt']).toBeDefined()
        })

        const coreOnlyServices = [9, 40, 41, 42, ...(!mips ? [17] : [])]
        it.each(coreOnlyServices)(
            'preserves file read position across service %s at the same PC and Undo/replay',
            async (code) => {
                const args =
                    code === 9
                        ? `li ${reg('a0')}, 4`
                        : code === 17
                          ? `la ${reg('a0')}, buffer\nli ${reg('a1')}, 4`
                          : `li ${reg('a0')}, 7\nli ${reg('a1')}, ${code === 42 ? 10 : 42}`
                const fileRead = `li ${service}, ${read}\n${move} ${reg('a0')}, ${reg('s0')}\nla ${reg('a1')}, buffer\nli ${reg('a2')}, 1\njal dispatch\n`
                const source = `.data\npath: .asciz "input.txt"\nbuffer: .space 4\n.text\nmain:\nli ${service}, ${open}\nla ${reg('a0')}, path\nli ${reg('a1')}, 0\nli ${reg('a2')}, 0\n${syscall}\n${move} ${reg('s0')}, ${mips ? '$v0' : 'a0'}\nli ${service}, 40\nli ${reg('a0')}, 7\nli ${reg('a1')}, 42\n${syscall}\n${fileRead}${args}\nli ${service}, ${code}\njal dispatch\n${fileRead}la ${reg('t0')}, buffer\nlbu ${reg('s1')}, 0(${reg('t0')})\nli ${service}, 10\n${syscall}\ndispatch:\n${syscall}\njr ${reg('ra')}\n`
                const fileSystem = new FileSystem({
                    'input.txt': { encoding: 'plain', content: 'abc' }
                })
                const emulator = await built(source, fileSystem)
                const dispatchLine = source.split('\n').lastIndexOf(syscall)
                let dispatches = 0
                for (let step = 0; step < 100; step++) {
                    const next = emulator._getNextInstruction()
                    await emulator.step()
                    if (next?.lineNumber === dispatchLine && ++dispatches === 2) break
                }
                expect(dispatches).toBe(2)
                expect(emulator.canUndo).toBe(true)
                expect(emulator.undo(1)).toBe(1)
                await emulator.step()
                await emulator.run(1000)
                expect(emulator.errors).toEqual([])
                expect(
                    emulator.registers.find((register) => register.name === reg('s1'))!.value
                ).toBe(98n)
                expect(fileSystem.readText('input.txt')).toBe('abc')
            }
        )
    }
)
