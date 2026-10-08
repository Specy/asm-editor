import { describe, expect, it } from 'vitest'
import type { ProjectFiles } from '$lib/projectFiles'
import { fileFingerprint, type CompilationRecord, type CompilationSourceMap } from './records'
import {
    blockEntryLines,
    coreBreakpoints,
    currentSourceMaps,
    mappedBreakpoints,
    type CurrentSourceMap
} from './sourceBreakpoints'

const c = (line: number) => ({ path: 'main.c', line })

/** `for (i = 0; i < n; i++) sum += i;` at -O0: the header's init, increment and test are apart. */
const loop: CompilationSourceMap = {
    sourcePath: 'main.c',
    outputFingerprint: '',
    lines: [
        null, //main:
        c(3), //init
        null, //.cfi directive
        c(3), //j .L2
        null, //.L3:
        c(4), //body
        c(4),
        c(3), //increment
        null, //.L2:
        c(3), //test
        c(3), //blt .L3
        { path: 'values.h', line: 0 },
        c(5)
    ]
}
const maps: CurrentSourceMap[] = [{ outputPath: 'main.c.riscv', map: loop }]

describe('source breakpoints', () => {
    it('enters a line at the first instruction of each of its blocks', () => {
        expect(blockEntryLines(loop, c(3))).toEqual([1, 7])
        expect(blockEntryLines(loop, c(4))).toEqual([5])
        expect(blockEntryLines(loop, { path: 'values.h', line: 0 })).toEqual([11])
        expect(blockEntryLines(loop, c(9))).toEqual([])
    })
    it('expands source breakpoints into assembly breakpoints', () => {
        expect(
            mappedBreakpoints(
                [
                    { file: 'main.c', line: 3 },
                    { file: 'main.c.riscv', line: 12 }
                ],
                maps,
                'RISC-V'
            )
        ).toEqual([
            { file: 'main.c.riscv', line: 1 },
            { file: 'main.c.riscv', line: 7 }
        ])
    })
    it('gives the Core assembly breakpoints only, without duplicates', () => {
        expect(
            coreBreakpoints(
                [
                    { file: 'main.c.riscv', line: 5 },
                    { file: 'main.c', line: 4 },
                    { file: 'values.h', line: 0 },
                    { file: 'notes.c', line: 1 }
                ],
                maps,
                'RISC-V'
            )
        ).toEqual([
            { file: 'main.c.riscv', line: 5 },
            { file: 'main.c.riscv', line: 11 }
        ])
    })
    it('expands only through maps that describe the Files', () => {
        const files: ProjectFiles = {
            'main.c': { encoding: 'plain', content: 'int main(void) {}' },
            'main.c.riscv': { encoding: 'plain', content: 'main:\n  ret' }
        }
        const map = { ...loop, outputFingerprint: fileFingerprint(files['main.c.riscv'])! }
        const record = {
            sourcePath: 'main.c',
            outputPath: 'main.c.riscv',
            target: 'RISC-V',
            language: 'c',
            compilerId: 'rv32-clang',
            optimization: '0',
            inputs: { 'main.c': fileFingerprint(files['main.c'])! },
            outputFingerprint: map.outputFingerprint
        } as CompilationRecord
        const sourceMaps = { 'main.c.riscv': map }
        expect(currentSourceMaps(sourceMaps, [record], files, 'RISC-V')).toEqual([
            { outputPath: 'main.c.riscv', map }
        ])
        const edited = { ...files, 'main.c': { encoding: 'plain', content: '' } } as ProjectFiles
        expect(currentSourceMaps(sourceMaps, [record], edited, 'RISC-V')).toEqual([])
        expect(currentSourceMaps({}, [record], files, 'RISC-V')).toEqual([])
    })
})
