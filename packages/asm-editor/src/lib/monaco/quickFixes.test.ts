import { describe, expect, it } from 'vite-plus/test'
import { S68k } from '@specy/s68k'
import type monaco from 'monaco-editor'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { m68kAssemblyFiles } from '#lib/languages/M68K/m68kAssemblyFiles.ts'
import { s68kDiagnosticToDiagnostic } from '#lib/languages/M68K/m68kDiagnostics.ts'
import { normalizeBuildInput, type BuildSources } from '#lib/projectFiles.ts'
import type { MonacoType } from './Monaco'
import {
    createQuickFixProvider,
    quickFixActions,
    quickFixRange,
    setModelQuickFixes,
    type MarkerQuickFixes
} from './quickFixes'

function sourcesOf(files: Record<string, string>, entry = Object.keys(files)[0]): BuildSources {
    return normalizeBuildInput({
        entry,
        files: Object.fromEntries(
            Object.entries(files).map(([path, content]) => [
                path,
                { encoding: 'plain' as const, content }
            ])
        )
    })
}

function diagnosticsOf(sources: BuildSources): Diagnostic[] {
    const result = S68k.assemble({ files: m68kAssemblyFiles(sources), entry: sources.entry })
    result.program?.dispose()
    return result.diagnostics.map((diagnostic) => s68kDiagnosticToDiagnostic(diagnostic, sources))
}

/** Applies a Monaco range edit to text the way a model would: one-based lines and columns. */
function applyEdit(text: string, range: monaco.IRange, replacement: string): string {
    const lines = text.split('\n')
    const offset = (line: number, column: number) =>
        lines.slice(0, line - 1).reduce((sum, l) => sum + l.length + 1, 0) + column - 1
    const start = offset(range.startLineNumber, range.startColumn)
    const end = offset(range.endLineNumber, range.endColumn)
    return text.slice(0, start) + replacement + text.slice(end)
}

function assembles(text: string): { processor?: string; errors: string[] } {
    const result = S68k.assemble(text)
    try {
        return {
            processor: result.program?.getProcessor(),
            errors: result.diagnostics.filter((d) => d.severity === 'error').map((d) => d.code)
        }
    } finally {
        result.program?.dispose()
    }
}

type FakeModel = monaco.editor.ITextModel & { edit(): void }

function fakeModel(uri: string): FakeModel {
    let version = 1
    return {
        uri: { toString: () => uri },
        getVersionId: () => version,
        edit: () => void (version += 1)
    } as unknown as FakeModel
}

function fakeMonaco(models: FakeModel[]): MonacoType {
    return {
        editor: {
            getModel: (uri: monaco.Uri) =>
                models.find((model) => model.uri.toString() === uri.toString()) ?? null
        }
    } as unknown as MonacoType
}

function marker(line: number, message = 'refused'): monaco.editor.IMarkerData {
    return {
        severity: 8,
        message,
        code: 'needs_a_later_processor',
        startLineNumber: line,
        startColumn: 5,
        endLineNumber: line,
        endColumn: 14
    }
}

describe('quick fixes from the Core', () => {
    const program = '* A program.\n    org $1000\n    extb.l d0\n'

    it('carry the Core’s fixes onto the diagnostic, with one-based columns', () => {
        const [refused] = diagnosticsOf(sourcesOf({ 'main.m68k': program }))
        expect(refused.code).toBe('needs_a_later_processor')
        expect(refused.fixes).toEqual([
            {
                title: 'Add `opt p=68020` at the top of the program',
                file: 'main.m68k',
                lineIndex: 1,
                column: 1,
                endLineIndex: 1,
                endColumn: 1,
                text: '    opt p=68020\n'
            },
            {
                title: 'Write `ext.w d0` and `ext.l d0`',
                file: 'main.m68k',
                lineIndex: 2,
                column: 5,
                endLineIndex: 2,
                endColumn: 14,
                text: 'ext.w d0\n    ext.l d0'
            }
        ])
        expect(diagnosticsOf(sourcesOf({ 'main.m68k': '    move.w d0,#1' }))[0].fixes).toBe(
            undefined
        )
    })

    it('turn an empty range into an insertion and a range into a replacement', () => {
        const [refused] = diagnosticsOf(sourcesOf({ 'main.m68k': program }))
        const [opt, ext] = refused.fixes!
        expect(quickFixRange(opt)).toEqual({
            startLineNumber: 2,
            startColumn: 1,
            endLineNumber: 2,
            endColumn: 1
        })
        expect(quickFixRange(ext)).toEqual({
            startLineNumber: 3,
            startColumn: 5,
            endLineNumber: 3,
            endColumn: 14
        })
    })

    it('make the program build when applied, for the 68020 or as the 68000 writes it', () => {
        const [refused] = diagnosticsOf(sourcesOf({ 'main.m68k': program }))
        const [opt, ext] = refused.fixes!
        const for68020 = applyEdit(program, quickFixRange(opt), opt.text)
        expect(for68020).toBe('* A program.\n    opt p=68020\n    org $1000\n    extb.l d0\n')
        expect(assembles(for68020)).toEqual({ processor: '68020', errors: [] })
        //the text carries its own line break and indentation for the second instruction
        const for68000 = applyEdit(program, quickFixRange(ext), ext.text)
        expect(for68000).toBe('* A program.\n    org $1000\n    ext.w d0\n    ext.l d0\n')
        expect(assembles(for68000)).toEqual({ processor: '68000', errors: [] })
    })

    it('replace a word in place: the processor of an `opt` line, `ccr` with `sr`', () => {
        const for68010 = '    opt p=68010\n    org $1000\n    extb.l d0\n'
        const [refused] = diagnosticsOf(sourcesOf({ 'main.m68k': for68010 }))
        const change = refused.fixes![0]
        expect(change.title).toBe('Change `opt p=68010` to `opt p=68020`')
        const changed = applyEdit(for68010, quickFixRange(change), change.text)
        expect(changed).toBe('    opt p=68020\n    org $1000\n    extb.l d0\n')
        expect(assembles(changed)).toEqual({ processor: '68020', errors: [] })

        const ccr = '    org $1000\n    move.w ccr,(a0)\n'
        const [later] = diagnosticsOf(sourcesOf({ 'main.m68k': ccr }))
        expect(later.fixes!.map((fix) => fix.title)).toEqual([
            'Add `opt p=68010` at the top of the program',
            'Write `move.w sr,(a0)`'
        ])
        const sr = later.fixes![1]
        const written = applyEdit(ccr, quickFixRange(sr), sr.text)
        expect(written).toBe('    org $1000\n    move.w sr,(a0)\n')
        expect(assembles(written)).toEqual({ processor: '68000', errors: [] })
    })

    it('point a fix into the entry File when the instruction is in an included one', () => {
        const sources = sourcesOf(
            {
                'main.x68': '    org $1000\n    include "lib.x68"\n',
                'lib.x68': '* lib\n    extb.l d0\n'
            },
            'main.x68'
        )
        const [refused] = diagnosticsOf(sources)
        expect(refused.file).toBe('lib.x68')
        expect(refused.fixes!.map((fix) => fix.file)).toEqual(['main.x68', 'lib.x68'])
    })

    it('delete an `opt` line that comes after the first instruction, which chooses nothing', () => {
        const late = '    org $1000\n    nop\n    opt p=68020\n    extb.l d0\n'
        const [after, refused] = diagnosticsOf(sourcesOf({ 'main.m68k': late }))
        expect(after.code).toBe('processor_chosen_after_code')
        const [remove] = after.fixes!
        expect(remove).toMatchObject({ title: 'Delete `opt p=68020`', text: '' })
        expect(quickFixRange(remove)).toEqual({
            startLineNumber: 3,
            startColumn: 1,
            endLineNumber: 3,
            endColumn: 16
        })
        //with the `extb.l`'s own fix, in either order, the program assembles for the 68020
        const [opt] = refused.fixes!
        const deleted = applyEdit(late, quickFixRange(remove), remove.text)
        expect(deleted).toBe('    org $1000\n    nop\n\n    extb.l d0\n')
        const both = applyEdit(deleted, quickFixRange(opt), opt.text)
        expect(assembles(both)).toEqual({ processor: '68020', errors: [] })
        const other = applyEdit(late, quickFixRange(opt), opt.text)
        const [again] = diagnosticsOf(sourcesOf({ 'main.m68k': other }))
        expect(again.code).toBe('processor_chosen_after_code')
        const [removeAgain] = again.fixes!
        expect(assembles(applyEdit(other, quickFixRange(removeAgain), removeAgain.text))).toEqual({
            processor: '68020',
            errors: []
        })
    })
})

describe('the quick fix provider', () => {
    function fixesFor(model: FakeModel, other?: FakeModel): MarkerQuickFixes[] {
        return [
            {
                marker: marker(3),
                fixes: [
                    {
                        title: 'Add `opt p=68020` at the top of the program',
                        resource: (other ?? model).uri,
                        range: {
                            startLineNumber: 1,
                            startColumn: 1,
                            endLineNumber: 1,
                            endColumn: 1
                        },
                        text: '    opt p=68020\n'
                    },
                    {
                        title: 'Write `ext.w d0` and `ext.l d0`',
                        resource: model.uri,
                        range: {
                            startLineNumber: 3,
                            startColumn: 5,
                            endLineNumber: 3,
                            endColumn: 14
                        },
                        text: 'ext.w d0\n    ext.l d0'
                    }
                ]
            }
        ]
    }

    it('offers the fixes of the marker asked about, the Core’s first preferred', () => {
        const model = fakeModel('file:///main')
        const current = fakeMonaco([model])
        setModelQuickFixes(current, model, 'M68K', fixesFor(model))
        const actions = quickFixActions(current, model, [{ ...marker(3), owner: 'M68K' } as never])
        //Monaco's menu shows a title as plain text, so the Core's Markdown backticks are left out
        expect(actions.map((action) => [action.title, action.kind, action.isPreferred])).toEqual([
            ['Add opt p=68020 at the top of the program', 'quickfix', true],
            ['Write ext.w d0 and ext.l d0', 'quickfix', false]
        ])
        expect(actions[0].edit?.edits).toEqual([
            {
                resource: model.uri,
                textEdit: {
                    range: { startLineNumber: 1, startColumn: 1, endLineNumber: 1, endColumn: 1 },
                    text: '    opt p=68020\n'
                },
                versionId: undefined
            }
        ])
        //another marker, or the same one of another owner, has none
        expect(quickFixActions(current, model, [marker(3, 'other')])).toEqual([])
        expect(quickFixActions(current, model, [{ ...marker(3), owner: 'x86' } as never])).toEqual(
            []
        )
    })

    it('offers nothing once the text has changed since the markers were set', () => {
        const model = fakeModel('file:///main')
        const current = fakeMonaco([model])
        setModelQuickFixes(current, model, 'M68K', fixesFor(model))
        model.edit()
        expect(quickFixActions(current, model, [marker(3)])).toEqual([])
        //the markers set for the new text bring their fixes back
        setModelQuickFixes(current, model, 'M68K', fixesFor(model))
        expect(quickFixActions(current, model, [marker(3)])).toHaveLength(2)
        setModelQuickFixes(current, model, 'M68K', [])
        expect(quickFixActions(current, model, [marker(3)])).toEqual([])
    })

    it('leaves out a fix into a File with no model, or one changed since', () => {
        const model = fakeModel('file:///lib')
        const entry = fakeModel('file:///main')
        const withoutEntry = fakeMonaco([model])
        setModelQuickFixes(withoutEntry, model, 'M68K', fixesFor(model, entry))
        expect(quickFixActions(withoutEntry, model, [marker(3)]).map((a) => a.title)).toEqual([
            'Write ext.w d0 and ext.l d0'
        ])

        const both = fakeMonaco([model, entry])
        setModelQuickFixes(both, model, 'M68K', fixesFor(model, entry))
        expect(quickFixActions(both, model, [marker(3)])).toHaveLength(2)
        entry.edit()
        expect(quickFixActions(both, model, [marker(3)]).map((a) => a.title)).toEqual([
            'Write ext.w d0 and ext.l d0'
        ])
    })

    it('answers only a request for quick fixes', async () => {
        const model = fakeModel('file:///main')
        const current = fakeMonaco([model])
        setModelQuickFixes(current, model, 'M68K', fixesFor(model))
        const provider = createQuickFixProvider(current)
        const ask = async (only?: string) =>
            (
                await provider.provideCodeActions(
                    model,
                    {} as never,
                    { markers: [marker(3)], only, trigger: 1 },
                    {} as never
                )
            )?.actions.length
        expect(await ask()).toBe(2)
        expect(await ask('quickfix')).toBe(2)
        expect(await ask('refactor')).toBe(0)
    })
})
