/**
 * Renames and comments made in an Executable's Listing
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 1,
 * 6 to 12 and 18 to 22): where Rename… and Comment… are offered and refused, the reasons their
 * prompts give, what they save on the File, Undo and Redo, the Listing made again with them while
 * the pane, its history and a Debug session's patched lines stay on their addresses, and saving.
 * crackme's real Listing, generated on the test's thread.
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import type { EditorGroup } from './EditorGroup.svelte'
import type { WorkbenchSession, WorkbenchSessionHost } from './WorkbenchSession.svelte'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import { labelHoverMarkdown } from '#lib/listing/listingNavigation.ts'
import { listingFunctions } from '#lib/listing/listingSymbols.ts'
import { makeBuildRecord } from '#lib/buildOutput.ts'
import { makeProjectFromArchive, projectToArchive } from '#lib/projectArchive.ts'
import type { StoredProject } from '#lib/Project.svelte.ts'
import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import AnnotationPromptView from '#cmp/specific/workbench/AnnotationPrompt.svelte'

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackmeBytes = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
const crackme = Buffer.from(crackmeBytes).toString('base64')
/** crackme's load base, a PIE's planned one. */
const BASE = 0x555555554000
const MAIN = 0x11e9
const hex = (address: number) => `0x${(address + BASE).toString(16)}`

let decoder: ListingDecoder
beforeAll(async () => {
    decoder = await loadDecoder()
})

const disposers: (() => void)[] = []
afterEach(() => {
    disposers.splice(0).forEach((dispose) => dispose())
    document.body.replaceChildren()
    vi.restoreAllMocks()
    preferencesStore.values.autoSave.value = false
})

/**
 * crackme, shown as its Listing, beside a text File; with `hold`, each Listing waits to be
 * generated until the function it returns is called.
 */
function setup(host: Partial<WorkbenchSessionHost> = {}, data: StoredProject = {}) {
    const fixture = editorGroupsFixture(
        'X86',
        {
            entry: 'crackme',
            files: {
                crackme: { encoding: 'base64', content: crackme },
                'notes.txt': { encoding: 'plain', content: 'password?' }
            },
            fileViews: { crackme: 'listing' },
            ...data
        },
        host
    )
    disposers.push(fixture.dispose)
    let held: Promise<void> | undefined
    const store = new ListingDocuments(async (order) => {
        await held
        return generateListing(decoder, { ...order, version: 'v1' })
    })
    fixture.emulator.listings = store
    const setExecutableAnnotations = vi.fn()
    Object.assign(fixture.emulator, { setExecutableAnnotations })
    flushSync()
    const hold = () => {
        let release = () => {}
        held = new Promise((resolve) => (release = resolve))
        return () => {
            held = undefined
            release()
        }
    }
    return { ...fixture, store, hold, setExecutableAnnotations }
}

async function until(condition: () => boolean) {
    for (let attempt = 0; attempt < 300 && !condition(); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 5))
        flushSync()
    }
    expect(condition()).toBe(true)
}

/** The Listing a pane shows, once the one asked for (with the File's annotations) is ready. */
async function current(session: WorkbenchSession, group: EditorGroup): Promise<Listing> {
    await until(() => {
        const requested = session.listingFor(group.sourceSelection)
        return requested?.status === 'ready' && group.displayedListing === requested
    })
    return group.displayedListing!.listing!
}

async function shown(session: WorkbenchSession, path = 'crackme') {
    const group = session.groups[0]
    session.selectFile(path, group)
    flushSync()
    return { group, listing: await current(session, group) }
}

/** The 0-based line whose code, before any comment, is `text`, from line `from`. */
function lineOf(listing: Listing, text: string, from = 0): number {
    const line = listing.text
        .split('\n')
        .findIndex((row, index) => index >= from && row.split(';')[0].trim() === text)
    expect(line, text).toBeGreaterThanOrEqual(0)
    return line
}

/** The column a name starts at on a line. */
function columnOf(listing: Listing, line: number, name: string): number {
    const column = listing.text.split('\n')[line].indexOf(name)
    expect(column, name).toBeGreaterThanOrEqual(0)
    return column
}

const rowsOf = (listing: Listing) => listing.text.split('\n')

describe('Rename… in the Listing', () => {
    it('is offered on a label’s line and on a name under the cursor, never in a comment', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const main = lineOf(listing, 'main:')
        expect(session.renameTargetAt(group, main, 0)).toMatchObject({
            address: MAIN,
            jumpTarget: false,
            raw: 'main',
            current: 'main'
        })
        //a jump target, by its dot-less name
        const jne = lineOf(listing, 'jne .LAB_2', main)
        expect(
            session.renameTargetAt(group, jne, columnOf(listing, jne, '.LAB_2') + 2)
        ).toMatchObject({ address: 0x1291, jumpTarget: true, raw: 'LAB_2', current: 'LAB_2' })
        //a string's label in an operand, not the words of the comment after it
        const lea = lineOf(listing, 'lea rdx, [rel s_hunter2]')
        expect(
            session.renameTargetAt(group, lea, columnOf(listing, lea, 's_hunter2'))?.label.name
        ).toBe('s_hunter2')
        expect(session.renameTargetAt(group, lea, columnOf(listing, lea, '"hunter2"') + 1)).toBe(
            undefined
        )
        //no name under the cursor, a blank line, a mnemonic
        expect(session.renameTargetAt(group, main - 1, 0)).toBeUndefined()
        expect(session.renameTargetAt(group, jne, 5)).toBeUndefined()
        //a PLT stub is offered, and says why it cannot be renamed
        const call = lineOf(listing, 'call printf@plt', main)
        expect(
            session.renameTargetAt(group, call, columnOf(listing, call, 'printf'))
        ).toMatchObject({
            refusal: "“printf” can't be renamed, as it comes from a shared library."
        })
    })

    it('gives the reason a typed name is refused, as the prompt shows it under the field', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        expect(session.openRenamePrompt(group, lineOf(listing, 'main:'), 0)).toBe(true)
        const prompt = group.openAnnotationPrompt!
        expect(prompt.spec).toMatchObject({ kind: 'name', title: 'Rename main', text: 'main' })
        const reason = (text: string) => {
            prompt.input(text)
            return prompt.problem
        }
        expect(reason('check_password')).toBeUndefined()
        expect(reason('  check_password  ')).toBeUndefined()
        expect(reason('')).toBe('Write a name.')
        expect(reason('my name')).toBe(
            'The name can only have letters, digits and underscores. This name has a space.'
        )
        expect(reason('main.cold')).toBe(
            'The name can only have letters, digits and underscores. This name has “.”.'
        )
        expect(reason('2fast')).toBe('A name cannot start with a digit.')
        expect(reason('x'.repeat(129))).toBe(
            'Names can be up to 128 characters long. This one has 129.'
        )
        expect(reason('int')).toBe('“int” is a C keyword. Choose another name.')
        expect(reason('class')).toBe('“class” is a C++ keyword. Choose another name.')
        expect(reason('undefined4')).toBe(
            '“undefined4” is the name of a type used in the Pseudocode. Choose another name.'
        )
        expect(reason('RAX')).toBe('“RAX” is an x86 register. Choose another name.')
        expect(reason('qword')).toBe('“qword” is a special word in assembly. Choose another name.')
        //another label's, raw or invented, at the address the gutter shows
        expect(reason('_start')).toBe(
            `Another label is already called “_start” (at ${hex(0x1100)}).`
        )
        expect(reason('FUN_winged_scarab')).toBe(
            `Another label is already called “FUN_winged_scarab” (at ${hex(0x1020)}).`
        )
        //a library function's, which its PLT stub stands for
        expect(reason('puts')).toBe(
            `“puts” is already used by puts@plt_resolver (at ${hex(0x1030)}).`
        )
        //a refused name is not saved
        prompt.input('rax')
        expect(prompt.save()).toBe(false)
        expect(session.project.files.crackme.annotations).toBeUndefined()

        //a jump target's differs from its function's other jump targets only
        const jne = lineOf(listing, 'jne .LAB_2', lineOf(listing, 'main:'))
        session.openRenamePrompt(group, jne, columnOf(listing, jne, 'LAB_2'))
        const block = group.openAnnotationPrompt!
        expect(block.spec).toMatchObject({ title: 'Rename main.LAB_2', prefix: '.', text: 'LAB_2' })
        block.input('LAB_1')
        expect(block.problem).toBe(
            `Another jump target in this function is already called “LAB_1” (at ${hex(0x1242)}).`
        )
        block.input('_start')
        expect(block.problem).toBeUndefined()
    })

    it('saves the name on the File, which its Listing, the Symbols and the hover then show', async () => {
        const { session, setExecutableAnnotations } = setup()
        const { group, listing } = await shown(session)
        session.openRenamePrompt(group, lineOf(listing, 'main:'), 0)
        group.openAnnotationPrompt!.input('check_password')
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(group.annotationPrompt).toBeUndefined()
        expect(session.project.files.crackme.annotations).toEqual({
            names: { '0x11e9': 'check_password' }
        })
        //a Debug session's Listing would take it at once
        expect(setExecutableAnnotations).toHaveBeenLastCalledWith('crackme', {
            names: { '0x11e9': 'check_password' }
        })
        const renamed = await current(session, group)
        expect(renamed).not.toBe(listing)
        expect(rowsOf(renamed)).toContain('check_password:')
        expect(rowsOf(renamed)).not.toContain('main:')
        const label = renamed.labels.find((each) => each.address === MAIN)!
        expect(label).toMatchObject({ name: 'check_password', renamed: { from: 'main' } })
        expect(labelHoverMarkdown(renamed, label)).toContain('Renamed from `main`')
        expect(listingFunctions(renamed).find((fn) => fn.address === MAIN + BASE)).toMatchObject({
            display: 'check_password',
            renamed: { from: 'main' }
        })
        //the prompt opens on the new name, saying what it was
        session.openRenamePrompt(group, lineOf(renamed, 'check_password:'), 0)
        expect(group.openAnnotationPrompt!.spec).toMatchObject({
            title: 'Rename check_password',
            text: 'check_password',
            note: 'Renamed “main” to “check_password”. Rename it to “main” again to go back.'
        })
    })

    it('renames a jump target, kept without its dot, written with it in its function', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const jne = lineOf(listing, 'jne .LAB_2', lineOf(listing, 'main:'))
        session.openRenamePrompt(group, jne, columnOf(listing, jne, 'LAB_2'))
        group.openAnnotationPrompt!.input('.wrong_password')
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(session.project.files.crackme.annotations?.names).toEqual({
            '0x1291': 'wrong_password'
        })
        const renamed = await current(session, group)
        expect(rowsOf(renamed)).toContain('    jne .wrong_password')
        expect(rowsOf(renamed)).toContain('.wrong_password:')
    })

    it('resets a name: typing the name the Listing gave it, or Reset name', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const main = lineOf(listing, 'main:')
        expect(session.canResetNameAt(group, main, 0)).toBe(false)
        expect(session.renameLabel('crackme', MAIN, 'check_password')).toBe(true)
        let renamed = await current(session, group)
        const line = lineOf(renamed, 'check_password:')
        expect(session.canResetNameAt(group, line, 0)).toBe(true)
        session.openRenamePrompt(group, line, 0)
        group.openAnnotationPrompt!.input('main')
        expect(group.openAnnotationPrompt!.problem).toBeUndefined()
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
        renamed = await current(session, group)
        expect(rowsOf(renamed)).toContain('main:')

        session.renameLabel('crackme', MAIN, 'check_password')
        renamed = await current(session, group)
        expect(session.resetNameAt(group, lineOf(renamed, 'check_password:'), 0)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
    })

    it('refuses a PLT stub, saying why, and saves nothing', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const { session } = setup()
        const { group, listing } = await shown(session)
        const call = lineOf(listing, 'call strcmp@plt')
        expect(session.openRenamePrompt(group, call, columnOf(listing, call, 'strcmp'))).toBe(false)
        expect(warn).toHaveBeenCalledWith(
            "“strcmp” can't be renamed, as it comes from a shared library."
        )
        expect(group.annotationPrompt).toBeUndefined()
        const stub = lineOf(listing, 'strcmp@plt:')
        expect(session.openRenamePrompt(group, stub, 0)).toBe(false)
        //nor a GOT slot
        const got = listing.labels.find((label) => label.name === 'puts@got')!
        expect(session.openRenamePrompt(group, got.line, 0)).toBe(false)
        expect(warn).toHaveBeenLastCalledWith(
            "“puts” can't be renamed, as it comes from a shared library."
        )
        expect(session.project.files.crackme.annotations).toBeUndefined()
    })
})

describe('where renames and comments are taken', () => {
    it('not in a read-only Workbench', async () => {
        const { session } = setup({ readonly: true })
        const { group, listing } = await shown(session)
        const main = lineOf(listing, 'main:')
        expect(session.annotatablePath(group)).toBeUndefined()
        expect(session.renameTargetAt(group, main, 0)).toBeUndefined()
        expect(session.commentTargetAt(group, main)).toBeUndefined()
        expect(session.openRenamePrompt(group, main, 0)).toBe(false)
        expect(session.renameLabel('crackme', MAIN, 'check_password')).toBe(false)
        expect(session.canUndoAnnotation('crackme')).toBe(false)
    })

    it('not in a library’s Listing, which is no File of the Project, but in a Build output', async () => {
        const { session, store, emulator } = setup()
        const library = store.open({
            name: 'libc.so.6',
            base: 0x7ffff7c00000,
            content: 'libc',
            bytes: () => crackmeBytes
        })
        await library.ready
        store.setSession('@lib/libc.so.6', library, true)
        emulator.canExecute = true
        emulator.buildSources = { entry: 'crackme', files: { ...session.project.files } }
        flushSync()
        await session.revealSourceLocation('@lib/libc.so.6', 10)
        flushSync()
        const group = session.groups[0]
        expect(group.displayedLibraryListing).toBe(true)
        expect(session.annotatablePath(group)).toBeUndefined()
        expect(
            session.renameTargetAt(group, group.displayedListing!.listing!.labels[0].line, 0)
        ).toBe(undefined)

        emulator.canExecute = false
        emulator.buildSources = undefined
        emulator.listings!.clearSession()
        //the program a Build saved is a File of the Project, which the person may name and comment
        //(ADR 0056): a later Build asks before it replaces them
        const sources = { entry: 'crackme', files: { ...session.project.files } }
        session.project.fileSystem.writeBytes('built', crackmeBytes, false, 'base64')
        session.project.recordBuild(
            makeBuildRecord(sources, 'built', session.project.files.built, [])
        )
        flushSync()
        session.selectFile('built', group)
        group.setView('built', 'listing', false)
        flushSync()
        await until(() => group.displayedListing?.status === 'ready')
        expect(group.displayedBuildOutputEntry).toBe('crackme')
        expect(session.annotatablePath(group)).toBe('built')
    })

    it('refused while a Build, a Run or the Testcases run, with the reason', async () => {
        const warn = vi.spyOn(toast, 'warn')
        const { session } = setup()
        const { group, listing } = await shown(session)
        const main = lineOf(listing, 'main:')
        //offered, so the key says why
        session.building = true
        expect(session.renameTargetAt(group, main, 0)).toBeDefined()
        expect(session.openRenamePrompt(group, main, 0)).toBe(false)
        expect(warn).toHaveBeenLastCalledWith('Wait for the Build to finish, then try again.')
        session.building = false
        session.running = true
        expect(session.openCommentPrompt(group, main)).toBe(false)
        expect(warn).toHaveBeenLastCalledWith('Pause the program to rename or comment.')
        session.running = false
        session.testing = true
        expect(session.renameLabel('crackme', MAIN, 'check_password')).toBe(false)
        expect(warn).toHaveBeenLastCalledWith('Wait for the Testcases to finish, then try again.')
        session.testing = false
        //a prompt open when a Build starts says so when saved, and stays
        session.openRenamePrompt(group, main, 0)
        group.openAnnotationPrompt!.input('check_password')
        session.building = true
        expect(session.saveAnnotationPrompt(group)).toBe(false)
        expect(group.openAnnotationPrompt!.failure).toBe(
            'Wait for the Build to finish, then try again.'
        )
        session.building = false
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(session.project.files.crackme.annotations?.names).toEqual({
            '0x11e9': 'check_password'
        })
    })
})

describe('Comment…', () => {
    it('writes a short comment at the end of its line, a longer one above it', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const lea = lineOf(listing, 'lea rdx, [rel s_hunter2]')
        const address = listing.lines.addresses[lea]
        expect(session.commentTargetAt(group, lea)).toEqual({ kind: 'comment', address })
        expect(session.openCommentPrompt(group, lea)).toBe(true)
        const prompt = group.openAnnotationPrompt!
        expect(prompt.spec).toMatchObject({
            kind: 'comment',
            title: `Comment at ${hex(address)}`,
            text: ''
        })
        expect(prompt.multiline).toBe(true)
        prompt.input('the password')
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(session.project.files.crackme.annotations).toEqual({
            comments: { [`0x${address.toString(16)}`]: 'the password' }
        })
        let commented = await current(session, group)
        const short = lineOf(commented, 'lea rdx, [rel s_hunter2]')
        expect(rowsOf(commented)[short]).toMatch(/; "hunter2" ; the password$/)
        //Comment… on it again edits the same comment
        session.openCommentPrompt(group, short)
        expect(group.openAnnotationPrompt!.spec.text).toBe('the password')
        group.openAnnotationPrompt!.input(
            'the password the program compares the input with, in .rodata\nnot encrypted'
        )
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        commented = await current(session, group)
        const long = lineOf(commented, 'lea rdx, [rel s_hunter2]')
        const rows = rowsOf(commented)
        expect(rows.slice(long - 2, long)).toEqual([
            '    ; the password the program compares the input with, in .rodata',
            '    ; not encrypted'
        ])
        expect(commented.lines.kinds[long - 1]).toBe(LINE_KIND.comment)
        //a comment's own line edits it, and Delete comment takes it away
        expect(session.commentTargetAt(group, long - 1)).toEqual({ kind: 'comment', address })
        expect(session.canDeleteCommentAt(group, long - 1)).toBe(true)
        expect(session.deleteCommentAt(group, long - 1)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
        expect(
            rowsOf(await current(session, group))[lineOf(listing, 'lea rdx, [rel s_hunter2]')]
        ).toBe(rowsOf(listing)[lea])
    })

    it('gives the reason a comment cannot be kept, and deletes one saved empty', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const lea = lineOf(listing, 'lea rdx, [rel s_hunter2]')
        session.setComment('crackme', listing.lines.addresses[lea], 'the password')
        session.openCommentPrompt(group, lea)
        const prompt = group.openAnnotationPrompt!
        const reason = (text: string) => {
            prompt.input(text)
            return prompt.problem
        }
        expect(reason('one\ntwo\n\tthree')).toBeUndefined()
        expect(reason('a\n'.repeat(40) + 'a')).toBe(
            'Comments can be up to 40 lines long. This one has 41.'
        )
        expect(reason('x'.repeat(4001))).toBe(
            'Comments can be up to 4,000 characters long. This one has 4,001.'
        )
        expect(reason('bell\u0007')).toBe(
            'This comment has a hidden control character. Remove it to save.'
        )
        expect(reason('   \n  ')).toBeUndefined()
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
    })

    it('comments on a function from its label’s line, or from any of its lines', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const main = lineOf(listing, 'main:')
        expect(session.commentTargetAt(group, main)).toMatchObject({
            kind: 'function comment',
            address: MAIN,
            function: { name: 'main' }
        })
        //its label's line has no Function comment… beside Comment…, which is it
        expect(session.commentTargetAt(group, main, true)).toBeUndefined()
        const call = lineOf(listing, 'call strcmp@plt', main)
        expect(session.commentTargetAt(group, call, true)).toMatchObject({
            kind: 'function comment',
            address: MAIN
        })
        expect(session.openCommentPrompt(group, call, true)).toBe(true)
        expect(group.openAnnotationPrompt!.spec.title).toBe('Comment on main')
        group.openAnnotationPrompt!.input('Asks for the password\nand checks it')
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(session.project.files.crackme.annotations).toEqual({
            functionComments: { '0x11e9': 'Asks for the password\nand checks it' }
        })
        const commented = await current(session, group)
        const label = lineOf(commented, 'main:')
        expect(rowsOf(commented).slice(label - 2, label)).toEqual([
            '; Asks for the password',
            '; and checks it'
        ])
        //its lines edit it too
        expect(session.commentTargetAt(group, label - 1)).toMatchObject({
            kind: 'function comment',
            address: MAIN
        })
    })

    it('is offered on lines with an address only', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        expect(session.commentTargetAt(group, 0)).toBeUndefined()
        const main = lineOf(listing, 'main:')
        expect(session.commentTargetAt(group, main - 1)).toBeUndefined()
        expect(session.canDeleteCommentAt(group, main + 1)).toBe(false)
    })
})

describe('Undo and Redo of renames and comments', () => {
    it('take back and bring back one step each, the Listing following', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const lea = lineOf(listing, 'lea rdx, [rel s_hunter2]')
        const address = `0x${listing.lines.addresses[lea].toString(16)}`
        expect(session.canUndoAnnotation('crackme')).toBe(false)
        session.renameLabel('crackme', MAIN, 'check_password')
        session.setComment('crackme', listing.lines.addresses[lea], 'the password')
        expect(session.project.files.crackme.annotations).toEqual({
            names: { '0x11e9': 'check_password' },
            comments: { [address]: 'the password' }
        })
        expect(session.canUndoAnnotation('crackme')).toBe(true)
        expect(session.canRedoAnnotation('crackme')).toBe(false)
        expect(session.undoAnnotation('crackme')).toBe(true)
        expect(session.project.files.crackme.annotations).toEqual({
            names: { '0x11e9': 'check_password' }
        })
        expect(session.undoAnnotation('crackme')).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
        expect(session.undoAnnotation('crackme')).toBe(false)
        expect(rowsOf(await current(session, group))).toContain('main:')
        expect(session.canUndoAnnotation('crackme', true)).toBe(true)
        expect(session.redoAnnotation('crackme')).toBe(true)
        expect(rowsOf(await current(session, group))).toContain('check_password:')
        //a new step forgets what Redo had
        session.setComment('crackme', MAIN, 'entry')
        expect(session.canUndoAnnotation('crackme', true)).toBe(false)
    })

    it('are refused where renames are, and follow the File’s rename, going with its deletion', async () => {
        const { session } = setup()
        await shown(session)
        session.renameLabel('crackme', MAIN, 'check_password')
        session.running = true
        expect(session.undoAnnotation('crackme')).toBe(false)
        session.running = false
        session.project.fileSystem.rename('crackme', 'crack')
        session.fileRenamed('crackme', 'crack')
        expect(session.canUndoAnnotation('crack')).toBe(true)
        expect(session.undoAnnotation('crack')).toBe(true)
        expect(session.project.files.crack.annotations).toBeUndefined()
        session.redoAnnotation('crack')
        session.project.fileSystem.remove('crack')
        session.fileDeleted('crack')
        //a new File at that path starts with no history
        session.project.fileSystem.writeBytes('crack', crackmeBytes, true, 'base64')
        expect(session.canUndoAnnotation('crack')).toBe(false)
    })

    it('start again when the File’s content is replaced, and survive a Byte edit', async () => {
        const { session } = setup()
        await shown(session)
        session.renameLabel('crackme', MAIN, 'check_password')
        //a Byte edit keeps the renames, and their history
        expect(session.editFileBytes('crackme', 0x201b, Uint8Array.of(0x33))).toBe(true)
        expect(session.project.files.crackme.annotations?.names).toEqual({
            '0x11e9': 'check_password'
        })
        expect(session.canUndoAnnotation('crackme')).toBe(true)
        //an upload over it drops both
        session.project.fileSystem.writeBytes('crackme', crackmeBytes, true, 'base64')
        expect(session.project.files.crackme.annotations).toBeUndefined()
        expect(session.canUndoAnnotation('crackme')).toBe(false)
    })
})

describe('the Listing made again', () => {
    it('keeps the text shown until the Listing with the change is ready', async () => {
        const { session, hold } = setup()
        const { group, listing } = await shown(session)
        const before = group.displayedListing
        const release = hold()
        session.renameLabel('crackme', MAIN, 'check_password')
        flushSync()
        //the new one is being made; the pane still shows the old one, with its model and text
        expect(session.listingFor(group.sourceSelection)?.status).toBe('generating')
        expect(group.displayedListing).toBe(before)
        expect(group.displayedCode).toBe(listing.text)
        expect(group.modelIdentity).toBeDefined()
        release()
        const renamed = await current(session, group)
        expect(group.displayedCode).toBe(renamed.text)
    })

    it('takes the navigation history back to the line of the address it left', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const revealed: number[] = []
        group.editor = {
            getModel: () => ({
                uri: {
                    scheme: 'asm-editor',
                    authority: session.languageSessionId,
                    path: '/live/crackme',
                    fragment: 'listing'
                },
                isDisposed: () => false,
                getLineCount: () => group.displayedListing!.listing!.text.split('\n').length
            }),
            revealLineInCenter: (line: number) => revealed.push(line),
            setPosition: ({ lineNumber }: { lineNumber: number }) =>
                session.cursorMoved(group, lineNumber - 1),
            getPosition: () => ({ lineNumber: group.cursorLine + 1, column: 1 }),
            focus: () => {}
        } as unknown as typeof group.editor
        const call = lineOf(listing, 'call strcmp@plt')
        session.cursorMoved(group, call)
        //a jump from the call to the function's start
        session.recordJump(group)
        session.cursorMoved(group, lineOf(listing, 'main:'))
        //three comment lines go in above the call, and one at the function's top
        const lea = lineOf(listing, 'lea rdx, [rel s_hunter2]')
        session.setComment('crackme', listing.lines.addresses[lea], 'a\nb\nc')
        session.setFunctionComment('crackme', MAIN, 'checks the password')
        const commented = await current(session, group)
        const moved = lineOf(commented, 'call strcmp@plt')
        expect(moved).toBe(call + 4)
        expect(await session.goBack(group)).toBe(true)
        expect(group.cursorLine).toBe(moved)
        expect(revealed.at(-1)).toBe(moved + 1)
    })
})

describe('saving renames and comments', () => {
    it('autosaves them as any change to the Files, and the archive keeps them', async () => {
        preferencesStore.values.autoSave.value = true
        const onSave = vi.fn()
        const onChange = vi.fn()
        const { session, project } = setup({ onSave, onChange })
        await shown(session)
        session.renameLabel('crackme', MAIN, 'check_password')
        session.setFunctionComment('crackme', MAIN, 'checks the password')
        await until(() => onSave.mock.calls.length > 0)
        expect(onSave).toHaveBeenCalledWith({ silent: true })
        const archived = makeProjectFromArchive(projectToArchive(project))
        expect(archived.project.files?.crackme).toEqual(project.files.crackme)
        expect(archived.project.files?.crackme.annotations).toEqual({
            names: { '0x11e9': 'check_password' },
            functionComments: { '0x11e9': 'checks the password' }
        })
    })

    it('loads them with the Project, its Listing showing them at once', async () => {
        const { session } = setup(
            {},
            {
                files: {
                    crackme: {
                        encoding: 'base64',
                        content: crackme,
                        annotations: { names: { '0x11e9': 'check_password' } }
                    },
                    'notes.txt': { encoding: 'plain', content: 'password?' }
                }
            }
        )
        const { listing } = await shown(session)
        expect(rowsOf(listing)).toContain('check_password:')
    })
})

describe('during a Debug session', () => {
    it('shows the Build’s version of the File with the live File’s renames and comments', async () => {
        const { session, emulator, store, setExecutableAnnotations } = setup()
        await shown(session)
        //a Build of crackme, stopped at main, shown in its running Listing
        const files: typeof session.project.files = JSON.parse(
            JSON.stringify(session.project.files)
        )
        emulator.buildSources = { entry: 'crackme', files }
        emulator.canExecute = true
        const program = store.openExecutable('crackme', files.crackme)!
        const listing = await program.ready
        store.setSession('crackme', program)
        await session.revealSourceLocation('crackme', lineOf(listing, 'main:'))
        flushSync()
        const group = session.groups[0]
        expect(group.sourceSelection.sourceKind).toBe('build')
        expect(session.annotatablePath(group)).toBe('crackme')
        session.openRenamePrompt(group, lineOf(listing, 'main:'), 0)
        group.openAnnotationPrompt!.input('check_password')
        expect(session.saveAnnotationPrompt(group)).toBe(true)
        expect(setExecutableAnnotations).toHaveBeenLastCalledWith('crackme', {
            names: { '0x11e9': 'check_password' }
        })
        //the Build's record keeps its bytes, and the version shown has the live File's names
        expect(files.crackme.annotations).toBeUndefined()
        expect(group.displayedFile?.annotations).toEqual({ names: { '0x11e9': 'check_password' } })
        expect(group.displayedFile?.content).toBe(files.crackme.content)
        //once the session's Listing goes, the Build's version is listed with them
        store.clearSession()
        flushSync()
        expect(rowsOf(await current(session, group))).toContain('check_password:')
    })
})

describe('the prompt', () => {
    it('saves on Enter, a comment’s Shift+Enter starting a new line, and closes on Escape', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        session.openCommentPrompt(group, lineOf(listing, 'main:'))
        const saved = vi.fn(() => session.saveAnnotationPrompt(group))
        const closed = vi.fn(() => session.closeAnnotationPrompt(group))
        const target = document.createElement('div')
        document.body.append(target)
        const view = mount(AnnotationPromptView, {
            target,
            props: { prompt: group.openAnnotationPrompt!, onsave: saved, onclose: closed }
        })
        disposers.push(() => unmount(view))
        flushSync()
        const dialog = target.querySelector<HTMLElement>('[role="dialog"]')!
        expect(dialog.getAttribute('aria-labelledby')).toBeTruthy()
        expect(target.textContent).toContain('Comment on main')
        const field = target.querySelector('textarea')!
        expect(field.getAttribute('aria-label')).toBe('Comment')
        //the keyboard goes to the comment as the prompt opens
        await tick()
        expect(document.activeElement).toBe(field)
        field.value = 'a'.repeat(4001)
        field.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        //the reason, as the field's description, and Save disabled
        const reason = target.querySelector<HTMLElement>('.annotation-error')!
        expect(reason.textContent).toBe(
            'Comments can be up to 4,000 characters long. This one has 4,001.'
        )
        expect(field.getAttribute('aria-describedby')).toBe(reason.id)
        expect(field.getAttribute('aria-invalid')).toBe('true')
        expect(target.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled).toBe(
            true
        )
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(saved).not.toHaveBeenCalled()
        field.value = 'checks the password'
        field.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        //Shift+Enter is the textarea's own
        const shift = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true })
        field.dispatchEvent(shift)
        expect(shift.defaultPrevented).toBe(false)
        expect(saved).not.toHaveBeenCalled()
        field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        expect(saved).toHaveBeenCalledOnce()
        expect(session.project.files.crackme.annotations?.functionComments).toEqual({
            '0x11e9': 'checks the password'
        })
        dialog.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
        expect(closed).toHaveBeenCalledOnce()
    })

    it('deletes a comment there is with Delete, as one undoable step, offered on no other', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const lea = lineOf(listing, 'lea rdx, [rel s_hunter2]')
        //a new comment has nothing to delete, and a name never has
        session.openCommentPrompt(group, lea)
        expect(group.openAnnotationPrompt!.deletable).toBe(false)
        session.openRenamePrompt(group, lineOf(listing, 'main:'), 0)
        expect(group.openAnnotationPrompt!.deletable).toBe(false)
        session.closeAnnotationPrompt(group)
        session.setComment('crackme', listing.lines.addresses[lea], 'the password')
        session.openCommentPrompt(group, lea)
        const closed = vi.fn(() => session.closeAnnotationPrompt(group))
        const target = document.createElement('div')
        document.body.append(target)
        const view = mount(AnnotationPromptView, {
            target,
            props: {
                prompt: group.openAnnotationPrompt!,
                onsave: () => session.saveAnnotationPrompt(group),
                onclose: closed
            }
        })
        disposers.push(() => unmount(view))
        flushSync()
        expect(target.querySelector('.annotation-hint')?.textContent).toBe(
            'Press Enter to save, Shift+Enter to add a line.'
        )
        //whatever the field holds, even text that cannot be saved
        const field = target.querySelector('textarea')!
        field.value = 'bell\u0007'
        field.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        const remove = [...target.querySelectorAll('button')].find(
            (button) => button.textContent === 'Delete'
        )!
        expect(remove.type).toBe('button')
        expect(remove.disabled).toBe(false)
        remove.click()
        expect(closed).toHaveBeenCalledOnce()
        expect(session.project.files.crackme.annotations).toBeUndefined()
        expect(session.undoAnnotation('crackme')).toBe(true)
        expect(Object.values(session.project.files.crackme.annotations?.comments ?? {})).toEqual([
            'the password'
        ])
        expect(session.redoAnnotation('crackme')).toBe(true)
        expect(session.project.files.crackme.annotations).toBeUndefined()
    })

    it('asks for a name in one line, with a jump target’s dot before it', async () => {
        const { session } = setup()
        const { group, listing } = await shown(session)
        const jne = lineOf(listing, 'jne .LAB_2', lineOf(listing, 'main:'))
        session.openRenamePrompt(group, jne, columnOf(listing, jne, 'LAB_2'))
        const target = document.createElement('div')
        document.body.append(target)
        const view = mount(AnnotationPromptView, {
            target,
            props: {
                prompt: group.openAnnotationPrompt!,
                onsave: () => session.saveAnnotationPrompt(group),
                onclose: () => session.closeAnnotationPrompt(group)
            }
        })
        disposers.push(() => unmount(view))
        flushSync()
        const field = target.querySelector('input')!
        expect(field.value).toBe('LAB_2')
        expect(field.getAttribute('aria-label')).toBe('Name')
        expect(target.querySelector('.annotation-prefix')?.textContent).toBe('.')
        field.value = 'wrong'
        field.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        target.querySelector('form')!.dispatchEvent(new SubmitEvent('submit', { cancelable: true }))
        expect(session.project.files.crackme.annotations?.names).toEqual({ '0x1291': 'wrong' })
    })
})
