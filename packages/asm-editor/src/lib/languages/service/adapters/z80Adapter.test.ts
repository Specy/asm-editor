import { describe, expect, it } from 'vite-plus/test'
import { normalizeBuildInput } from '#lib/projectFiles.ts'
import { analyzeZ80Project } from './z80Adapter'

describe('Z80 Project analysis adapter', () => {
    it('extracts File-aware definitions and references from included Files', () => {
        const sources = normalizeBuildInput({
            entry: 'main.asm',
            files: {
                'main.asm': { encoding: 'plain', content: 'start: jp target\n#include "lib.asm"' },
                'lib.asm': { encoding: 'plain', content: 'target: nop\nvalue equ 3\n ld a,value' },
                'unused.asm': { encoding: 'plain', content: 'unused: nop' }
            }
        })
        const snapshot = analyzeZ80Project(sources, 'z80-test', 7)

        expect(snapshot.target).toBe('Z80')
        expect(snapshot.fileStatus).toEqual({
            'main.asm': 'assembled',
            'lib.asm': 'assembled',
            'unused.asm': 'not-reachable'
        })
        expect(snapshot.symbols).toContainEqual(
            expect.objectContaining({
                name: 'target',
                value: 3,
                renameable: true,
                location: expect.objectContaining({ path: 'lib.asm' })
            })
        )
        expect(snapshot.occurrences).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    name: 'target',
                    role: 'reference',
                    location: expect.objectContaining({ path: 'main.asm' })
                }),
                expect.objectContaining({
                    name: 'value',
                    role: 'reference',
                    location: expect.objectContaining({ path: 'lib.asm' })
                })
            ])
        )
    })

    it('maps diagnostics to their Project File', () => {
        const sources = normalizeBuildInput({
            entry: 'main.asm',
            files: {
                'main.asm': { encoding: 'plain', content: '#include "lib.asm"' },
                'lib.asm': { encoding: 'plain', content: ' definitely_not_an_opcode' }
            }
        })
        const snapshot = analyzeZ80Project(sources, 'z80-test', 1)
        expect(snapshot.diagnostics).toContainEqual(
            expect.objectContaining({
                source: 'z80',
                location: expect.objectContaining({ path: 'lib.asm' })
            })
        )
    })

    it('reports sources that cannot be resolved as the one error, as Build does', () => {
        const problem = 'This Project has no program.'
        const none = analyzeZ80Project(
            normalizeBuildInput({
                entry: 'main.z80',
                files: { 'main.z80': { encoding: 'plain', content: ' ld a,nope' } },
                assemblyError: problem
            }),
            'no-program',
            1
        )
        expect(none.diagnostics).toEqual([
            expect.objectContaining({ severity: 'error', message: problem })
        ])
        const missing = analyzeZ80Project(
            normalizeBuildInput({
                entry: 'gone.z80',
                files: { 'main.z80': { encoding: 'plain', content: ' nop' } }
            }),
            'missing-entry',
            1
        )
        expect(missing.diagnostics).toEqual([
            expect.objectContaining({
                message: 'Entry file not found: gone.z80',
                location: expect.objectContaining({ path: 'gone.z80' })
            })
        ])
    })
})
