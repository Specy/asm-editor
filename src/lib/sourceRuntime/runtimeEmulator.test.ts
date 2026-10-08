import { afterEach, describe, expect, it } from 'vitest'
import { MIPSEmulator } from '$lib/languages/MIPS/MIPSEmulator.svelte'
import { RISCVEmulator } from '$lib/languages/RISC-V/RISC-VEmulator.svelte'
import { preferencesStore } from '$stores/preferencesStore.svelte'
import type { BuildSources } from '$lib/projectFiles'
import { provideRuntimeFunctions, provideRuntimeLibrary } from './runtimeLibrary'

/**
 * A Build that links a Runtime library, against the real RISC-V and MIPS Cores: the library here is
 * a small stand-in with the real one's shape (startup code that calls `main`, members pulled by
 * name), so the stepping and Undo rules are checked without depending on the generated library.
 */

const members = {
    '@runtime/v1/crt0.s': '.text\n.globl _start\n_start:\ncall main\nli a7,93\necall\n',
    // Loops n times, then returns 2n: a call long enough to be worth stepping over.
    '@runtime/v1/count.s':
        '.text\n.globl count\ncount:\nmv t0,a0\n1:\naddi t0,t0,-1\nbnez t0,1b\nslli a0,a0,1\nret\n',
    // Calls the function in a0 with a1, as qsort calls its comparator.
    '@runtime/v1/apply.s':
        '.text\n.globl apply\napply:\nmv t3,ra\nmv t4,a0\nmv a0,a1\njalr t4\naddi a0,a0,100\njr t3\n',
    // Writes the string in a0 to standard output.
    '@runtime/v1/puts.s':
        '.text\n.globl puts\nputs:\nmv a1,a0\nli a2,0\n1:\nadd t0,a1,a2\nlbu t0,0(t0)\nbeqz t0,2f\naddi a2,a2,1\nj 1b\n2:\nli a0,1\nli a7,64\necall\nret\n'
}
provideRuntimeLibrary('v1', 'RISC-V', {
    abi: 'v1',
    target: 'riscv32',
    compiler: 'test',
    members,
    index: {
        _start: '@runtime/v1/crt0.s',
        count: '@runtime/v1/count.s',
        apply: '@runtime/v1/apply.s',
        puts: '@runtime/v1/puts.s'
    },
    memberSources: {}
})
provideRuntimeFunctions({
    abi: 'v1',
    functions: [
        { name: 'puts', header: 'stdio.h', prototype: 'int puts(const char *s)', doc: 'Prints.' }
    ]
})

const PROGRAM = `.text
.globl main
main:
    addi sp,sp,-16
    sw ra,12(sp)
    li a0,500
    call count
    mv s0,a0
    lla a0,callback
    li a1,20
    call apply
    mv s1,a0
    lla a0,message
    call puts
    lw ra,12(sp)
    addi sp,sp,16
    li a0,0
    ret
callback:
    addi a0,a0,1
    ret
.data
message: .string "linked\\n"
`

const sources: BuildSources = {
    files: { 'main.s': { encoding: 'plain', content: PROGRAM } },
    entry: 'main.s',
    assemblerProfile: 'gnu-compiler-v1',
    runtimeAbi: 'v1',
    entrySymbol: '_start'
}

async function build() {
    const emulator = RISCVEmulator(sources, { language: 'RISC-V' })
    await emulator.check()
    await emulator.compile(200_000, sources)
    return emulator
}

/** The source line the program is about to execute, one-based, and its File. */
function at(emulator: { currentFile: string | undefined; line: number }) {
    return { file: emulator.currentFile, line: emulator.line + 1 }
}

afterEach(() => {
    preferencesStore.values.stepIntoRuntimeLibrary.value = false
})

describe('a Build that links the Runtime library', () => {
    it('starts in main, and Step never stops in library code', async () => {
        const emulator = await build()
        expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(Object.keys(emulator.buildLibraryFiles ?? {})).toContain('@runtime/v1/count.s')
        //the Build ran the library's startup code into main, where the history begins
        expect(at(emulator)).toEqual({ file: 'main.s', line: 4 })
        expect(emulator.canUndo).toBe(false)
        expect(emulator.latestSteps).toEqual([])
        for (let i = 0; i < 3; i++) await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
        //`call` is auipc and jalr: the auipc stays in main
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
        //one Step runs the jalr and the whole call
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 8 })
        expect(emulator.latestSteps[0].stretch).toEqual({
            library: 'count',
            instructions: expect.any(Number)
        })
        expect(emulator.latestSteps[0].stretch!.instructions).toBeGreaterThan(1000)
        //and one Undo takes it back
        expect(emulator.undo(1)).toBe(1)
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
        expect(emulator.latestSteps[0].stretch).toBeUndefined()
        expect(BigInt(emulator.registers.find((r) => r.name === 'a0')!.value)).toBe(500n)
        await emulator.step()
        await emulator.step()
        expect(BigInt(emulator.registers.find((r) => r.name === 's0')!.value)).toBe(1000n)
    })

    it('stops in user code the library calls back, as a qsort comparator', async () => {
        const emulator = await build()
        //three lines, the two halves of each call, and the two lines before apply
        for (let i = 0; i < 3 + 2 + 1 + 2 + 1; i++) await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 11 })
        await emulator.step()
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 20 })
        await emulator.step()
        //returning into the library runs on until the program is back in its own code
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 12 })
        await emulator.step()
        expect(BigInt(emulator.registers.find((r) => r.name === 's1')!.value)).toBe(121n)
    })

    it('never undoes part of a library call the history no longer holds', async () => {
        const emulator = RISCVEmulator(sources, { language: 'RISC-V' })
        await emulator.check()
        //a history of 64 back steps, while count(500) runs about 1,500 instructions
        await emulator.compile(64, sources)
        //three lines, and the auipc of `call count`
        for (let i = 0; i < 4; i++) await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 8 })
        expect(emulator.canUndo).toBe(false)
        expect(emulator.undo(1)).toBe(0)
        expect(at(emulator)).toEqual({ file: 'main.s', line: 8 })
        //a plain Step after it is undoable, and Undo stops again at the call
        await emulator.step()
        expect(emulator.undo(1)).toBe(1)
        expect(at(emulator)).toEqual({ file: 'main.s', line: 8 })
        expect(emulator.canUndo).toBe(false)
        emulator.dispose()
    })

    it('starts in main without an Undo history too', async () => {
        const emulator = RISCVEmulator(sources, { language: 'RISC-V' })
        await emulator.check()
        await emulator.compile(0, sources)
        expect(at(emulator)).toEqual({ file: 'main.s', line: 4 })
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 5 })
        expect(emulator.canUndo).toBe(false)
        emulator.dispose()
    })

    it('steps through library code like any other with the Preference on', async () => {
        preferencesStore.values.stepIntoRuntimeLibrary.value = true
        const emulator = await build()
        //the Build stays at the startup code, which is stepped too: its auipc and jalr
        expect(at(emulator).file).toBe('@runtime/v1/crt0.s')
        await emulator.step()
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 4 })
        for (let i = 0; i < 5; i++) await emulator.step()
        expect(at(emulator).file).toBe('@runtime/v1/count.s')
        expect(emulator.undo(1)).toBe(1)
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
    })

    it('runs to the end with the library writing to the Terminal', async () => {
        const emulator = await build()
        await emulator.run(1_000_000)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('linked')
    })

    it('explains an undefined library function when the Build does not link it', async () => {
        const manual: BuildSources = {
            files: { 'main.s': { encoding: 'plain', content: '.text\nmain:\njal puts\n' } },
            entry: 'main.s'
        }
        const emulator = RISCVEmulator(manual, { language: 'RISC-V' })
        const diagnostics = await emulator.check()
        expect(diagnostics.find((d) => d.severity === 'error')?.hint).toMatch(
            /Link Runtime library/
        )
    })
})

//RV64's stand-in has the real startup code's shape: it calls the .init_array entries, which are a
//C++ program's global constructors, before main
provideRuntimeLibrary('v1', 'RISC-V-64', {
    abi: 'v1',
    target: 'riscv64',
    compiler: 'test',
    members: {
        '@runtime/v1/crt0.s':
            '.text\n.globl _start\n_start:\nandi sp,sp,-16\nlui s0,%hi(__init_array_start)\naddi s0,s0,%lo(__init_array_start)\nlui s1,%hi(__init_array_end)\naddi s1,s1,%lo(__init_array_end)\n1:\nbeq s0,s1,2f\nld t0,0(s0)\naddi s0,s0,8\njalr t0\nj 1b\n2:\ncall main\nli a7,93\necall\n'
    },
    index: { _start: '@runtime/v1/crt0.s' },
    memberSources: {}
})

describe('a Build whose program has a global constructor', () => {
    const program = `.text
.globl main
main:
    mv a0,s2
    ret
construct:
    li s2,42
    ret
.section .init_array,"aw"
.align 3
.dword construct
`
    const constructed: BuildSources = {
        ...sources,
        files: { 'main.s': { encoding: 'plain', content: program } }
    }

    it('starts in the constructor, the first of its own code to run', async () => {
        const emulator = RISCVEmulator(constructed, { language: 'RISC-V-64' })
        await emulator.check()
        await emulator.compile(200_000, constructed)
        expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
        expect(emulator.canUndo).toBe(false)
        await emulator.step()
        //returning into the startup code runs on into main
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 4 })
        await emulator.run(1_000)
        expect(emulator.terminated).toBe(true)
        expect(BigInt(emulator.registers.find((r) => r.name === 'a0')!.value)).toBe(42n)
        emulator.dispose()
    })
})

const mipsMembers = {
    '@runtime/v1/crt0.s':
        '.text\n.globl _start\n_start:\njal main\nmove $a0,$v0\nli $v0,17\nsyscall\n',
    '@runtime/v1/count.s':
        '.text\n.globl count\ncount:\nmove $t0,$a0\n1:\naddiu $t0,$t0,-1\nbnez $t0,1b\nsll $v0,$a0,1\njr $ra\n',
    '@runtime/v1/puts.s':
        '.text\n.globl puts\nputs:\nmove $a1,$a0\nli $a2,0\n1:\naddu $t0,$a1,$a2\nlbu $t0,0($t0)\nbeqz $t0,2f\naddiu $a2,$a2,1\nb 1b\n2:\nli $a0,1\nli $v0,15\nsyscall\njr $ra\n'
}
provideRuntimeLibrary('v1', 'MIPS', {
    abi: 'v1',
    target: 'mips',
    compiler: 'test',
    members: mipsMembers,
    index: {
        _start: '@runtime/v1/crt0.s',
        count: '@runtime/v1/count.s',
        puts: '@runtime/v1/puts.s'
    },
    memberSources: {}
})

const MIPS_PROGRAM = `.text
.globl main
main:
    addiu $sp,$sp,-24
    sw $ra,20($sp)
    li $a0,500
    jal count
    move $s0,$v0
    la $a0,message
    jal puts
    lw $ra,20($sp)
    addiu $sp,$sp,24
    move $v0,$zero
    jr $ra
.data
message: .string "linked\\n"
`

describe('a MIPS Build that links the Runtime library', () => {
    const compiled: BuildSources = {
        files: { 'main.s': { encoding: 'plain', content: MIPS_PROGRAM } },
        entry: 'main.s',
        assemblerProfile: 'gnu-compiler-v1',
        runtimeAbi: 'v1',
        entrySymbol: '_start'
    }
    async function buildMips(sources: BuildSources) {
        const emulator = MIPSEmulator(sources)
        await emulator.check()
        await emulator.compile(200_000, sources)
        return emulator
    }

    it('starts in main, steps over a library call at once and undoes it as one', async () => {
        const emulator = await buildMips(compiled)
        expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(Object.keys(emulator.buildLibraryFiles ?? {}).sort()).toEqual([
            '@runtime/v1/count.s',
            '@runtime/v1/crt0.s',
            '@runtime/v1/puts.s'
        ])
        //the Build ran the library's startup code into main, where the history begins
        expect(at(emulator)).toEqual({ file: 'main.s', line: 4 })
        expect(emulator.canUndo).toBe(false)
        for (let i = 0; i < 3; i++) await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
        await emulator.step()
        expect(at(emulator)).toEqual({ file: 'main.s', line: 8 })
        expect(emulator.latestSteps[0].stretch).toEqual({
            library: 'count',
            instructions: expect.any(Number)
        })
        expect(emulator.undo(1)).toBe(1)
        expect(at(emulator)).toEqual({ file: 'main.s', line: 7 })
        expect(BigInt(emulator.registers.find((r) => r.name === '$a0')!.value)).toBe(500n)
        await emulator.step()
        await emulator.step()
        expect(BigInt(emulator.registers.find((r) => r.name === '$s0')!.value)).toBe(1000n)
    })

    it('runs to the end with the library writing to the Terminal', async () => {
        const emulator = await buildMips(compiled)
        await emulator.run(1_000_000)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('linked')
    })

    it('links MARS assembly with the Setting on, which keeps its own start', async () => {
        const manual: BuildSources = {
            files: {
                'main.asm': {
                    encoding: 'plain',
                    content:
                        '.data\nmsg: .asciiz "hand-written\\n"\n.text\n.globl main\nmain:\nla $a0,msg\njal puts\nli $v0,10\nsyscall\n'
                }
            },
            entry: 'main.asm',
            runtimeAbi: 'v1'
        }
        const emulator = await buildMips(manual)
        expect(emulator.compilerDiagnostics.filter((d) => d.severity === 'error')).toEqual([])
        expect(at(emulator)).toEqual({ file: 'main.asm', line: 6 })
        await emulator.run(1_000_000)
        expect(emulator.terminated).toBe(true)
        expect(emulator.stdOut).toContain('hand-written')
    })

    it('explains an undefined library function when the Build does not link it', async () => {
        const manual: BuildSources = {
            files: { 'main.asm': { encoding: 'plain', content: '.text\nmain:\njal puts\n' } },
            entry: 'main.asm'
        }
        const emulator = MIPSEmulator(manual)
        const diagnostics = await emulator.check()
        expect(diagnostics.find((d) => d.severity === 'error')?.hint).toMatch(
            /Link Runtime library/
        )
    })
})
