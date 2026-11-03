import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it } from 'vite-plus/test'
import type { Testcase } from '#lib/Project.svelte.ts'
import { MIPSEmulator } from '#lib/languages/MIPS/MIPSEmulator.svelte.ts'
import { RISCVEmulator } from '#lib/languages/RISC-V/RISC-VEmulator.svelte.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'

/**
 * The folder calls end to end, a real Core under node making each syscall
 * ([folder-calls.md](../../../../../../docs/design/folder-calls.md)): the numbers reach the
 * FileSystem session, the results land in the result register, getdents records and stat
 * structures land in memory where the program walks them, Undo takes every call back, and a
 * Testcase's calls change nothing of the Project.
 */
describe.each(['MIPS', 'RISC-V', 'RISC-V-64'] as const)('%s folder calls', (language) => {
    const mips = language === 'MIPS'
    const long = language === 'RISC-V-64' ? 8 : 4
    const reg = (name: string) => (mips ? `$${name}` : name)
    const result = mips ? '$v0' : 'a0'
    const service = mips ? '$v0' : 'a7'
    const syscall = mips ? 'syscall' : 'ecall'
    const move = mips ? 'move' : 'mv'
    const text = mips ? '.asciiz' : '.asciz'
    const open = mips ? 13 : 1024
    const close = mips ? 16 : 57
    //st_mode's offset in the Target's stat structure
    const modeAt = mips ? 24 : 16

    /** Calls service `code` with `setup` loading its arguments, then prints its result and a newline. */
    const call = (code: number, setup: string) =>
        `${setup}\nli ${service}, ${code}\n${syscall}\n${move} ${reg('a0')}, ${result}\nli ${service}, 1\n${syscall}\nla ${reg('a0')}, newline\nli ${service}, 4\n${syscall}\n`
    const path = (label: string, register = 'a0') => `la ${reg(register)}, ${label}`

    const PROGRAM = [
        '.data',
        `made: ${text} "made"`,
        `keep: ${text} "made/.keep"`,
        `moved: ${text} "made/moved.txt"`,
        `input: ${text} "input.txt"`,
        `nowhere: ${text} "nowhere/x"`,
        `newline: ${text} "\\n"`,
        '.align 3',
        'statbuf: .space 128',
        'buffer: .space 512',
        '.text',
        'main:',
        call(1030, path('made')),
        call(1030, path('made')),
        call(1030, path('nowhere')),
        call(1038, `${path('made')}\nla ${reg('a1')}, statbuf`),
        //st_mode: S_IFDIR | 0777
        `la ${reg('t0')}, statbuf\nlw ${reg('a0')}, ${modeAt}(${reg('t0')})\nli ${service}, 1\n${syscall}\nla ${reg('a0')}, newline\nli ${service}, 4\n${syscall}`,
        //a hidden .keep, so the folder stays in the Project
        `${path('keep')}\nli ${reg('a1')}, 1\nli ${reg('a2')}, 0\nli ${service}, ${open}\n${syscall}\n${move} ${reg('a0')}, ${result}\nli ${service}, ${close}\n${syscall}`,
        call(1034, `${path('input')}\n${path('moved', 'a1')}`),
        call(1031, path('made')),
        call(1026, path('made')),
        call(1034, `${path('made')}\n${path('input', 'a1')}`),
        //open the folder for reading, then walk getdents' records printing each name
        `${path('made')}\nli ${reg('a1')}, 0\nli ${reg('a2')}, 0\nli ${service}, ${open}\n${syscall}\n${move} ${reg('s0')}, ${result}`,
        `${move} ${reg('a0')}, ${reg('s0')}\nla ${reg('a1')}, buffer\nli ${reg('a2')}, 512\nli ${service}, 1065\n${syscall}`,
        `la ${reg('s1')}, buffer\n${mips ? 'addu' : 'add'} ${reg('s2')}, ${reg('s1')}, ${result}`,
        'walk:',
        `${mips ? 'addiu' : 'addi'} ${reg('a0')}, ${reg('s1')}, ${long * 2 + 2}\nli ${service}, 4\n${syscall}\nla ${reg('a0')}, newline\nli ${service}, 4\n${syscall}`,
        `lhu ${reg('t0')}, ${long * 2}(${reg('s1')})\n${mips ? 'addu' : 'add'} ${reg('s1')}, ${reg('s1')}, ${reg('t0')}`,
        `bltu ${reg('s1')}, ${reg('s2')}, walk`,
        call(
            1065,
            `${move} ${reg('a0')}, ${reg('s0')}\nla ${reg('a1')}, buffer\nli ${reg('a2')}, 512`
        ),
        `${move} ${reg('a0')}, ${reg('s0')}\nli ${service}, ${close}\n${syscall}`,
        call(1026, path('moved')),
        `li ${service}, 10\n${syscall}`
    ].join('\n')

    const OUTPUT = [
        '0', //mkdir made
        '-17', //again
        '-2', //below a folder that is not there
        '0', //stat
        String(0o040777),
        '0', //rename a File into it
        '-39', //rmdir of a folder that holds Files
        '-21', //unlink of a folder
        '-21', //rename of a folder
        '.',
        '..',
        '.keep',
        'moved.txt',
        '0', //getdents at the end of the folder
        '0' //unlink
    ]
        .map((line) => `${line}\n`)
        .join('')

    type Emulator = ReturnType<typeof MIPSEmulator> | ReturnType<typeof RISCVEmulator>
    const emulators: Emulator[] = []
    afterEach(() => {
        for (const emulator of emulators.splice(0)) emulator.dispose()
    })
    function make(fileSystem: FileSystem): Emulator {
        const emulator = mips
            ? MIPSEmulator(PROGRAM, { peripherals: { fileSystem } })
            : RISCVEmulator(PROGRAM, { language, peripherals: { fileSystem } })
        emulators.push(emulator)
        return emulator
    }
    const project = () => new FileSystem({ 'input.txt': { encoding: 'plain', content: 'data' } })

    it('makes each call with its number and walks the records getdents stores', async () => {
        const fileSystem = project()
        const emulator = make(fileSystem)
        await emulator.check()
        await emulator.compile(1000, PROGRAM)
        expect(emulator.compilerErrors).toEqual([])
        await emulator.run(100_000)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe(OUTPUT)
        //the folder lives on in the Project through its .keep
        expect(Object.keys(fileSystem.files)).toEqual(['made/.keep'])
    })

    it('takes every call back with Undo, to the Files the run started with', async () => {
        const fileSystem = project()
        const emulator = make(fileSystem)
        await emulator.check()
        await emulator.compile(100_000, PROGRAM)
        await emulator.run(100_000)
        expect(emulator.terminated).toBe(true)
        while (emulator.canUndo) emulator.undo(1)
        expect(fileSystem.files).toEqual({ 'input.txt': { encoding: 'plain', content: 'data' } })
        expect(emulator.stdOut).toBe('')
        //and the run replays to the same end
        await emulator.run(100_000)
        expect(emulator.stdOut).toBe(OUTPUT)
        expect(Object.keys(fileSystem.files)).toEqual(['made/.keep'])
        //an Undo a step at a time through a few hundred instructions, slower under a loaded run
    }, 30_000)

    it('replaces a File a rename lands on, and Undo puts both back', async () => {
        const program = [
            '.data',
            `input: ${text} "input.txt"`,
            `other: ${text} "other.txt"`,
            `made: ${text} "made"`,
            `nowhere: ${text} "nowhere/x"`,
            `newline: ${text} "\\n"`,
            '.text',
            'main:',
            call(1034, `${path('input')}\n${path('other', 'a1')}`),
            call(1034, `${path('other')}\n${path('other', 'a1')}`),
            call(1030, path('made')),
            call(1034, `${path('other')}\n${path('made', 'a1')}`),
            call(1034, `${path('other')}\n${path('nowhere', 'a1')}`),
            `li ${service}, 10\n${syscall}`
        ].join('\n')
        const files = {
            'input.txt': { encoding: 'plain' as const, content: 'data' },
            'other.txt': { encoding: 'plain' as const, content: 'old' }
        }
        const fileSystem = new FileSystem(files)
        const emulator = mips
            ? MIPSEmulator(program, { peripherals: { fileSystem } })
            : RISCVEmulator(program, { language, peripherals: { fileSystem } })
        emulators.push(emulator)
        await emulator.check()
        await emulator.compile(1000, program)
        expect(emulator.compilerErrors).toEqual([])
        await emulator.run(100_000)
        expect(emulator.errors).toEqual([])
        //onto the File, onto itself, a folder, into a folder that is not there
        expect(emulator.stdOut).toBe('0\n0\n0\n-21\n-2\n')
        expect(fileSystem.files).toEqual({ 'other.txt': { encoding: 'plain', content: 'data' } })
        while (emulator.canUndo) emulator.undo(1)
        expect(fileSystem.files).toEqual(files)
    })

    it("keeps a Testcase's folder calls in the Testcase's own Files", async () => {
        const fileSystem = project()
        const emulator = make(fileSystem)
        const testcase: Testcase = {
            input: [],
            expectedOutput: OUTPUT,
            startingRegisters: {},
            expectedRegisters: {},
            startingMemory: [],
            expectedMemory: []
        }
        //a Testcase starts from its own copy of the Files its Build was given
        const sources = {
            entry: 'main.s',
            files: {
                ...fileSystem.files,
                'main.s': { encoding: 'plain' as const, content: PROGRAM }
            }
        }
        const results = await emulator.test(sources, [testcase, testcase], 100_000, 200)
        expect(results.map((each) => each.passed)).toEqual([true, true])
        expect(fileSystem.files).toEqual({ 'input.txt': { encoding: 'plain', content: 'data' } })
        expect(fileSystem.locked).toBe(false)
    })

    it("runs the Documentation's listing example, which walks getdents' records", async () => {
        const page = readFileSync(
            `src/lib/documentation/${mips ? 'mips' : 'riscv'}/syscalls.md`,
            'utf8'
        )
        const section = page.slice(page.indexOf('### Listing a folder from assembly'))
        let example = /```(?:mips|riscv)\n([\s\S]*?)```/.exec(section)![1]
        //the offsets its comments give for RV64
        if (language === 'RISC-V-64')
            example = example
                .replace('addi a0, s1, 10', 'addi a0, s1, 18')
                .replace('lhu  t0, 8(s1)', 'lhu  t0, 16(s1)')
        const fileSystem = new FileSystem({
            'main.s': { encoding: 'plain', content: example },
            'notes.txt': { encoding: 'plain', content: 'n' },
            'docs/a.txt': { encoding: 'plain', content: 'a' }
        })
        const sources = { entry: 'main.s', files: fileSystem.files }
        const emulator = mips
            ? MIPSEmulator(sources, { peripherals: { fileSystem } })
            : RISCVEmulator(sources, { language, peripherals: { fileSystem } })
        emulators.push(emulator)
        await emulator.check()
        await emulator.compile(1000, sources)
        expect(emulator.compilerErrors).toEqual([])
        await emulator.run(100_000)
        expect(emulator.errors).toEqual([])
        expect(emulator.stdOut).toBe('./\n../\ndocs/\nmain.s\nnotes.txt\n')
    })
})
