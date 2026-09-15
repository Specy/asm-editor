import { describe, expect, it } from 'vitest'
import { normalizeBuildInput } from '$lib/projectFiles'
import { analyzeMarsProject } from './marsAdapter'

const sources = (instruction: string) =>
    normalizeBuildInput({
        entry: 'main.s',
        files: {
            'main.s': { encoding: 'plain', content: `.text\n${instruction}` },
            'unused.s': { encoding: 'plain', content: 'unused: nop' }
        }
    })

describe('MIPS/RISC-V Project analysis adapter', () => {
    it('keeps MIPS diagnostics File-aware and reports unreachable Files', () => {
        const snapshot = analyzeMarsProject(sources('definitely_invalid'), 'mips-test', 2, 'MIPS')
        expect(snapshot.target).toBe('MIPS')
        expect(snapshot.fileStatus['unused.s']).toBe('not-reachable')
        expect(snapshot.diagnostics).toContainEqual(
            expect.objectContaining({
                source: 'mips',
                severity: 'error',
                location: expect.objectContaining({ path: 'main.s' })
            })
        )
    })

    it('isolates RV32 and RV64 instruction sets', () => {
        const rv32 = analyzeMarsProject(sources('ld t0,0(t1)'), 'rv32-test', 1, 'RISC-V')
        const rv64 = analyzeMarsProject(sources('ld t0,0(t1)'), 'rv64-test', 1, 'RISC-V-64')
        expect(rv32.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true)
        expect(rv64.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(false)
    })

    //the Project page squiggles from this snapshot whenever it has Files, so the spans the Emulator
    //adapters read out of the Core have to reach Monaco through here too
    it.each(['MIPS', 'RISC-V'] as const)(
        'spans the whole token a %s diagnostic points at',
        (target) => {
            const snapshot = analyzeMarsProject(
                normalizeBuildInput({
                    entry: 'main.s',
                    files: {
                        'main.s': {
                            encoding: 'plain',
                            content: '.data\n    a: .half 500000\n.text\nmain:\n\n    mov\n'
                        }
                    }
                }),
                'span-test',
                1,
                target
            )
            //ranges are zero based and end exclusive: `500000` is columns 13 to 19, `mov` 4 to 7.
            //MARS quotes the literal in its message and RARS spells the truncated value in
            //hexadecimal, so the out-of-range warning is found by the words they share
            const range = (needle: string) =>
                snapshot.diagnostics.find((diagnostic) => diagnostic.message.includes(needle))
                    ?.location.range
            expect(range('out-of-range')).toEqual({
                start: { line: 1, column: 13 },
                end: { line: 1, column: 19 }
            })
            expect(range('mov')).toEqual({
                start: { line: 5, column: 4 },
                end: { line: 5, column: 7 }
            })
        }
    )

    it('preserves label-aware screen directive warnings', () => {
        const snapshot = analyzeMarsProject(
            normalizeBuildInput({
                entry: 'main.s',
                files: {
                    'main.s': {
                        encoding: 'plain',
                        content: '# @screen base=missing\n.text\nnop'
                    }
                }
            }),
            'screen-test',
            1,
            'MIPS'
        )
        expect(snapshot.diagnostics).toContainEqual(
            expect.objectContaining({
                severity: 'warning',
                location: expect.objectContaining({ path: 'main.s' }),
                message: expect.stringContaining('No label named "missing"')
            })
        )
    })
})
