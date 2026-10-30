import { describe, expect, it } from 'vite-plus/test'
import { normalizeBuildInput } from '#lib/projectFiles.ts'
import { languageDiagnosticToDiagnostic } from '../diagnosticBridge'
import { analyzeM68kProject } from './m68kAdapter'

describe('M68K Project analysis', () => {
    it('keeps the fixes the Core suggests, so checking as you type offers them too', () => {
        const sources = normalizeBuildInput({
            entry: 'main.m68k',
            files: {
                'main.m68k': { encoding: 'plain', content: '    org $1000\n    extb.l d0\n' }
            }
        })
        const [refused] = analyzeM68kProject(sources, 'test-session', 1).diagnostics
        expect(refused.code).toBe('needs_a_later_processor')
        //zero-based in the Worker's terms, one-based once in the editor's
        expect(refused.fixes?.[0]).toEqual({
            title: 'Add `opt p=68020` at the top of the program',
            location: {
                path: 'main.m68k',
                range: { start: { line: 0, column: 0 }, end: { line: 0, column: 0 } }
            },
            text: '    opt p=68020\n'
        })
        //what the Worker posts is cloned, and the editor's diagnostic still carries the fixes
        const [posted] = structuredClone([refused])
        expect(languageDiagnosticToDiagnostic(posted).fixes?.map((fix) => fix.title)).toEqual([
            'Add `opt p=68020` at the top of the program',
            'Write `ext.w d0` and `ext.l d0`'
        ])
    })

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
        //nothing was assembled, so the processor is unknown
        expect(none.m68kDialect).toBeUndefined()
        expect(missing.m68kDialect).toBeUndefined()
    })

    //the Documentation panel and completion follow it (m68k-machine.md, decision 36)
    it('says the processor the program chose, with an error in the code too', () => {
        const dialect = (content: string) =>
            analyzeM68kProject(
                normalizeBuildInput({
                    entry: 'main.m68k',
                    files: { 'main.m68k': { encoding: 'plain', content } }
                }),
                'dialect',
                1
            )
        expect(dialect('    simhalt').m68kDialect).toEqual({ processor: '68000', bitFields: false })
        expect(dialect('    opt bit\n    simhalt').m68kDialect).toEqual({
            processor: '68000',
            bitFields: true
        })
        const broken = dialect('    opt p=68010\n    move.l #1\n')
        expect(broken.diagnostics.some((diagnostic) => diagnostic.severity === 'error')).toBe(true)
        expect(broken.m68kDialect).toEqual({ processor: '68010', bitFields: false })
        //what the Worker posts is cloned, and the dialect goes with it
        expect(structuredClone(dialect('    opt p=68020\n    extb').m68kDialect)).toEqual({
            processor: '68020',
            bitFields: true
        })
    })
})
