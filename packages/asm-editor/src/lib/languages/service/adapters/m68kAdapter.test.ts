import { describe, expect, it } from 'vite-plus/test'
import { normalizeBuildInput } from '#lib/projectFiles.ts'
import { analyzeM68kProject } from './m68kAdapter'

describe('M68K Project analysis', () => {
    it('checks included Files and distinguishes an unreachable text File', () => {
        const sources = normalizeBuildInput({
            entry: 'a.m68k',
            files: {
                'a.m68k': {
                    encoding: 'plain',
                    content: 'start: include "b.m68k"\n    simhalt'
                },
                'b.m68k': { encoding: 'plain', content: 'start: dc.w 1' },
                'c.m68k': { encoding: 'plain', content: 'unused: move.w #1' }
            }
        })

        const snapshot = analyzeM68kProject(sources, 'test-session', 3)

        expect(snapshot.revision).toBe(3)
        expect(snapshot.fileStatus).toEqual({
            'a.m68k': 'assembled',
            'b.m68k': 'assembled',
            'c.m68k': 'not-reachable'
        })
        expect(snapshot.diagnostics).toContainEqual(
            expect.objectContaining({
                code: 'symbol_already_defined',
                location: expect.objectContaining({ path: 'b.m68k' })
            })
        )
        expect(snapshot.symbols.map((symbol) => symbol.name)).toEqual(
            expect.arrayContaining(['start', 'unused'])
        )
    })

    it('reports sources that cannot be resolved as the one error, as Build does', () => {
        const problem = 'This Project has no program.'
        const none = analyzeM68kProject(
            normalizeBuildInput({
                entry: 'main.m68k',
                //a File that would assemble, which a Project with no Program does not check
                files: { 'main.m68k': { encoding: 'plain', content: '    move.l #1, nope' } },
                assemblyError: problem
            }),
            'no-program',
            1
        )
        expect(none.diagnostics).toEqual([
            expect.objectContaining({ severity: 'error', message: problem })
        ])
        const missing = analyzeM68kProject(
            normalizeBuildInput({
                entry: 'gone.m68k',
                files: { 'main.m68k': { encoding: 'plain', content: '    simhalt' } }
            }),
            'missing-entry',
            1
        )
        expect(missing.diagnostics).toEqual([
            expect.objectContaining({
                message: 'Entry file not found: gone.m68k',
                location: expect.objectContaining({ path: 'gone.m68k' })
            })
        ])
    })
})
