import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import type { ProjectFile } from '#lib/projectFiles.ts'
import { firstProgramEntry, startsProgram } from './firstProgram'

//relative to the package, where the tests run
const crackme: ProjectFile = {
    encoding: 'base64',
    content: readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')
}
const text: ProjectFile = { encoding: 'plain', content: 'nop' }

describe('the first Program of a Project without one', () => {
    it('makes itself from assembly by its extension, in any case, and never from .inc, no extension or C', () => {
        for (const path of [
            'main.s',
            'src/sort.asm',
            'a.mips',
            'a.riscv',
            'a.m68k',
            'a.z80',
            'MAIN.S'
        ])
            expect(startsProgram(path, text, 'MIPS'), path).toBe(true)
        for (const path of ['macros.inc', 'main', 'main.c', 'main.cpp', 'value.h', 'notes.txt'])
            expect(startsProgram(path, text, 'MIPS'), path).toBe(false)
        //a File stored as bytes is no assembly, whatever its name
        expect(startsProgram('blob.s', { encoding: 'base64', content: 'AQID' }, 'MIPS')).toBe(false)
    })

    it('makes itself from a supported Executable in an x86 Project alone', () => {
        expect(startsProgram('crackme', crackme, 'X86')).toBe(true)
        expect(startsProgram('crackme', crackme, 'MIPS')).toBe(false)
        expect(startsProgram('data.bin', { encoding: 'base64', content: 'AQID' }, 'X86')).toBe(
            false
        )
    })

    it('takes main.<ext>, else the only qualifying File, else none', () => {
        const qualifies = (path: string) => startsProgram(path, text, 'RISC-V')
        expect(firstProgramEntry(['bubble.s', 'main.s', 'notes.txt'], qualifies)).toBe('main.s')
        expect(firstProgramEntry(['src/main.riscv', 'quick.s'], qualifies)).toBe('src/main.riscv')
        expect(firstProgramEntry(['notes.txt', 'sort.s', 'macros.inc'], qualifies)).toBe('sort.s')
        //choosing between two would be a guess
        expect(firstProgramEntry(['bubble.s', 'quick.s'], qualifies)).toBeUndefined()
        expect(firstProgramEntry(['main.s', 'lib/main.s'], qualifies)).toBeUndefined()
        expect(firstProgramEntry(['main.c', 'macros.inc', 'main'], qualifies)).toBeUndefined()
        expect(firstProgramEntry([], qualifies)).toBeUndefined()
        //the same path twice is one File
        expect(firstProgramEntry(['sort.s', 'sort.s'], qualifies)).toBe('sort.s')
    })
})
