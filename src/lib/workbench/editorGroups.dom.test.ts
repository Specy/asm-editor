import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { compileProjectSource } from '$lib/sourceCompilation/compileProjectSource'
import { fileFingerprint } from '$lib/sourceCompilation/records'
import { fileTransfer } from './__fixtures__/fileTransfer'
import type { Diagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
import { X86_START_UNIT } from '$lib/languages/X86/x86StartUnit'
import { CompilationFailedError } from '$lib/languages/BaseEmulator.svelte'

vi.mock('$lib/sourceCompilation/compileProjectSource', () => ({ compileProjectSource: vi.fn() }))

const disposers: (() => void)[] = []
function setup(language?: 'X86') {
    const fixture = editorGroupsFixture(language)
    disposers.push(fixture.dispose)
    flushSync()
    return fixture
}
function openSecond(session: ReturnType<typeof editorGroupsFixture>['session'], path: string) {
    const other = session.splitEditor()
    session.selectFile(path, other)
    return other
}
function result(
    fixture: ReturnType<typeof setup>,
    path = 'main.c',
    target: 'X86' | 'RISC-V' = 'RISC-V'
) {
    const record = {
        sourcePath: path,
        outputPath: 'main.s',
        target,
        language: 'c' as const,
        compilerId: 'gcc',
        optimization: '0' as const,
        inputs: {
            [path]: fileFingerprint(fixture.project.files[path])!,
            'value.h': fileFingerprint(fixture.project.files['value.h'])!
        },
        outputFingerprint: fileFingerprint(fixture.project.files['main.s'])!
    }
    const map = {
        sourcePath: path,
        outputFingerprint: record.outputFingerprint,
        lines: [null, { path, line: 0 }]
    }
    fixture.project.recordCompilation(record, map)
    return { record, map, assembly: fixture.project.files['main.s'].content, diagnostics: [] }
}
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    vi.resetAllMocks()
})

describe('independent editor groups', () => {
    it('splits a single tab into an empty second pane', () => {
        const { session } = setup()
        const left = session.groups[0]
        const right = session.splitEditor()
        expect(session.groups).toEqual([left, right])
        expect(left.tabs.paths).toEqual(['main.c'])
        expect(left.displayedPath).toBe('main.c')
        expect(right.tabs.paths).toEqual([])
        expect(right.displayedPath).toBe('')
        session.closeGroup(right)
        expect(session.groups).toEqual([left])
    })
    it('moves the shown File to the second pane when splitting several tabs', () => {
        const { session } = setup()
        const left = session.groups[0]
        session.selectFile('other.c', left)
        const right = session.splitEditor()
        expect(left.tabs.paths).toEqual(['main.c'])
        expect(left.displayedPath).toBe('main.c')
        expect(right.tabs.paths).toEqual(['other.c'])
        expect(right.displayedPath).toBe('other.c')
    })
    it('routes source and assembly files to matching panes in reversed order', () => {
        const { session } = setup()
        const left = session.groups[0],
            right = openSecond(session, 'main.s')
        session.selectFile('main.s', left)
        session.selectFile('main.c', right)
        session.selectFile('other.c')
        expect(right.displayedPath).toBe('other.c')
        session.selectFile('value.h')
        expect(right.displayedPath).toBe('value.h')
        session.selectFile('next.s')
        expect(left.displayedPath).toBe('next.s')
    })
    it('routes all file opens left when both panes have the same type', () => {
        const { session } = setup()
        const left = session.groups[0],
            right = session.splitEditor()
        session.selectFile('main.c', right)
        session.selectFile('other.c')
        expect(left.displayedPath).toBe('other.c')
        expect(right.displayedPath).toBe('main.c')
        session.selectFile('main.s', left)
        session.selectFile('main.s', right)
        session.selectFile('value.h')
        expect(left.displayedPath).toBe('value.h')
        expect(right.displayedPath).toBe('main.s')
    })
    it('moves an inactive tab between panes without changing file bytes or maps', async () => {
        const fixture = setup(),
            { session, project } = fixture
        const left = session.groups[0],
            right = openSecond(session, 'main.s')
        session.selectFile('other.c', left)
        session.activateTab('main.c', left)
        result(fixture)
        const before = project.toObject(),
            map = project.sourceMaps['main.s']
        const transfer = fileTransfer(),
            event = { dataTransfer: transfer } as DragEvent
        session.startFileDrag(event, 'other.c', left)
        expect(session.canDropFile(event)).toBe(true)
        await session.dropFile(event, right)
        expect(left.tabs.paths).toEqual(['main.c'])
        expect(right.tabs.paths).toEqual(['main.s', 'other.c'])
        expect(right.displayedPath).toBe('other.c')
        expect(project.toObject()).toEqual(before)
        expect(project.sourceMaps['main.s']).toBe(map)
        expect(session.draggedFile).toBeUndefined()
    })
    it('opens sidebar drops in the specified pane while keeping other tabs', async () => {
        const { session } = setup()
        const left = session.groups[0],
            right = openSecond(session, 'main.s')
        const event = { dataTransfer: fileTransfer() } as DragEvent
        session.startFileDrag(event, 'value.h')
        await session.dropFile(event, right)
        expect(left.displayedPath).toBe('main.c')
        expect(right.tabs.paths).toEqual(['main.s', 'value.h'])
    })
    it('opens a sidebar drop in a new pane on the right of the only one', async () => {
        const { session } = setup()
        const left = session.groups[0]
        const event = { dataTransfer: fileTransfer() } as DragEvent
        session.startFileDrag(event, 'value.h')
        expect(session.canSplitWithDrop()).toBe(true)
        await session.dropFileIntoSplit(event)
        expect(session.groups[0]).toBe(left)
        expect(left.tabs.paths).toEqual(['main.c'])
        expect(session.groups[1].tabs.paths).toEqual(['value.h'])
        expect(session.groups[1].displayedPath).toBe('value.h')
        expect(session.draggedFile).toBeUndefined()
    })
    it('splits by moving a dragged tab, but never the only tab', async () => {
        const { session } = setup()
        const left = session.groups[0]
        const only = { dataTransfer: fileTransfer() } as DragEvent
        session.startFileDrag(only, 'main.c', left)
        expect(session.canSplitWithDrop()).toBe(false)
        session.endFileDrag()
        session.selectFile('other.c', left)
        const event = { dataTransfer: fileTransfer() } as DragEvent
        session.startFileDrag(event, 'other.c', left)
        expect(session.canSplitWithDrop()).toBe(true)
        await session.dropFileIntoSplit(event)
        expect(left.tabs.paths).toEqual(['main.c'])
        expect(session.groups[1].tabs.paths).toEqual(['other.c'])
    })
    it('does not split a second time once two panes are open', () => {
        const { session } = setup()
        openSecond(session, 'main.s')
        const event = { dataTransfer: fileTransfer() } as DragEvent
        session.startFileDrag(event, 'value.h')
        expect(session.canSplitWithDrop()).toBe(false)
    })
    it('deduplicates a transferred tab and collapses its empty original pane', async () => {
        const { session, project } = setup()
        const left = session.groups[0],
            right = session.splitEditor()
        await session.transferTab('main.c', left, right)
        expect(session.groups).toEqual([right])
        expect(right.tabs.paths).toEqual(['main.c'])
        expect(project.files['main.c']).toBeDefined()
    })
    it('opens a second editor with the same Build version while debugging', async () => {
        const { session, emulator, project } = setup()
        emulator.buildSources = { files: project.files, entry: 'main.s' }
        emulator.canExecute = true
        await session.revealSourceLocation('main.s', 0)
        const source = openSecond(session, 'main.c')
        expect(source.sourceView).toBe('snapshot')
        expect(source.modelIdentity?.sourceKind).toBe('build')
        expect(source.editorDisabled).toBe(true)
    })
    it('routes file opens by type and closes the last tab without changing Project files', () => {
        const { session, project } = setup()
        const first = session.groups[0]
        const second = openSecond(session, 'main.s')
        session.selectFile('value.h')
        expect(first.tabs.paths).toEqual(['main.c', 'value.h'])
        expect(second.tabs.paths).toEqual(['main.s'])
        session.closeTab('main.s', second)
        expect(session.groups).toEqual([first])
        expect(session.groups[0]).toBe(first)
        session.closeTab('main.c', first)
        session.closeTab('value.h', first)
        expect(first.tabs.paths).toEqual([])
        expect(first.displayedPath).toBe('')
        expect(Object.keys(project.files)).toHaveLength(4)
    })
    it('invalidates only the mapping when a visible source is edited', () => {
        const fixture = setup(),
            { session } = fixture
        const first = session.groups[0],
            second = openSecond(session, 'main.s')
        result(fixture)
        flushSync()
        expect(session.mappingPair?.source).toBe(first)
        session.selectMappedLines(first, [0])
        expect(second.mappedLines).toEqual([1])
        session.fileEdited('main.c', first.displayedCode + '\n')
        flushSync()
        expect(session.mappingPair).toBeUndefined()
        expect(session.mappingSelection).toBeUndefined()
        expect(session.groups).toEqual([first, second])
        expect(second.compilationNotice).toContain('Stale assembly')
    })
    it('selects every section mapped to a set of lines in either pane', () => {
        const fixture = setup(),
            { session } = fixture
        const first = session.groups[0],
            second = openSecond(session, 'main.s')
        const { record, map } = result(fixture)
        fixture.project.recordCompilation(record, {
            ...map,
            lines: [
                { path: 'main.c', line: 0 },
                { path: 'main.c', line: 1 },
                null,
                { path: 'main.c', line: 0 },
                { path: 'value.h', line: 0 },
                { path: 'main.c', line: 2 }
            ]
        })
        flushSync()
        session.selectMappedLines(first, [0, 1])
        expect(first.mappedLines).toEqual([0, 1])
        expect(second.mappedLines).toEqual([0, 1, 3])
        const colors = session.mappingColors!.indices
        expect(session.activeMappingColors).toEqual(
            new Set([colors.get('main.c')!.get(0), colors.get('main.c')!.get(1)])
        )
        session.selectMappedLines(second, [2, 3, 4])
        expect(session.mappingSelection).toEqual([
            { path: 'main.c', line: 0 },
            { path: 'value.h', line: 0 }
        ])
        expect(first.mappedLines).toEqual([0])
        expect(second.mappedLines).toEqual([0, 3, 4])
        expect(session.activeMappingColors).toEqual(
            new Set([colors.get('main.c')!.get(0), colors.get('value.h')!.get(0)])
        )
        session.selectMappedLines(second, [2])
        expect(session.mappingSelection).toBeUndefined()
        expect(session.activeMappingColors).toBeUndefined()
    })
    it('stops a breakpoint on C source at the first instruction of each mapped block', () => {
        const fixture = setup(),
            { session } = fixture
        const first = session.groups[0],
            second = openSecond(session, 'main.s')
        const { record, map } = result(fixture)
        fixture.project.recordCompilation(record, {
            ...map,
            lines: [
                { path: 'main.c', line: 0 },
                null,
                { path: 'main.c', line: 0 },
                { path: 'value.h', line: 0 },
                { path: 'main.c', line: 0 },
                { path: 'main.c', line: 1 }
            ]
        })
        flushSync()
        expect(first.breakpointsEditable).toBe(true)
        session.toggleBreakpoint(0, first)
        session.toggleBreakpoint(4, second)
        flushSync()
        expect(first.displayedBreakpoints).toEqual([0])
        expect(second.displayedBreakpoints).toEqual([4])
        //line 4 already has its own Breakpoint, so only line 0 shows the mapped one
        expect(second.displayedMappedBreakpoints).toEqual([0])
        expect(fixture.coreBreakpoints()).toEqual([
            { file: 'main.s', line: 4 },
            { file: 'main.s', line: 0 }
        ])
        //editing the source makes the map stale, and a stale map places no Breakpoint
        session.fileEdited('main.c', 'int main(void) { return 2; }')
        flushSync()
        expect(second.displayedMappedBreakpoints).toEqual([])
        expect(fixture.coreBreakpoints()).toEqual([{ file: 'main.s', line: 4 }])
    })
    it('offers Recompile for assembly compiled against a Runtime ABI this editor lacks', () => {
        const fixture = setup(),
            { session } = fixture
        const second = openSecond(session, 'main.s')
        const { record, map } = result(fixture)
        expect(second.recompilationNeeded).toBe(false)
        fixture.project.recordCompilation({ ...record, runtimeAbi: 'v9' }, map)
        flushSync()
        expect(second.unsupportedRuntimeAbi).toBe(true)
        expect(second.recompilationNeeded).toBe(true)
        expect(second.compilationNotice).toContain('Runtime ABI v9')
    })
    it('offers Recompile for x86 assembly compiled against any Runtime ABI, which x86 lacks', () => {
        const fixture = setup('X86'),
            { session } = fixture
        const second = openSecond(session, 'main.s')
        const { record, map } = result(fixture, 'main.c', 'X86')
        flushSync()
        expect(second.recompilationNeeded).toBe(false)
        //x86 links every source File, so the Generated assembly starts the Build at the start code
        expect(session.sourceInput.entrySymbol).toBe('_start')
        expect(session.sourceInput.assemblyError).toBeUndefined()
        fixture.project.recordCompilation({ ...record, runtimeAbi: 'v1' }, map)
        flushSync()
        expect(second.unsupportedRuntimeAbi).toBe(true)
        expect(second.recompilationNeeded).toBe(true)
        expect(second.compilationNotice).toContain('no x86 Runtime library')
        //and the Build is refused for the same reason
        expect(session.sourceInput.entrySymbol).toBeUndefined()
        expect(session.sourceInput.assemblyError).toContain('Recompile main.c')
    })
    it('offers Recompile in the notice when only the Source map is missing', () => {
        const fixture = setup(),
            { session } = fixture
        const second = openSecond(session, 'main.s')
        const { record, map } = result(fixture)
        flushSync()
        expect(second.sourceMappingLost).toBe(false)
        //a map for other output is no map for this one, as after reopening the Project
        fixture.project.recordCompilation(record, { ...map, outputFingerprint: 'other' })
        flushSync()
        expect(second.sourceMappingLost).toBe(true)
        expect(second.compilationNotice).toContain('Click here to recompile')
        session.fileEdited('main.c', 'int main(void) { return 2; }')
        flushSync()
        //stale assembly says so instead, and the dock's own Recompile covers it
        expect(second.sourceMappingLost).toBe(false)
    })
    it('retains selection and both file identities through an unmapped Build startup', async () => {
        const fixture = setup(),
            { session, emulator, project } = fixture
        const first = session.groups[0],
            second = openSecond(session, 'main.s')
        result(fixture)
        flushSync()
        session.selectMappedLines(first, [0])
        emulator.buildSources = { files: project.files, entry: 'main.s' }
        emulator.canExecute = true
        await session.revealSourceLocation('main.s', 0)
        flushSync()
        expect(session.groups[0]).toBe(first)
        expect(first.sourceView).toBe('snapshot')
        expect(second.sourceView).toBe('snapshot')
        expect(session.mappingSelection).toEqual([{ path: 'main.c', line: 0 }])
        expect(first.mappedLines).toEqual([0])
        expect(first.editorDisabled).toBe(true)
        session.returnToLiveFiles()
        expect(first.sourceView).toBe('live')
        expect(second.sourceView).toBe('live')
    })
    it('keeps the compile target and optimization when tabs change while awaiting a result', async () => {
        const fixture = setup(),
            { session } = fixture
        const origin = session.groups[0]
        origin.optimization = '2'
        let finish!: () => void
        vi.mocked(compileProjectSource).mockImplementation(async () => {
            await new Promise<void>((resolve) => {
                finish = resolve
            })
            return result(fixture)
        })
        const pending = session.compileDisplayedSource(origin)
        session.selectFile('other.c')
        finish()
        await pending
        expect(compileProjectSource).toHaveBeenCalledWith(
            fixture.project,
            'main.c',
            '2',
            expect.anything()
        )
        expect(session.groups.map((group) => group.displayedPath)).toEqual(['main.c', 'main.s'])
        expect(origin.tabs.paths).toContain('other.c')
    })
    it('does not recreate a destination pane explicitly closed during compilation', async () => {
        const fixture = setup(),
            { session } = fixture
        const origin = session.groups[0],
            destination = openSecond(session, 'main.s')
        let finish!: () => void
        vi.mocked(compileProjectSource).mockImplementation(async () => {
            await new Promise<void>((resolve) => {
                finish = resolve
            })
            return result(fixture)
        })
        const pending = session.compileDisplayedSource(origin)
        session.closeGroup(destination)
        finish()
        await pending
        expect(session.groups).toEqual([origin])
        expect(origin.displayedPath).toBe('main.s')
        expect(origin.tabs.paths).toContain('main.c')
    })
    it('keeps both panes and their tabs on compilation failure', async () => {
        const { session } = setup()
        openSecond(session, 'main.s')
        const before = session.groups.map((group) => group.tabs)
        vi.mocked(compileProjectSource).mockResolvedValue(undefined)
        await session.compileDisplayedSource(session.groups[0])
        expect(session.groups.map((group) => group.tabs)).toEqual(before)
        expect(session.compiling).toBe(false)
    })
})

describe('failed Build diagnostics', () => {
    function error(file: string, lineIndex: number, message: string): Diagnostic {
        return {
            severity: 'error',
            file,
            lineIndex,
            column: 1,
            line: { line: '', line_index: lineIndex },
            message,
            formatted: message
        }
    }
    //a Build whose Core reports these and fails, as one that cannot link does: GenericEmulator
    //keeps them as its diagnostics and throws them with the failure
    function failingBuild(fixture: ReturnType<typeof setup>, diagnostics: Diagnostic[]) {
        fixture.emulator.compile = async () => {
            fixture.emulator.compilerDiagnostics = diagnostics
            throw new CompilationFailedError('Build failed', diagnostics)
        }
    }

    it('shows what only a failed Build found in the live view, until the Files change', async () => {
        const fixture = setup(),
            { session } = fixture
        const second = openSecond(session, 'main.s')
        const unresolved = error('main.s', 1, "undefined reference to `printf'")
        failingBuild(fixture, [unresolved])
        await session.build()
        flushSync()
        expect(session.sourceView).toBe('live')
        expect(session.bottomTab).toBe('problems')
        expect(session.activeDiagnostics).toEqual([unresolved])
        expect(session.diagnosticCounts['main.s']).toEqual({ errors: 1, warnings: 0 })
        expect(session.worstSeverity).toBe('error')
        expect(second.displayedDiagnostics).toEqual([unresolved])
        //what the Build said is about the Files as they were
        session.fileEdited('main.s', 'nop')
        flushSync()
        expect(session.activeDiagnostics).toEqual([])
        expect(second.displayedDiagnostics).toEqual([])
    })
    it('adds nothing live checking already shows', async () => {
        const fixture = setup(),
            { session } = fixture
        //MARS and RARS check live as they build, so a failed Build mostly says the same again
        const unknown = error('main.s', 0, 'Unknown instruction')
        const unresolved = error('main.s', 1, "undefined reference to `printf'")
        session.liveLanguageDiagnostics = [unknown]
        failingBuild(fixture, [{ ...unknown }, unresolved])
        await session.build()
        flushSync()
        expect(session.activeDiagnostics).toEqual([unknown, unresolved])
        expect(session.diagnosticCounts['main.s']).toEqual({ errors: 2, warnings: 0 })
    })
    it('forgets them once another Build or a Compile starts', async () => {
        const fixture = setup(),
            { session } = fixture
        failingBuild(fixture, [error('main.s', 1, 'first')])
        await session.build()
        let duringBuild: Diagnostic[] | undefined
        fixture.emulator.compile = async () => {
            duringBuild = session.activeDiagnostics
            fixture.emulator.compilerDiagnostics = [error('main.s', 0, 'second')]
            throw new CompilationFailedError('Build failed', [error('main.s', 0, 'second')])
        }
        await session.build()
        expect(duringBuild).toEqual([])
        expect(session.activeDiagnostics).toEqual([error('main.s', 0, 'second')])
        vi.mocked(compileProjectSource).mockResolvedValue(undefined)
        await session.compileDisplayedSource(session.groups[0])
        expect(session.activeDiagnostics).toEqual([])
    })
    it('keeps nothing from a Build that failed without compiling, such as a library that failed to load', async () => {
        const fixture = setup(),
            { session } = fixture
        failingBuild(fixture, [error('main.s', 1, "undefined reference to `printf'")])
        await session.build()
        session.fileEdited('main.s', 'nop')
        flushSync()
        //the emulator's list still holds the earlier Build's findings, which the edit made stale
        fixture.emulator.compile = async () => {
            throw new TypeError('Failed to fetch dynamically imported module')
        }
        await session.build()
        flushSync()
        expect(session.activeDiagnostics).toEqual([])
    })
    it('opens a failed Build diagnostic on the x86 start unit read-only', async () => {
        const fixture = setup('X86'),
            { session } = fixture
        //Generated assembly in the Project, so the Build links the start unit
        result(fixture, 'main.c', 'X86')
        //where it lands when the File with the other `_start` is linked first
        const clash = error(
            '@runtime/start.asm',
            33,
            "multiple definition of `_start'; first defined in main.s, line 1"
        )
        failingBuild(fixture, [clash])
        await session.build()
        flushSync()
        expect(session.activeDiagnostics).toEqual([clash])
        await session.revealDiagnostic(clash)
        flushSync()
        const group = session.groups.find((group) => group.displayedPath === '@runtime/start.asm')
        expect(group?.displayedLibraryMember).toBe(true)
        expect(group?.displayedFile).toEqual({ encoding: 'plain', content: X86_START_UNIT })
        expect(group?.displayedDiagnostics).toEqual([clash])
    })
})
