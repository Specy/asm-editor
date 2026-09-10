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
