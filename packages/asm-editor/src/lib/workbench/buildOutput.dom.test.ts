/**
 * The Build output in the Workbench: the program the last x86 Build linked, opened from the
 * Explorer like an Executable, read-only, without Breakpoints or the program counter, kept past
 * Stop until the next Build starts
 * ([ADR 0050](../../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md),
 * [file-views.md](../../../../../docs/design/file-views.md) decisions 16 to 18, the plan's E7).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it } from 'vite-plus/test'
import { flushSync, tick } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { LINE_KIND } from '#lib/listing/listing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import type { BuildSources } from '#lib/projectFiles.ts'

//an ELF stands in for the program a Build links: the session never runs it
//(relative to the package, where the tests run: a DOM test's module URL is no file URL)
const program = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

let decoder: ListingDecoder
beforeAll(async () => {
    decoder = await loadDecoder()
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
})

/**
 * An x86 Project of `main.asm` whose Build, as the Emulator's, replaces the Build output when it
 * starts, links `main` and stops on the first line of `main.asm`; `fail` makes the next one fail.
 */
function setup() {
    const fixture = editorGroupsFixture('X86', {
        entry: 'main.asm',
        files: { 'main.asm': { encoding: 'plain', content: 'nop\nnop' } }
    })
    disposers.push(fixture.dispose)
    const { emulator } = fixture
    emulator.listings = new ListingDocuments((order) =>
        Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
    )
    const build = { fail: false, generation: 0 }
    emulator.compile = async (_historySize, sources: BuildSources) => {
        emulator.buildOutput = undefined
        await tick()
        if (build.fail) throw new Error('main.asm:1: error')
        const files = JSON.parse(JSON.stringify(sources.files))
        emulator.buildSources = { ...sources, files }
        emulator.buildOutput = {
            path: 'main',
            bytes: program,
            generation: ++build.generation,
            sources: emulator.buildSources
        }
        emulator.canExecute = true
        emulator.currentFile = 'main.asm'
        emulator.line = 0
    }
    emulator.clear = () => {
        emulator.canExecute = false
        emulator.buildSources = undefined
        emulator.listings?.clearSession()
    }
    flushSync()
    return { ...fixture, build }
}

async function built(session: ReturnType<typeof setup>['session']) {
    await session.build()
    flushSync()
    await tick()
    flushSync()
}

describe('the Build output in the Workbench', () => {
    it('is the program the Build linked, shown as an Executable that takes no edits', async () => {
        const { session } = setup()
        expect(session.buildOutput).toBeUndefined()
        await built(session)
        expect(session.buildOutput?.path).toBe('main')
        //no File of the Project, nor saved with it
        expect(session.project.files.main).toBeUndefined()
        const group = session.groups[0]
        session.selectFile('main', group)
        flushSync()
        expect(group.displayedBuildOutput).toBe(true)
        expect(group.displayedFile?.encoding).toBe('base64')
        expect(group.displayedKind).toBe('executable')
        expect(group.displayedView).toBe('hex')
        //Hex · Disassemble · Decompile, like any Executable
        expect(group.viewSwitch).toEqual(['hex', 'listing', 'pseudocode'])
        expect(group.bytesReadOnly).toMatch(/^The Build output is read-only/)
        expect(group.bytesNotice).toBeUndefined()
        //a view chosen for it is the pane's alone: there is no File to save it with
        group.setView('main', 'listing')
        flushSync()
        expect(group.displayedView).toBe('listing')
        expect(session.project.fileViews?.main).toBeUndefined()
        expect(session.project.openTabs ?? []).not.toContain('main')
    })

    it('opens from the Build during a Debug session, its Listing without Breakpoints or the program counter', async () => {
        const { session, emulator } = setup()
        await built(session)
        const group = session.groups[0]
        expect(group.sourceSelection).toMatchObject({ sourceKind: 'build', path: 'main.asm' })
        session.selectFile('main', group)
        flushSync()
        expect(group.sourceSelection).toMatchObject({ sourceKind: 'build', path: 'main' })
        expect(group.displayedBuildOutput).toBe(true)
        group.setView('main', 'listing')
        flushSync()
        const listing = await group.displayedListing!.ready
        flushSync()
        const line = listing.lines.kinds.indexOf(LINE_KIND.instruction)
        expect(group.breakpointsEditable).toBe(false)
        session.toggleBreakpoint(line, group)
        expect(emulator.breakpoints).toEqual([])
        expect(group.instructionLine).toBe(-1)
        expect(session.patchSite(group, line)).toBeUndefined()
    })

    it('is never where the debugger shows the program, which follows its source', async () => {
        const { session } = setup()
        await built(session)
        const group = session.groups[0]
        session.selectFile('main', group)
        flushSync()
        session.revealCurrentInstruction()
        flushSync()
        expect(group.displayedPath).toBe('main.asm')
        expect(group.tabs.paths).toContain('main')
        expect(group.views.main).toBeUndefined()
    })

    it('stays open at Stop and until the next Build starts, which shows its own there', async () => {
        const { session, emulator } = setup()
        await built(session)
        const group = session.groups[0]
        session.selectFile('main', group)
        flushSync()
        const first = session.buildOutputFile
        session.stop()
        flushSync()
        expect(group.tabs.paths).toEqual(['main.asm', 'main'])
        expect(group.displayedPath).toBe('main')
        expect(group.sourceSelection).toEqual({ sourceKind: 'live', path: 'main' })
        expect(group.displayedFile).toBe(first)
        await built(session)
        expect(emulator.buildOutput?.generation).toBe(2)
        expect(group.tabs.paths).toContain('main')
        session.selectFile('main', group)
        flushSync()
        expect(group.displayedBuildOutput).toBe(true)
    })

    it('closes its tabs when the next Build places none, as a failed one does', async () => {
        const { session, build } = setup()
        await built(session)
        const group = session.groups[0]
        session.selectFile('main', group)
        session.stop()
        flushSync()
        build.fail = true
        await built(session)
        expect(session.buildOutput).toBeUndefined()
        expect(group.tabs.paths).toEqual(['main.asm'])
    })

    //Stop closes them, as it closes any tab of a File that is gone: the Build output went as the
    //Build started, so a stopped Build that never reaches `finishBuild` leaves no tab on nothing
    it('closes its tabs when the next Build is stopped before it links', async () => {
        const { session, emulator } = setup()
        await built(session)
        const group = session.groups[0]
        session.selectFile('main', group)
        session.stop()
        flushSync()
        //a Build stopped while it assembles, which then returns without a program, as the
        //Emulator's does once it finds the Build was cleared
        let assembled!: () => void
        emulator.compile = async () => {
            emulator.buildOutput = undefined
            await new Promise<void>((resolve) => (assembled = resolve))
        }
        const building = session.build()
        await tick()
        //while it runs, the tab stays, on a Build output not placed yet
        expect(session.buildOutput).toBeUndefined()
        expect(group.tabs.paths).toContain('main')
        session.stop()
        assembled()
        await building
        flushSync()
        expect(session.buildOutput).toBeUndefined()
        expect(group.tabs.paths).toEqual(['main.asm'])
        //and the Log says nothing of a Build the person ended
        expect(session.log.filter((entry) => entry.kind === 'build')).toHaveLength(1)
    })

    it('is dimmed as from an earlier Build once a File it was built from changes', async () => {
        const { session, project } = setup()
        await built(session)
        expect(session.buildOutputStale).toBe(false)
        session.stop()
        //a File the Build did not have, its own copy kept as a File among them, changes nothing
        project.fileSystem.writeBytes('bin/main', program, false, 'base64')
        flushSync()
        expect(session.buildOutputStale).toBe(false)
        project.fileSystem.writeText('main.asm', 'nop')
        flushSync()
        expect(session.buildOutputStale).toBe(true)
        project.fileSystem.writeText('main.asm', 'nop\nnop')
        flushSync()
        expect(session.buildOutputStale).toBe(false)
        //a rename the host does not hear of, as a running program's own, leaves the Program with
        //its Entry missing (programs.md, decision 7)
        project.fileSystem.rename('main.asm', 'start.asm')
        flushSync()
        expect(session.buildOutputStale).toBe(true)
        expect(project.selectedProgram).toBe('main.asm')
        expect(session.programChoices).toEqual([
            { entry: 'main.asm', label: 'main.asm', missing: true }
        ])
        //the Explorer's moves it, and its Build is another program's
        project.fileSystem.rename('start.asm', 'main.asm')
        flushSync()
        expect(session.buildOutputStale).toBe(false)
        project.fileSystem.rename('main.asm', 'start.asm')
        session.fileRenamed('main.asm', 'start.asm')
        flushSync()
        expect(project.selectedProgram).toBe('start.asm')
        expect(session.programChoices).toEqual([
            { entry: 'start.asm', label: 'start.asm', missing: false }
        ])
        expect(session.sourceInput.entry).toBe('start.asm')
        expect(session.buildOutputStale).toBe(true)
    })

    it('gives way to a File or folder of the Project made at its path', async () => {
        const { session, project } = setup()
        await built(session)
        session.stop()
        project.fileSystem.writeText('main/notes.txt', '')
        flushSync()
        expect(session.buildOutput).toBeUndefined()
        project.fileSystem.remove('main/notes.txt')
        project.fileSystem.writeText('main', 'my own File')
        flushSync()
        expect(session.buildOutput).toBeUndefined()
        session.selectFile('main')
        flushSync()
        expect(session.groups[0].displayedFile).toEqual({
            encoding: 'plain',
            content: 'my own File'
        })
    })

    it('cannot be dragged, from the Explorer or its tab', async () => {
        const { session } = setup()
        await built(session)
        const event = new Event('dragstart', { cancelable: true }) as DragEvent
        const data: string[] = []
        Object.defineProperty(event, 'dataTransfer', {
            value: { types: data, setData: (type: string) => data.push(type) }
        })
        session.startFileDrag(event, 'main', session.groups[0])
        expect(event.defaultPrevented).toBe(true)
        expect(data).toEqual([])
        expect(session.draggedFile).toBeUndefined()
    })
})
