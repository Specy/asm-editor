import { describe, expect, it } from 'vitest'
import { normalizeBuildInput } from '$lib/projectFiles'
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
})
