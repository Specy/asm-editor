/**
 * The view switch in the execution dock and the views a Debug session moves a pane to
 * ([file-views.md](../../../../../docs/design/file-views.md), decisions 4 and 8; the plan's E6).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount, type ComponentProps } from 'svelte'
import { editorGroupsFixture } from './__fixtures__/editorGroups.svelte'
import type { EditorGroup } from './EditorGroup.svelte'
import type { WorkbenchSession } from './WorkbenchSession.svelte'
import { loadDecoder, type ListingDecoder } from '#lib/listing/decoder.ts'
import { generateListing } from '#lib/listing/generateListing.ts'
import { lineOfAddress, type Listing } from '#lib/listing/listing.ts'
import { ListingDocuments } from '#lib/listing/listingDocuments.svelte.ts'
import { encodeBase64 } from '#lib/projectFiles.ts'
import type { AvailableLanguages, StoredProject } from '#lib/Project.svelte.ts'
import ExecutionDock from '#cmp/specific/project/ExecutionDock.svelte'
import ExecutionControlsHarness from '#cmp/specific/workbench/__fixtures__/ExecutionControlsHarness.svelte'
import FaTh from '~icons/fa-solid/th'
import FaListOl from '~icons/fa-solid/list-ol'
import { tooltipText } from '#cmp/shared/floating/__fixtures__/tooltipText.ts'

//relative to the package, where the tests run: a DOM test's module URL is no file URL
const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')
const png = encodeBase64(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]))

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
 * A Project with an Executable, an image, other bytes, text and assembly, whose Build loads the
 * Executable and stops at `main` as the Emulator does: on the line of `main`'s first instruction
 * in the running program's Listing, generated for real.
 */
function setup(language: AvailableLanguages = 'X86', data: StoredProject = {}) {
    const fixture = editorGroupsFixture(language, {
        entry: 'crackme',
        files: {
            crackme: { encoding: 'base64', content: crackme },
            'image.png': { encoding: 'base64', content: png },
            'blob.bin': { encoding: 'base64', content: 'AQIDBA==' },
            'notes.txt': { encoding: 'plain', content: 'password?' },
            'main.asm': { encoding: 'plain', content: 'nop' }
        },
        ...data
    })
    disposers.push(fixture.dispose)
    const { emulator } = fixture
    const store = new ListingDocuments((order) =>
        Promise.resolve(generateListing(decoder, { ...order, version: 'v1' }))
    )
    emulator.listings = store
    const build = { main: -1, listing: undefined as Listing | undefined }
    emulator.compile = async (_historySize, sources) => {
        const files = JSON.parse(JSON.stringify(sources.files))
        emulator.buildSources = { ...sources, files }
        emulator.canExecute = true
        const program = store.openExecutable(sources.entry, files[sources.entry])!
        store.setSession(sources.entry, program)
        const listing = (build.listing = await program.ready)
        const main = listing.functions.find((item) => item.name === 'main')!
        build.main = lineOfAddress(listing, main.address)
        emulator.currentFile = sources.entry
        emulator.line = build.main
    }
    emulator.clear = () => {
        emulator.canExecute = false
        emulator.buildSources = undefined
        store.clearSession()
    }
    flushSync()
    return { ...fixture, build }
}

/** What a pane's dock holds, as the Workbench draws it: its buttons' names and which are pressed. */
function dock(
    session: WorkbenchSession,
    props: Omit<ComponentProps<typeof ExecutionControlsHarness>, 'session'>
) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(ExecutionControlsHarness, { target, props: { ...props, session } })
    flushSync()
    disposers.push(() => unmount(app))
    const read = () => ({
        buttons: [...target.querySelectorAll('button')].map(
            (button) => button.getAttribute('aria-label') ?? button.textContent?.trim()
        ),
        pressed: [...target.querySelectorAll('[aria-pressed="true"]')].map((button) =>
            button.getAttribute('aria-label')
        ),
        views: target.querySelector('[role="group"][aria-label="View"]')
    })
    const press = (label: string) => {
        target.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!.click()
        flushSync()
    }
    return { read, press }
}

function show(session: WorkbenchSession, path: string, group: EditorGroup = session.groups[0]) {
    session.selectFile(path, group)
    flushSync()
    return group
}

describe('the view switch', () => {
    it('offers Disassemble · Decompile · Hex for an Executable, Preview · Hex for an image, none otherwise', () => {
        const { session } = setup()
        expect(show(session, 'crackme').viewSwitch).toEqual(['listing', 'pseudocode', 'hex'])
        expect(show(session, 'image.png').viewSwitch).toEqual(['preview', 'hex'])
        expect(show(session, 'blob.bin').viewSwitch).toEqual([])
        expect(show(session, 'notes.txt').viewSwitch).toEqual([])
        //an ELF a Build cannot run is bytes, with the Hex editor alone
        const mips = setup('MIPS').session
        expect(show(mips, 'crackme').viewSwitch).toEqual([])
    })

    it('draws one button per view in the dock, the shown one pressed, and switches on a press', () => {
        const { session, project } = setup()
        const group = show(session, 'crackme')
        const { read, press } = dock(session, { group })
        //an Executable opens on its Listing, its Build called Debug (reverse-engineering-ux.md,
        //decisions 10 and 13)
        expect(read().buttons).toEqual(['Debug', 'Disassemble', 'Decompile', 'Hex'])
        expect(read().pressed).toEqual(['Disassemble'])
        press('Hex')
        expect(group.displayedView).toBe('hex')
        expect(read().pressed).toEqual(['Hex'])
        //the person's choice, saved as the File's last view
        expect(project.fileViews).toEqual({ crackme: 'hex' })
        //and its default, which is no choice to save
        press('Disassemble')
        expect(group.displayedView).toBe('listing')
        expect(project.fileViews).toBeUndefined()

        show(session, 'image.png')
        expect(read().buttons).toEqual(['Preview', 'Hex'])
        expect(read().pressed).toEqual(['Preview'])
        press('Hex')
        expect(group.displayedView).toBe('hex')
        show(session, 'blob.bin')
        expect(read().views).toBeNull()
    })

    it('stays in the dock during a Debug session', async () => {
        const { session } = setup()
        const group = show(session, 'crackme')
        const { read, press } = dock(session, { group })
        await session.build()
        await tick()
        flushSync()
        expect(read().buttons).toEqual([
            'Stop',
            'Run',
            'Undo',
            'Step',
            'Disassemble',
            'Decompile',
            'Hex'
        ])
        expect(read().pressed).toEqual(['Disassemble'])
        //The file/memory distinction lives in Hex's tooltip rather than a persistent notice.
        press('Hex')
        expect(group.displayedView).toBe('hex')
        expect(group.bytesReadOnly).toMatch(/Debug session/)
        expect(group.bytesNotice).toBeUndefined()
        expect(tooltipText(read().views?.querySelector('button[aria-label="Hex"]'))).toContain(
            'Changes made while debugging appear in the Memory view.'
        )
    })

    it("gives a pane showing such a File a dock with the switch on every device's layout", () => {
        const { session } = setup(undefined, { openTabs: ['main.asm'] })
        const left = show(session, 'main.asm')
        //a split of a pane with one tab opens empty
        const right = show(session, 'crackme', session.splitEditor())
        expect(left.displayedPath).toBe('main.asm')
        //main.asm is no Entry file, so its pane has no Build and no dock; the Executable's has its
        //switch on every device, and on a desktop and a phone its Build, which a tablet puts in one
        //bar of its own
        for (const controls of [true, false]) {
            expect(left.hasDock(controls)).toBe(false)
            expect(right.hasDock(controls)).toBe(true)
        }
        expect(session.controlsGroup).toBe(right)
        //a dock without the controls: its switch alone
        expect(dock(session, { group: right, execution: false }).read().buttons).toEqual([
            'Disassemble',
            'Decompile',
            'Hex'
        ])
        //a tablet's shared bar leaves the switch to the pane's own dock
        expect(
            dock(session, { group: right, fill: true, showViews: false }).read().buttons
        ).toEqual(['Debug'])
        //a phone's dock along the bottom edge of a pane showing the Executable
        show(session, 'crackme', left)
        expect(dock(session, { group: left, fill: true, attached: true }).read().buttons).toEqual([
            'Debug',
            'Disassemble',
            'Decompile',
            'Hex'
        ])
        //text and other bytes have no switch, and no dock for it
        show(session, 'notes.txt', right)
        expect(right.hasDock(false)).toBe(false)
        show(session, 'blob.bin', right)
        expect(right.hasDock(false)).toBe(false)
    })
})

describe('the views of a Debug session', () => {
    it("moves a pane from an Executable's bytes to its Listing, on main, without saving it", async () => {
        const { session, project, build } = setup()
        const group = show(session, 'crackme')
        group.setView('crackme', 'hex', false)
        flushSync()
        expect(group.displayedView).toBe('hex')
        await session.build()
        await tick()
        flushSync()
        expect(group.displayedView).toBe('listing')
        expect(group.sourceSelection).toMatchObject({ sourceKind: 'build', path: 'crackme' })
        expect(group.displayedListing?.status).toBe('ready')
        //the program counter's line: main's first instruction
        expect(build.main).toBeGreaterThan(0)
        expect(build.listing!.text.split('\n')[build.main - 1]).toBe('main:')
        expect(group.instructionLine).toBe(build.main)
        expect(group.highlightedLine).toBe(build.main)
        expect(project.fileViews).toBeUndefined()

        //Stop changes no view
        session.stop()
        flushSync()
        expect(group.sourceSelection).toEqual({ sourceKind: 'live', path: 'crackme' })
        expect(group.displayedView).toBe('listing')
        expect(group.instructionLine).toBe(-1)
    })

    it('reveals main once the pane moved to the Listing holds its model, keeping the focus', async () => {
        const { session, build } = setup()
        const group = show(session, 'crackme')
        group.setView('crackme', 'hex', false)
        await session.build()
        await tick()
        //the editor the Listing mounts, holding the Build's model a moment later
        const revealed: number[] = []
        const focus = vi.fn()
        group.editor = {
            getModel: () => ({
                uri: {
                    scheme: 'asm-editor',
                    authority: session.languageSessionId,
                    path: `/build-${session.buildGeneration}/crackme`,
                    fragment: 'listing'
                },
                isDisposed: () => false,
                getLineCount: () => build.listing!.text.split('\n').length
            }),
            revealLineInCenter: (line: number) => revealed.push(line),
            setPosition: () => {},
            focus
        } as unknown as typeof group.editor
        await new Promise((resolve) => setTimeout(resolve, 120))
        expect(revealed).toEqual([build.main + 1])
        expect(focus).not.toHaveBeenCalled()
    })

    it('leaves the bytes where another pane shows the Listing', async () => {
        const { session, build } = setup()
        const left = show(session, 'crackme')
        const right = show(session, 'crackme', session.splitEditor())
        left.setView('crackme', 'hex', false)
        flushSync()
        await session.build()
        await tick()
        flushSync()
        expect([left.displayedView, right.displayedView]).toEqual(['hex', 'listing'])
        expect(session.executionGroupId).toBe(right.id)
        expect(right.highlightedLine).toBe(build.main)
        expect(left.instructionLine).toBe(-1)
    })

    it('opens the Executable on its Listing in the execution pane when no pane shows it', async () => {
        const { session, build } = setup()
        const group = show(session, 'notes.txt')
        await session.build()
        await tick()
        flushSync()
        expect(group.displayedPath).toBe('crackme')
        expect(group.displayedView).toBe('listing')
        expect(group.highlightedLine).toBe(build.main)
    })
})

describe('the execution dock', () => {
    it('offers Build and Test beside an Entry file alone, and the controls of a Debug session', async () => {
        const testcase = {
            input: [],
            expectedOutput: '',
            startingRegisters: {},
            expectedRegisters: {},
            startingMemory: [],
            expectedMemory: []
        }
        const { session } = setup(undefined, { testcases: [testcase] })
        const group = show(session, 'notes.txt')
        const { read } = dock(session, { group })
        //text and other bytes have no dock at all, an image its switch alone
        expect(session.controlsGroup).toBe(group)
        expect(group.hasDock(true)).toBe(false)
        expect(read().buttons).toEqual([])
        show(session, 'blob.bin')
        expect(group.hasDock(true)).toBe(false)
        show(session, 'image.png')
        expect(read().buttons).toEqual(['Preview', 'Hex'])
        //nor has assembly that is no Entry file: a Build builds the Program whose Entry file the
        //pane shows (programs.md, decision 5)
        show(session, 'main.asm')
        expect(group.hasDock(true)).toBe(false)
        expect(read().buttons).toEqual([])
        //the Entry file's pane has its Program's Build, and its Test while it has Testcases
        show(session, 'crackme')
        expect(group.hasDock(true)).toBe(true)
        expect(read().buttons).toEqual(['Debug', 'Disassemble', 'Decompile', 'Hex', 'Test'])
        await session.build()
        await tick()
        flushSync()
        //during the Debug session the controls stay on the pane execution is followed in, whatever
        //it shows, and Test is the session's Program's
        show(session, 'notes.txt')
        expect(session.controlsGroup).toBe(group)
        expect(group.hasDock(true)).toBe(true)
        expect(read().buttons).toEqual(['Stop', 'Run', 'Undo', 'Step', 'Test'])
    })

    it('puts the controls beside an Executable rather than a document', () => {
        const { session } = setup(undefined, { openTabs: ['crackme'] })
        const left = show(session, 'crackme')
        const right = show(session, 'notes.txt', session.splitEditor())
        expect(session.controlsGroup).toBe(left)
        expect(left.hasDock(true)).toBe(true)
        expect(right.hasDock(true)).toBe(false)
    })

    it('draws the views after the controls, in or out of a Debug session', () => {
        const onChange = vi.fn()
        const views = {
            options: [
                { id: 'hex', label: 'Hex', title: 'Bytes', icon: FaTh },
                { id: 'listing', label: 'Disassemble', title: 'Listing', icon: FaListOl }
            ],
            value: 'hex',
            onChange
        }
        const props = {
            debugging: false,
            building: false,
            running: false,
            buildDisabled: false,
            executionDisabled: false,
            canUndo: false,
            views,
            onBuild: () => {},
            onStop: () => {},
            onRun: () => {},
            onPause: () => {},
            onUndo: () => {},
            onStep: () => {}
        }
        for (const debugging of [false, true]) {
            const target = document.createElement('div')
            const app = mount(ExecutionDock, { target, props: { ...props, debugging } })
            flushSync()
            const group = target.querySelector('[role="group"][aria-label="View"]')!
            const buttons = [...group.querySelectorAll('button')]
            expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
                'true',
                'false'
            ])
            //the editor's one choice control, set apart from the dock's buttons by a divider
            expect(group.classList.contains('segmented-control')).toBe(true)
            expect(buttons.every((button) => !button.classList.contains('tool'))).toBe(true)
            expect(group.parentElement?.previousElementSibling?.classList.contains('divider')).toBe(
                true
            )
            buttons[1].click()
            expect(onChange).toHaveBeenLastCalledWith('listing')
            unmount(app)
        }
    })
})
