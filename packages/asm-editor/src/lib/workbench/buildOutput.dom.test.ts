/**
 * The Build output in the Workbench: the File an x86 Build saves the program it linked in, an
 * Executable of the Project like any other, with the record of what it was built from
 * ([ADR 0056](../../../../../docs/adr/0056-a-build-saves-the-program-it-links-as-a-file.md),
 * [file-views.md](../../../../../docs/design/file-views.md) decisions 17 and 18).
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
import { fileBytes, fileText, type BuildSources } from '#lib/projectFiles.ts'
import type { BuildOutputFormat } from '#lib/buildOutput.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'

//an ELF stands in for the program a Build links: the session never runs it
//(relative to the package, where the tests run: a DOM test's module URL is no file URL)
const program = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
//the same program linked again from changed sources
const relinked = program.slice()
relinked[program.length - 1] ^= 0xff

let decoder: ListingDecoder
beforeAll(async () => {
    decoder = await loadDecoder()
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    if (Prompt.promise) Prompt.cancel()
    document.body.replaceChildren()
})

/**
 * An x86 Project of `main.asm` whose Build, as the Emulator's, links `linked.bytes`, hands it to
 * the session to save as `main` and stops on the first line of `main.asm`; `fail` makes the next
 * one fail before it links.
 */
function setup(host: { readonly?: boolean } = {}) {
    const fixture = editorGroupsFixture(
        'X86',
        {
            entry: 'main.asm',
            files: { 'main.asm': { encoding: 'plain', content: 'nop\nnop' } }
        },
        host
    )
    disposers.push(fixture.dispose)
    const { emulator, project } = fixture
    emulator.listings = new ListingDocuments((order) =>
        Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
    )
    const linked = {
        bytes: program,
        fail: false,
        path: 'main',
        format: 'executable' as BuildOutputFormat
    }
    emulator.compile = async (_historySize, sources: BuildSources) => {
        await tick()
        if (linked.fail) throw new Error('main.asm:1: error')
        const outputs = fixture.buildOutputHost()
        const claim = await outputs.claim(linked.path, new AbortController().signal)
        if (claim === 'save') outputs.save(sources, linked.path, linked.bytes, linked.format)
        else if (claim !== 'present')
            emulator.notes = [
                ...emulator.notes,
                { id: emulator.notes.length, tone: 'warning', text: claim.note }
            ]
        const saved = claim === 'save' ? { [linked.path]: project.files[linked.path] } : {}
        emulator.buildSources = { ...sources, files: { ...sources.files, ...saved } }
        emulator.canExecute = true
        emulator.currentFile = 'main.asm'
        emulator.line = 0
    }
    emulator.clear = () => {
        emulator.canExecute = false
        emulator.buildSources = undefined
        emulator.notes = []
        emulator.listings?.clearSession()
    }
    flushSync()
    return { ...fixture, linked }
}

async function built(session: ReturnType<typeof setup>['session']) {
    await session.build()
    flushSync()
    await tick()
    flushSync()
}

/** Waits for the question a Build asks, and answers it. */
async function answer(replace: boolean) {
    for (let i = 0; i < 20 && !Prompt.promise; i++) await tick()
    const question = Prompt.question
    Prompt.answerConfirm(replace)
    return question
}

describe('the Build output in the Workbench', () => {
    it('is a File of the Project, an Executable, with the record of what it was built from', async () => {
        const { session, project } = setup()
        expect(session.buildOutputs.size).toBe(0)
        await built(session)
        expect(fileBytes(project.files.main)).toEqual(program)
        expect(project.files.main.encoding).toBe('base64')
        expect(project.builds).toEqual([
            expect.objectContaining({
                entry: 'main.asm',
                outputPath: 'main',
                inputs: { 'main.asm': expect.stringMatching(/^[a-f0-9]{32}$/) }
            })
        ])
        expect(session.buildOutputs.get('main')).toEqual({ entry: 'main.asm', stale: false })
        //saved with the Project, so it is there when it opens again
        expect(project.toObject().files.main).toEqual(project.files.main)
        session.stop()
        const group = session.groups[0]
        session.selectFile('main', group)
        flushSync()
        expect(group.displayedBuildOutputEntry).toBe('main.asm')
        expect(group.displayedKind).toBe('executable')
        expect(group.displayedView).toBe('listing')
        expect(group.viewSwitch).toEqual(['listing', 'pseudocode', 'hex'])
        //its bytes take edits once no Debug session holds the Files, as any File's
        group.setView('main', 'hex')
        flushSync()
        expect(group.bytesReadOnly).toBeUndefined()
        expect(project.fileViews?.main).toBe('hex')
        expect(project.openTabs).toContain('main')
    })

    it('saves an M68K S-record as text, which the editor opens to be read', async () => {
        const { session, project, linked } = setup()
        const srecord = 'S1071000700560FE1D\r\nS804001000EB\r\n'
        Object.assign(linked, {
            bytes: new TextEncoder().encode(srecord),
            path: 'main.S68',
            format: 'srecord'
        })
        await built(session)
        expect(project.files['main.S68']).toEqual({ encoding: 'plain', content: srecord })
        expect(fileText(project.files['main.S68'])).toBe(srecord)
        expect(project.builds).toEqual([expect.objectContaining({ outputPath: 'main.S68' })])
        expect(session.buildOutputs.get('main.S68')).toEqual({ entry: 'main.asm', stale: false })
    })

    it('is replaced by the next Build without a question while nobody changed it', async () => {
        const { session, project, linked } = setup()
        await built(session)
        const first = project.builds[0]
        session.stop()
        project.fileSystem.writeText('main.asm', 'nop')
        linked.bytes = relinked
        await built(session)
        expect(Prompt.promise).toBeNull()
        expect(fileBytes(project.files.main)).toEqual(relinked)
        expect(project.builds).toHaveLength(1)
        expect(project.builds[0].outputFingerprint).not.toBe(first.outputFingerprint)
        expect(project.builds[0].inputs['main.asm']).not.toBe(first.inputs['main.asm'])
        expect(session.buildOutputs.get('main')?.stale).toBe(false)
    })

    it('is shown in the Build during a Debug session, its Listing without the program counter', async () => {
        const { session } = setup()
        await built(session)
        const group = session.groups[0]
        expect(group.sourceSelection).toMatchObject({ sourceKind: 'build', path: 'main.asm' })
        session.selectFile('main', group)
        flushSync()
        expect(group.sourceSelection).toMatchObject({ sourceKind: 'build', path: 'main' })
        expect(group.displayedFile).toBeDefined()
        group.setView('main', 'listing')
        flushSync()
        const listing = await group.displayedListing!.ready
        flushSync()
        const line = listing.lines.kinds.indexOf(LINE_KIND.instruction)
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
    })

    it('stays when a Build fails, From an earlier Build', async () => {
        const { session, project, linked } = setup()
        await built(session)
        const group = session.groups[0]
        session.selectFile('main', group)
        session.stop()
        flushSync()
        project.fileSystem.writeText('main.asm', 'nop\nmov')
        linked.fail = true
        await built(session)
        expect(project.files.main).toBeDefined()
        expect(group.tabs.paths).toEqual(['main.asm', 'main'])
        expect(session.buildOutputs.get('main')?.stale).toBe(true)
    })

    it('is From an earlier Build once a File it was built from or its Program changes', async () => {
        const { session, project } = setup()
        await built(session)
        const stale = () => session.buildOutputs.get('main')?.stale
        expect(stale()).toBe(false)
        session.stop()
        //a File added since, which the Build did not read, changes nothing
        project.fileSystem.writeText('notes.txt', 'later')
        flushSync()
        expect(stale()).toBe(false)
        project.fileSystem.writeText('main.asm', 'nop')
        flushSync()
        expect(stale()).toBe(true)
        project.fileSystem.writeText('main.asm', 'nop\nnop')
        flushSync()
        expect(stale()).toBe(false)
        //its Program gone, nothing would build it
        project.fileSystem.rename('main.asm', 'start.asm')
        session.fileRenamed('main.asm', 'start.asm')
        flushSync()
        expect(project.selectedProgram).toBe('start.asm')
        expect(stale()).toBe(true)
    })

    it('leaves another Program From an earlier Build of its own alone', async () => {
        const { session, project, linked } = setup()
        await built(session)
        session.stop()
        project.fileSystem.writeText('other.asm', 'nop')
        session.createProgram('other.asm')
        flushSync()
        linked.path = 'other'
        linked.bytes = relinked
        await built(session)
        expect(project.builds.map((record) => record.outputPath)).toEqual(['main', 'other'])
        //neither read the other's program: a Build makes them, it does not read them
        expect(Object.keys(project.builds[1].inputs)).not.toContain('main')
        expect(session.buildOutputs.get('main')?.stale).toBe(false)
        expect(session.buildOutputs.get('other')).toEqual({ entry: 'other.asm', stale: false })
    })

    it('becomes the person’s own File once renamed, which the next Build leaves alone', async () => {
        const { session, project } = setup()
        await built(session)
        session.stop()
        project.fileSystem.rename('main', 'bin/main')
        session.fileRenamed('main', 'bin/main')
        flushSync()
        expect(project.builds).toEqual([])
        expect(session.buildOutputs.size).toBe(0)
        await built(session)
        expect(Prompt.promise).toBeNull()
        expect(fileBytes(project.files['bin/main'])).toEqual(program)
        expect(session.buildOutputs.has('main')).toBe(true)
        expect(session.buildOutputs.has('bin/main')).toBe(false)
    })

    it('loses its record when removed', async () => {
        const { session, project } = setup()
        await built(session)
        session.stop()
        project.fileSystem.remove('main')
        flushSync()
        expect(project.builds).toEqual([])
    })
})

describe('a Build over a File that is no unchanged Build output', () => {
    it('asks before replacing a File of the person’s own, and keeps it when told No', async () => {
        const { session, project, emulator } = setup()
        project.fileSystem.writeText('main', 'my own File')
        flushSync()
        const building = built(session)
        expect(await answer(false)).toBe(
            'main already exists. Building replaces it with the program it links. Replace it?'
        )
        await building
        expect(project.files.main).toEqual({ encoding: 'plain', content: 'my own File' })
        expect(project.builds).toEqual([])
        expect(emulator.notes.map((note) => note.text)).toEqual([
            '`main` was kept, so the built program is not saved; rename one of them to save it.'
        ])
        //the Build goes on
        expect(emulator.canExecute).toBe(true)
    })

    it('replaces it when told Yes', async () => {
        const { session, project } = setup()
        project.fileSystem.writeText('main', 'my own File')
        flushSync()
        const building = built(session)
        await answer(true)
        await building
        expect(fileBytes(project.files.main)).toEqual(program)
        expect(session.buildOutputs.get('main')?.entry).toBe('main.asm')
    })

    it('asks once an overwrite, a rename or a comment changed the Build output', async () => {
        const { session, project, linked } = setup()
        await built(session)
        session.stop()
        const [undo] = project.fileSystem.changeBytes('main', [
            { runs: [{ offset: 0x40, bytes: new Uint8Array([0x90]) }] }
        ])
        flushSync()
        expect(session.buildOutputs.has('main')).toBe(false)
        linked.bytes = relinked
        const building = built(session)
        expect(await answer(false)).toBe(
            'main was changed since a Build saved it. Building replaces it with the program it links, without the changes made to its bytes, its renames and its comments. Replace it?'
        )
        await building
        expect(fileBytes(project.files.main)[0x40]).toBe(0x90)
        session.stop()
        project.fileSystem.changeBytes('main', [undo])
        project.fileSystem.annotate('main', { names: { '0x401000': 'my_start' } })
        flushSync()
        const again = built(session)
        await answer(true)
        await again
        expect(fileBytes(project.files.main)).toEqual(relinked)
        expect(project.files.main.annotations).toBeUndefined()
    })

    it('saves nothing in a folder of the same name, and says so', async () => {
        const { session, project, emulator } = setup()
        project.fileSystem.writeText('main/notes.txt', '')
        flushSync()
        await built(session)
        expect(Prompt.promise).toBeNull()
        expect(project.files.main).toBeUndefined()
        expect(emulator.notes.map((note) => note.text)).toEqual([
            '`main` is a folder of the Project, so the built program is not saved; rename one of them.'
        ])
    })

    it('takes its question back when the Build is cancelled', async () => {
        const { project, buildOutputHost } = setup()
        project.fileSystem.writeText('main', 'my own File')
        flushSync()
        const cancelled = new AbortController()
        const pending = buildOutputHost().claim('main', cancelled.signal)
        for (let i = 0; i < 20 && !Prompt.promise; i++) await tick()
        expect(Prompt.promise).not.toBeNull()
        cancelled.abort()
        expect(Prompt.promise).toBeNull()
        expect(await pending).toEqual({ note: expect.stringContaining('was kept') })
        expect(project.files.main).toEqual({ encoding: 'plain', content: 'my own File' })
    })
})

describe('the program of a Project that cannot change', () => {
    it('is only shown to the running program', async () => {
        const fixture = editorGroupsFixture('X86', {}, { readonly: true })
        disposers.push(fixture.dispose)
        const claim = await fixture.buildOutputHost().claim('main', new AbortController().signal)
        expect(claim).toBe('present')
    })
})

describe('a Testcase’s program', () => {
    it('takes the place of the Build output nobody changed, not of a File of the person’s own', async () => {
        const { session, project, buildOutputHost } = setup()
        expect(buildOutputHost().isBuildOutput('main')).toBe(false)
        await built(session)
        expect(buildOutputHost().isBuildOutput('main')).toBe(true)
        session.stop()
        project.fileSystem.changeBytes('main', [
            { runs: [{ offset: 0x40, bytes: new Uint8Array([0x90]) }] }
        ])
        flushSync()
        expect(buildOutputHost().isBuildOutput('main')).toBe(false)
    })
})
