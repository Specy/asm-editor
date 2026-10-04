import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushSync } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { compileProjectSource } from '$lib/sourceCompilation/compileProjectSource'
import { fileFingerprint } from '$lib/sourceCompilation/records'
import { fileTransfer } from './__fixtures__/fileTransfer'

vi.mock('$lib/sourceCompilation/compileProjectSource', () => ({ compileProjectSource: vi.fn() }))

const disposers: (() => void)[] = []
function setup() {
    const fixture = editorGroupsFixture()
    disposers.push(fixture.dispose)
    flushSync()
    return fixture
}
function openSecond(session: ReturnType<typeof editorGroupsFixture>['session'], path: string) {
    const other = session.splitEditor()
    session.selectFile(path, other)
    return other
}
function result(fixture: ReturnType<typeof setup>, path = 'main.c') {
    const record = {
        sourcePath: path,
        outputPath: 'main.s',
        target: 'RISC-V' as const,
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
        session.selectMappedLine(first, 0)
        expect(second.mappedLines).toEqual([1])
        session.fileEdited('main.c', first.displayedCode + '\n')
        flushSync()
        expect(session.mappingPair).toBeUndefined()
        expect(session.mappingSelection).toBeUndefined()
        expect(session.groups).toEqual([first, second])
        expect(second.compilationNotice).toContain('Stale assembly')
    })
    it('retains selection and both file identities through an unmapped Build startup', async () => {
        const fixture = setup(),
            { session, emulator, project } = fixture
        const first = session.groups[0],
            second = openSecond(session, 'main.s')
        result(fixture)
        flushSync()
        session.selectMappedLine(first, 0)
        emulator.buildSources = { files: project.files, entry: 'main.s' }
        emulator.canExecute = true
        await session.revealSourceLocation('main.s', 0)
        flushSync()
        expect(session.groups[0]).toBe(first)
        expect(first.sourceView).toBe('snapshot')
        expect(second.sourceView).toBe('snapshot')
        expect(session.mappingSelection).toEqual({ path: 'main.c', line: 0 })
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
