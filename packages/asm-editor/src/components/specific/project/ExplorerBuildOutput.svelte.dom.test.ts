/**
 * The Explorer's Build output: the program the last Build linked, listed apart from the Project's
 * Files, opened, downloaded or kept as a File
 * ([ADR 0050](../../../../../../docs/adr/0050-the-built-program-is-a-build-output-never-saved.md)).
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import Explorer from './Explorer.svelte'
import { executableKind } from '#lib/executables.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { fileBytes } from '#lib/projectFiles.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

//an ELF stands in for the program a Build links
const program = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

//jsdom has no popovers, which the context menu opens as
beforeAll(() => {
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
})

const disposers: (() => Promise<void> | void)[] = []
afterEach(async () => {
    for (const dispose of disposers.splice(0)) await dispose()
    vi.restoreAllMocks()
})

function explorer() {
    const fileSystem = new FileSystem({ 'main.asm': { encoding: 'plain', content: 'nop' } })
    const target = document.createElement('div')
    document.body.append(target)
    const props = $state({
        files: fileSystem.files,
        fileSystem,
        language: 'X86' as const,
        programs: [{ entry: 'main.asm', label: 'main.asm', missing: false }],
        selectedProgram: 'main.asm',
        selectedPath: 'main.asm',
        locked: false,
        onSelect: vi.fn(),
        onFilesAdded: vi.fn(),
        buildOutput: { path: 'main', bytes: program, stale: false } as
            | { path: string; bytes: Uint8Array; stale: boolean }
            | undefined
    })
    //the Workbench hands the Explorer the Project's Files as they change
    const unsubscribe = fileSystem.subscribe(() => (props.files = fileSystem.files))
    const component = mount(Explorer, { target, props })
    flushSync()
    disposers.push(async () => {
        unsubscribe()
        await unmount(component)
        target.remove()
    })
    const list = () => target.querySelector('[aria-label="The program the last Build linked"]')
    const row = () => list()?.querySelector<HTMLElement>('.tree-row')
    /** Opens the row's menu and, once it has taken the keyboard, picks one of its entries. */
    const choose = async (label: string) => {
        row()!.dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 5,
                clientY: 5
            })
        )
        flushSync()
        await tick()
        const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
            (candidate) => candidate.textContent?.trim() === label
        )
        if (!item) throw new Error(`No ${label} in the menu`)
        item.click()
        flushSync()
    }
    return { props, fileSystem, list, row, choose }
}

it('lists the program under Build output, apart from the Files, and opens it', async () => {
    const view = explorer()
    expect(view.list()?.textContent).toContain('Build output')
    expect(view.row()?.textContent).toContain('main')
    expect(view.row()?.querySelector('[draggable="true"]')).toBeNull()
    view.row()!.querySelector<HTMLButtonElement>('.file-select')!.click()
    expect(view.props.onSelect).toHaveBeenCalledWith('main')
    await view.choose('Open')
    expect(view.props.onSelect).toHaveBeenCalledTimes(2)
    view.props.buildOutput = undefined
    flushSync()
    expect(view.list()).toBeNull()
})

it('dims a program from an earlier Build', () => {
    const view = explorer()
    expect(view.row()?.textContent).not.toContain('From an earlier Build')
    view.props.buildOutput = { path: 'main', bytes: program, stale: true }
    flushSync()
    expect(view.row()?.classList.contains('stale')).toBe(true)
    expect(view.row()?.textContent).toContain('From an earlier Build')
})

it('downloads its exact bytes under its name', async () => {
    const view = explorer()
    let saved: Blob | undefined
    URL.createObjectURL = vi.fn((blob: Blob) => ((saved = blob), 'blob:main'))
    URL.revokeObjectURL = vi.fn()
    const names: string[] = []
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement
    ) {
        names.push(this.download)
    })
    await view.choose('Download')
    expect(names).toEqual(['main'])
    //typed, or Chrome saves it as `main.txt`
    expect(saved!.type).toBe('application/octet-stream')
    expect(new Uint8Array(await saved!.arrayBuffer())).toEqual(program)
})

it('keeps it as a File stored as bytes, under a name that starts as its path', async () => {
    const view = explorer()
    const ask = vi.spyOn(Prompt, 'askText').mockResolvedValue('main')
    await view.choose('Keep as File')
    await vi.waitFor(() => expect(view.fileSystem.files.main).toBeDefined())
    expect(ask).toHaveBeenCalledWith(expect.any(String), true, 'main', 'main')
    const kept = view.fileSystem.files.main
    expect(kept.encoding).toBe('base64')
    expect(fileBytes(kept)).toEqual(program)
    //an ordinary Executable of the Project now, which a Project with no Program makes its first
    expect(executableKind(kept)).toBe('supported')
    expect(view.props.onFilesAdded).toHaveBeenCalledWith(['main'])
    await tick()
    expect(view.props.onSelect).toHaveBeenCalledWith('main')
})

it('refuses a name a File has, replacing nothing', async () => {
    const view = explorer()
    vi.spyOn(Prompt, 'askText').mockResolvedValue('main.asm')
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    await view.choose('Keep as File')
    await vi.waitFor(() => expect(error).toHaveBeenCalledWith('main.asm already exists'))
    expect(view.fileSystem.files['main.asm']).toEqual({ encoding: 'plain', content: 'nop' })
    expect(view.props.onSelect).not.toHaveBeenCalled()
    expect(view.props.onFilesAdded).not.toHaveBeenCalled()
})

it('keeps nothing during a Debug session, when the Files cannot change', async () => {
    const view = explorer()
    view.props.locked = true
    flushSync()
    const ask = vi.spyOn(Prompt, 'askText')
    await view.choose('Keep as File')
    expect(ask).not.toHaveBeenCalled()
})
