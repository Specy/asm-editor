import { describe, expect, it } from 'vitest'
import { normalizeBuildInput } from '$lib/projectFiles'
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
})
