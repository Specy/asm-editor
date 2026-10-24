import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { compileProjectSource } from '#lib/sourceCompilation/compileProjectSource.ts'
import { fileFingerprint } from '#lib/sourceCompilation/records.ts'
import { fileTransfer } from './__fixtures__/fileTransfer'
import type { Diagnostic } from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { X86_START_UNIT } from '#lib/languages/X86/x86StartUnit.ts'
import { CompilationFailedError } from '#lib/languages/BaseEmulator.svelte.ts'
import type { StoredProject } from '#lib/Project.svelte.ts'
import type { WorkbenchSessionHost } from './WorkbenchSession.svelte'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import {
    ENVIRONMENT_HEADER_PATH,
    loadedEnvironmentHeader,
    loadEnvironmentHeader
} from '#lib/sourceRuntime/environmentLibrary.ts'

vi.mock('#lib/sourceCompilation/compileProjectSource.ts', () => ({ compileProjectSource: vi.fn() }))

const disposers: (() => void)[] = []
function setup(language?: 'X86', data?: StoredProject, host?: Partial<WorkbenchSessionHost>) {
    const fixture = editorGroupsFixture(language, data, host)
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
    return {
        record,
        map,
        assembly: fixture.project.files['main.s'].content,
        diagnostics: [],
        //the Programs as a Compile that makes none leaves them
        program: 'none' as const,
        definesMain: true
    }
}
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    vi.resetAllMocks()
    preferencesStore.values.autoSave.value = true
})

describe('saved editor tabs', () => {
    it('opens the Entry file for an older Project without marking it changed', () => {
        const onChange = vi.fn(),
            onSave = vi.fn()
        const { session, project } = setup(undefined, {}, { onChange, onSave })
        expect(session.groups[0].tabs.paths).toEqual(['main.c'])
        expect(project.toObject()).not.toHaveProperty('openTabs')
        expect(onChange).not.toHaveBeenCalled()
        expect(onSave).not.toHaveBeenCalled()
    })

    it('restores tab order and the last selected File independently of the Entry', () => {
        const { session } = setup(undefined, {
            openTabs: ['value.h', 'other.c', 'main.c'],
            activeTab: 'other.c'
        })
        expect(session.groups[0].tabs.paths).toEqual(['value.h', 'other.c', 'main.c'])
        expect(session.groups[0].displayedPath).toBe('other.c')
    })

    it.each(['main.c', 'missing.c'])(
        'uses the first saved tab when active path %s is missing or no longer open',
        (activeTab) => {
            const { session } = setup(undefined, {
                openTabs: ['missing.c', 'value.h', 'other.c'],
                activeTab
            })
            expect(session.groups[0].tabs.paths).toEqual(['value.h', 'other.c'])
            expect(session.groups[0].displayedPath).toBe('value.h')
        }
    )

    it('does not restore a tab or selection for a missing Entry file', () => {
        const { session } = setup(undefined, {
            entry: 'missing.c',
            openTabs: ['missing.c'],
            activeTab: 'missing.c'
        })
        expect(session.groups[0].tabs.paths).toEqual([])
        expect(session.groups[0].displayedPath).toBe('')
    })

    it('saves opens, selection changes and closes, then restores them in a new session', () => {
        const onSave = vi.fn()
        const { session, project } = setup(undefined, {}, { onSave })
        session.selectFile('value.h')
        session.selectFile('other.c')
        session.activateTab('value.h')
        flushSync()
        expect(project.openTabs).toEqual(['main.c', 'value.h', 'other.c'])
        expect(project.activeTab).toBe('value.h')
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: true })
        session.closeTab('value.h')
        flushSync()
        const restored = setup(undefined, project.toObject()).session.groups[0]
        expect(restored.tabs.paths).toEqual(['main.c', 'other.c'])
        expect(restored.displayedPath).toBe('other.c')
    })

    it('preserves closing every tab across a reload', () => {
        const { session, project } = setup()
        session.closeTab('main.c')
        flushSync()
        const restored = setup(undefined, project.toObject()).session.groups[0]
        expect(project.openTabs).toEqual([])
        expect(project.activeTab).toBeUndefined()
        expect(restored.tabs.paths).toEqual([])
        expect(restored.displayedPath).toBe('')
    })

    it('remembers tabs across both panes and the last focused editor', async () => {
        const { session, project } = setup()
        const left = session.groups[0],
            right = openSecond(session, 'main.s')
        session.selectFile('value.h', left)
        session.focusEditorGroup(right)
        flushSync()
        expect(project.openTabs).toEqual(['main.c', 'value.h', 'main.s'])
        expect(project.activeTab).toBe('main.s')
        await session.transferTab('value.h', left, right)
        flushSync()
        expect(project.openTabs).toEqual(['main.c', 'main.s', 'value.h'])
        expect(project.activeTab).toBe('value.h')
        const restored = setup(undefined, project.toObject()).session
        expect(restored.groups).toHaveLength(1)
        expect(restored.groups[0].tabs.paths).toEqual(project.openTabs)
        expect(restored.groups[0].displayedPath).toBe('value.h')
        session.closeGroup(right)
        flushSync()
        expect(project.openTabs).toEqual(['main.c'])
        expect(project.activeTab).toBe('main.c')
    })

    it('updates saved paths after a rename or deletion', () => {
        const { session, project } = setup()
        session.selectFile('other.c')
        project.fileSystem.rename('other.c', 'renamed.c')
        session.fileRenamed('other.c', 'renamed.c')
        flushSync()
        expect(project.openTabs).toEqual(['main.c', 'renamed.c'])
        expect(project.activeTab).toBe('renamed.c')
        project.fileSystem.remove('renamed.c')
        session.fileDeleted('renamed.c')
        flushSync()
        expect(project.openTabs).toEqual(['main.c'])
        expect(project.activeTab).toBe('main.c')
    })

    it('keeps the last Project tab when navigating to transient Build Files', async () => {
        const { session, project, emulator } = setup()
        session.selectFile('value.h')
        flushSync()
        emulator.buildSources = {
            entry: 'build-only.s',
            files: { 'build-only.s': { encoding: 'plain', content: 'nop' } }
        }
        emulator.canExecute = true
        project.fileSystem.beginSession()
        await session.revealSourceLocation('build-only.s', 0)
        flushSync()
        expect(project.openTabs).toEqual(['main.c', 'value.h'])
        expect(project.activeTab).toBe('value.h')
        session.activateTab('main.c')
        flushSync()
        expect(project.activeTab).toBe('main.c')
    })

    it('waits for Save when autosave is off and skips persistence for readonly hosts', () => {
        preferencesStore.values.autoSave.value = false
        const onChange = vi.fn(),
            onSave = vi.fn()
        const { session, project } = setup(undefined, {}, { onChange, onSave })
        session.selectFile('other.c')
        flushSync()
        expect(project.activeTab).toBe('other.c')
        expect(onChange).toHaveBeenCalledOnce()
        expect(onSave).not.toHaveBeenCalled()
        session.save()
        expect(onSave).toHaveBeenCalledExactlyOnceWith({ silent: false })
        const readonly = setup(undefined, {}, { readonly: true, onChange, onSave })
        readonly.session.selectFile('other.c')
        flushSync()
        expect(readonly.project.openTabs).toBeUndefined()
        expect(onChange).toHaveBeenCalledOnce()
    })
})

describe('the preview tab', () => {
    it('opens a File clicked in the Explorer in preview, and the next one in its place', () => {
        const { session } = setup()
        const group = session.groups[0]
        session.previewFile('value.h')
        expect(group.tabs).toEqual({
            paths: ['main.c', 'value.h'],
            active: 'value.h',
            preview: 'value.h'
        })
        session.previewFile('other.c')
        expect(group.tabs).toEqual({
            paths: ['main.c', 'other.c'],
            active: 'other.c',
            preview: 'other.c'
        })
        expect(group.displayedPath).toBe('other.c')
        //a File kept open is only focused, and the preview tab stays in preview
        session.previewFile('main.c')
        expect(group.tabs).toEqual({
            paths: ['main.c', 'other.c'],
            active: 'main.c',
            preview: 'other.c'
        })
    })

    it('keeps it open on a second click or a double click on its tab', () => {
        const { session } = setup()
        const group = session.groups[0]
        session.previewFile('value.h')
        session.previewFile('value.h')
        expect(group.tabs).toEqual({ paths: ['main.c', 'value.h'], active: 'value.h' })
        session.previewFile('other.c')
        session.keepOpen('other.c', group)
        session.previewFile('main.s')
        expect(group.tabs.paths).toEqual(['main.c', 'value.h', 'other.c', 'main.s'])
        expect(group.tabs.preview).toBe('main.s')
    })

    it('keeps it open once it is edited, as text or as bytes, but not for an edit that changes nothing', () => {
        const { session } = setup(undefined, {
            files: {
                'main.c': { encoding: 'plain', content: 'int main(void) { return 0; }' },
                'value.h': { encoding: 'plain', content: '#define VALUE 0' },
                'blob.bin': { encoding: 'base64', content: 'AQIDBA==' }
            }
        })
        const group = session.groups[0]
        session.previewFile('value.h')
        session.fileEdited('value.h', '#define VALUE 0')
        expect(group.tabs.preview).toBe('value.h')
        session.fileEdited('value.h', '#define VALUE 1')
        expect(group.tabs.preview).toBeUndefined()
        session.previewFile('blob.bin')
        const bytes = session.groupForFile('blob.bin')
        expect(bytes.tabs.preview).toBe('blob.bin')
        expect(session.editFileBytes('blob.bin', 0, Uint8Array.of(9))).toBe(true)
        expect(bytes.tabs.preview).toBeUndefined()
    })

    it('opens a File kept open any other way, and saves the preview tab as an open tab', () => {
        const { session, project } = setup()
        const group = session.groups[0]
        session.previewFile('value.h')
        //the Explorer's menu, a File made or dropped, the debugger's navigation
        session.selectFile('other.c')
        expect(group.tabs).toEqual({
            paths: ['main.c', 'value.h', 'other.c'],
            active: 'other.c',
            preview: 'value.h'
        })
        flushSync()
        expect(project.openTabs).toEqual(['main.c', 'value.h', 'other.c'])
        const restored = setup(undefined, project.toObject()).session.groups[0]
        expect(restored.tabs).toEqual({
            paths: ['main.c', 'value.h', 'other.c'],
            active: 'other.c'
        })
    })
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
        expect(project.toObject().files).toEqual(before.files)
        expect(project.toObject().compilations).toEqual(before.compilations)
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
        expect(second.compilationNotice).toBe('')
    })
    it('links x86 assembly compiled against Runtime ABI v1, and offers Recompile for one it lacks', () => {
        const fixture = setup('X86'),
            { session } = fixture
        const second = openSecond(session, 'main.s')
        const { record, map } = result(fixture, 'main.c', 'X86')
        session.createProgram('main.s')
        flushSync()
        expect(second.recompilationNeeded).toBe(false)
        //the Entry is Generated assembly, so the Build starts at the start code
        expect(session.sourceInput.entrySymbol).toBe('_start')
        expect(session.sourceInput.assemblyError).toBeUndefined()
        fixture.project.recordCompilation({ ...record, runtimeAbi: 'v1' }, map)
        flushSync()
        expect(second.unsupportedRuntimeAbi).toBe(false)
        expect(session.sourceInput.runtimeAbi).toBe('v1')
        expect(session.sourceInput.entrySymbol).toBe('_start')
        expect(session.sourceInput.assemblyError).toBeUndefined()
        fixture.project.recordCompilation({ ...record, runtimeAbi: 'v9' }, map)
        flushSync()
        expect(second.unsupportedRuntimeAbi).toBe(true)
        expect(second.recompilationNeeded).toBe(true)
        expect(second.compilationNotice).toBe('')
        //and the Build is refused for the same reason
        expect(session.sourceInput.entrySymbol).toBeUndefined()
        expect(session.sourceInput.assemblyError).toContain('Recompile its source')
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
    it('restores the source on the left when the only pane shows assembly', async () => {
        const fixture = setup(),
            { session } = fixture
        const origin = session.groups[0]
        result(fixture)
        session.selectFile('main.s', origin)
        session.closeTab('main.c', origin)
        flushSync()
        expect(origin.displayedCompilation).toBeDefined()
        vi.mocked(compileProjectSource).mockResolvedValue(result(fixture))
        await session.compileDisplayedSource(origin)
        flushSync()
        expect(session.groups).toHaveLength(2)
        expect(session.groups[0]).toBe(origin)
        expect(origin.displayedPath).toBe('main.c')
        expect(origin.tabs.paths).toEqual(['main.c'])
        expect(session.groups[1].displayedPath).toBe('main.s')
        expect(session.groups[1].tabs.paths).toEqual(['main.s'])
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

describe('files dropped from the computer', () => {
    /** A file from the computer, whose bytes jsdom's File cannot read by itself. */
    function computerFile(name: string, content: string | Uint8Array) {
        const bytes = typeof content === 'string' ? new TextEncoder().encode(content) : content
        const file = new File([], name)
        Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.slice().buffer })
        return file
    }

    it('adds them to the root and opens them in the pane they were dropped on', async () => {
        const { session, project } = setup()
        const left = session.groups[0],
            right = openSecond(session, 'main.s')
        await session.uploadFiles(
            [computerFile('notes.txt', 'hello'), computerFile('extra.s', 'nop')],
            right
        )
        expect(project.files['notes.txt']).toBeDefined()
        expect(new TextDecoder().decode(project.fileSystem.readBytes('extra.s'))).toBe('nop')
        expect(left.tabs.paths).toEqual(['main.c'])
        expect(right.tabs.paths).toEqual(['main.s', 'notes.txt', 'extra.s'])
        expect(right.displayedPath).toBe('extra.s')
        expect(session.focusedGroup).toBe(right)
    })

    it('opens them in a new pane on the right of the only one', async () => {
        const { session } = setup()
        const left = session.groups[0]
        await session.uploadFiles([computerFile('notes.txt', 'hello')], left, true)
        expect(session.groups).toHaveLength(2)
        expect(left.tabs.paths).toEqual(['main.c'])
        expect(session.groups[1].tabs.paths).toEqual(['notes.txt'])
    })

    it('asks before one replaces a File, and keeps the File when told not to', async () => {
        const { session, project } = setup()
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(false)
        try {
            await session.uploadFiles([computerFile('value.h', 'replaced')], session.groups[0])
            expect(confirm).toHaveBeenCalledWith('value.h already exists. Replace it?')
            expect(project.files['value.h'].content).toBe('#define VALUE 0')
            expect(session.groups[0].tabs.paths).toEqual(['main.c'])
        } finally {
            confirm.mockRestore()
        }
    })

    it('offers an x86 Executable a Program of its own', async () => {
        const { session, project } = setup('X86')
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        try {
            const elf = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme')
            await session.uploadFiles([computerFile('chall', elf)], session.groups[0])
            expect(confirm).toHaveBeenCalledWith('Create a program for chall?')
            expect(project.program('chall')).toBeDefined()
            expect(session.groups[0].displayedPath).toBe('chall')
        } finally {
            confirm.mockRestore()
        }
    })

    it('is refused during a Debug session, a test run and in a read-only Workbench', async () => {
        const { session, project } = setup()
        const run = project.fileSystem.beginSession()
        flushSync()
        expect(session.uploadRefusal()).toBe('Stop the Debug session to add files')
        await session.uploadFiles([computerFile('notes.txt', 'hello')], session.groups[0])
        expect(project.files['notes.txt']).toBeUndefined()
        run.stop()
        flushSync()
        expect(session.uploadRefusal()).toBeUndefined()
        session.testing = true
        expect(session.uploadRefusal()).toBe('The Testcases are running: add files once they end')
        session.testing = false
        const readonly = setup(undefined, {}, { readonly: true })
        expect(readonly.session.uploadRefusal()).toBe('This Project is read-only')
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
        //Generated assembly as the Entry, so the Build links the start unit
        result(fixture, 'main.c', 'X86')
        session.createProgram('main.s')
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

describe('<sim.h> in the Workbench', () => {
    it.each(['RISC-V', 'X86'] as const)(
        'follows Step into the %s header and back, read-only, and stops on its Breakpoints',
        async (target) => {
            await loadEnvironmentHeader(target)
            const fixture = setup(target === 'X86' ? 'X86' : undefined),
                { session, emulator, project } = fixture
            const source = session.groups[0],
                assembly = openSecond(session, 'main.s')
            const { record, map } = result(fixture, 'main.c', target)
            //main.s's second instruction is an inlined sim_ function's, from line 28 of the header
            project.recordCompilation(record, {
                ...map,
                lines: [
                    { path: 'main.c', line: 0 },
                    { path: ENVIRONMENT_HEADER_PATH, line: 27 }
                ]
            })
            emulator.buildSources = { files: project.files, entry: 'main.s' }
            emulator.canExecute = true
            await session.revealSourceLocation('main.s', 0)
            flushSync()
            expect(source.displayedPath).toBe('main.c')
            expect(source.highlightedLine).toBe(0)
            expect(assembly.instructionLine).toBe(0)

            emulator.line = 1
            await session.revealSourceLocation('main.s', 1)
            flushSync()
            expect(source.displayedPath).toBe(ENVIRONMENT_HEADER_PATH)
            expect(source.displayedCode).toBe(loadedEnvironmentHeader(target))
            expect(source.highlightedLine).toBe(27)
            expect(source.editorDisabled).toBe(true)
            expect(session.mappingPair).toMatchObject({ source, assembly })
            //a Breakpoint in it stops on the instruction it contributed, during the Debug session too
            expect(source.breakpointsEditable).toBe(true)
            session.toggleBreakpoint(27, source)
            flushSync()
            expect(source.displayedBreakpoints).toEqual([27])
            expect(assembly.displayedMappedBreakpoints).toEqual([1])
            expect(fixture.coreBreakpoints()).toEqual([{ file: 'main.s', line: 1 }])

            emulator.line = 0
            await session.revealSourceLocation('main.s', 0)
            flushSync()
            expect(source.displayedPath).toBe('main.c')
            expect(source.sourceView).toBe('snapshot')
            expect(source.highlightedLine).toBe(0)
            expect(source.tabs.paths).toEqual(['main.c', ENVIRONMENT_HEADER_PATH])
        }
    )
})
