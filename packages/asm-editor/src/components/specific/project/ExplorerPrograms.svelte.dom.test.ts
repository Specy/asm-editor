/**
 * The Explorer's Programs ([programs.md](../../../../../../docs/design/programs.md), decisions 6, 7,
 * 8 and 11): the mark on every Entry file's row, "New program from this file" and "Remove program"
 * in a row's menu, a line for each Program whose Entry is missing, and the prompts that name what a
 * deletion takes with the File.
 */
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import Explorer from './Explorer.svelte'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import type { ProgramChoice } from '#lib/workbench/WorkbenchSession.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

const crackme = readFileSync('../x86/blink-js/tests/fixtures/elf/crackme').toString('base64')

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

type Loss = { settings: boolean; testcases: number }

/**
 * An Explorer over two Programs, `main.s` selected and `sort.s`, beside Files that are no Entry:
 * an include, an extension-less File, notes, C source and an ELF. Its props are reactive, so a
 * test can lock it or change the Programs, and `calls` records the hooks in the order they ran.
 */
function explorer(language: AvailableLanguages = 'RISC-V', losses: Record<string, Loss> = {}) {
    const fileSystem = new FileSystem({
        'main.s': { encoding: 'plain', content: 'nop' },
        'sort.s': { encoding: 'plain', content: 'nop' },
        'macros.inc': { encoding: 'plain', content: '' },
        lib: { encoding: 'plain', content: '' },
        'notes.txt': { encoding: 'plain', content: 'notes' },
        'add.c': { encoding: 'plain', content: 'int add(int a, int b) { return a + b; }' },
        'src/main.s': { encoding: 'plain', content: 'nop' },
        chall: { encoding: 'base64', content: crackme }
    })
    const target = document.createElement('div')
    document.body.append(target)
    const calls: string[] = []
    const record =
        (name: string) =>
        (...args: string[]) =>
            calls.push(`${name} ${args.join(' ')}`)
    const props = $state({
        files: fileSystem.files,
        fileSystem,
        language,
        programs: [
            { entry: 'main.s', label: 'main.s', missing: false },
            { entry: 'sort.s', label: 'sort.s', missing: false }
        ] as ProgramChoice[],
        selectedProgram: 'main.s' as string | undefined,
        selectedPath: 'main.s',
        locked: false,
        onSelect: vi.fn(),
        onNewProgram: vi.fn(record('new')),
        onRemoveProgram: vi.fn(record('remove')),
        programLoss: (path: string) => losses[path],
        onDeleted: vi.fn(record('deleted')),
        onRenamed: vi.fn(record('renamed')),
        onFilesAdded: vi.fn((paths: string[]) => calls.push(`added ${paths.join(' ')}`))
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
    const row = (path: string) => target.querySelector<HTMLElement>(`.tree-row[title="${path}"]`)!
    /** The entries of the menu a right click on `path`'s row opens, by label. */
    const menu = async (path: string) => {
        window.dispatchEvent(new Event('blur'))
        flushSync()
        row(path).dispatchEvent(
            new MouseEvent('contextmenu', {
                bubbles: true,
                cancelable: true,
                clientX: 5,
                clientY: 5
            })
        )
        flushSync()
        await tick()
        return new Map(
            [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].map((item) => [
                item.textContent!.trim(),
                item
            ])
        )
    }
    const choose = async (path: string, label: string) => {
        const item = (await menu(path)).get(label)
        if (!item) throw new Error(`No ${label} in the menu of ${path}`)
        item.click()
        flushSync()
        //the prompts answer asynchronously
        await new Promise((resolve) => setTimeout(resolve, 0))
        flushSync()
    }
    return { target, props, fileSystem, calls, row, menu, choose }
}

describe('the Entry marks', () => {
    it("marks every Entry file's row, the Selected program's in the accent colour", () => {
        const view = explorer()
        const mark = (path: string) => view.row(path).querySelector('.entry-mark')
        expect(mark('main.s')?.textContent).toBe('ENTRY')
        expect(mark('main.s')?.classList.contains('selected')).toBe(true)
        expect(mark('main.s')?.getAttribute('title')).toBe('Entry of the selected program')
        expect(mark('sort.s')?.classList.contains('selected')).toBe(false)
        expect(mark('sort.s')?.getAttribute('title')).toBe('Entry of a program')
        expect(mark('macros.inc')).toBeNull()
        expect(mark('src/main.s')).toBeNull()

        view.props.selectedProgram = 'sort.s'
        flushSync()
        expect(mark('sort.s')?.classList.contains('selected')).toBe(true)
        expect(mark('main.s')?.classList.contains('selected')).toBe(false)
    })

    it('marks the one Program of a Project as the selected one', () => {
        const view = explorer()
        view.props.programs = [{ entry: 'main.s', label: 'main.s', missing: false }]
        flushSync()
        expect(view.target.querySelectorAll('.entry-mark')).toHaveLength(1)
        expect(view.row('main.s').querySelector('.entry-mark.selected')).not.toBeNull()
    })

    it("offers the menu's Program items as the touch screens' row buttons too", async () => {
        //iOS Safari opens no context menu on a long press, so a touch screen reaches them here
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        const view = explorer()
        const labels = (path: string) =>
            [...view.row(path).querySelectorAll('.row-actions button')].map((button) =>
                button.getAttribute('aria-label')
            )
        for (const path of ['main.s', 'sort.s'])
            expect(labels(path), path).toEqual(['Remove program', 'Download', 'Rename', 'Delete'])
        for (const path of ['macros.inc', 'lib', 'src/main.s'])
            expect(labels(path), path).toEqual([
                'New program from this file',
                'Download',
                'Rename',
                'Delete'
            ])
        for (const path of ['notes.txt', 'add.c', 'chall'])
            expect(labels(path), path).toEqual(['Download', 'Rename', 'Delete'])
        const press = async (path: string, label: string) => {
            view.row(path)
                .querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
                .click()
            flushSync()
            await new Promise((resolve) => setTimeout(resolve, 0))
        }
        await press('macros.inc', 'New program from this file')
        await press('sort.s', 'Remove program')
        expect(view.calls).toEqual(['new macros.inc', 'remove sort.s'])
        expect(confirm).not.toHaveBeenCalled()
        view.props.locked = true
        flushSync()
        expect(
            view
                .row('lib')
                .querySelector<HTMLButtonElement>('button[aria-label="New program from this file"]')
                ?.disabled
        ).toBe(true)
        expect(
            view
                .row('main.s')
                .querySelector<HTMLButtonElement>('button[aria-label="Remove program"]')?.disabled
        ).toBe(true)
    })

    it('says which Program has its Entry missing, one line each', () => {
        const view = explorer()
        expect(view.target.querySelector('.entry-warning')).toBeNull()
        view.props.programs = [
            { entry: 'gone.s', label: 'gone.s', missing: true },
            { entry: 'main.s', label: 'main.s', missing: false },
            { entry: 'old.s', label: 'old.s', missing: true }
        ]
        flushSync()
        expect(
            [...view.target.querySelectorAll('.entry-warning')].map((line) =>
                line.textContent?.trim()
            )
        ).toEqual(['Program entry missing: gone.s', 'Program entry missing: old.s'])
    })
})

describe('the menu', () => {
    it('offers New program on assembly Files that are no Entry, Remove program on an Entry', async () => {
        const view = explorer()
        for (const path of ['macros.inc', 'lib', 'src/main.s']) {
            const items = await view.menu(path)
            expect(items.has('New program from this file'), path).toBe(true)
            expect(items.has('Remove program'), path).toBe(false)
        }
        for (const path of ['notes.txt', 'add.c', 'chall']) {
            const items = await view.menu(path)
            expect(items.has('New program from this file'), path).toBe(false)
            expect(items.has('Remove program'), path).toBe(false)
        }
        const entry = await view.menu('sort.s')
        expect(entry.has('Remove program')).toBe(true)
        expect(entry.has('New program from this file')).toBe(false)
        //the item it replaced is gone
        expect(entry.has('Set as entry file')).toBe(false)
    })

    it('offers New program on a supported Executable in an x86 Project', async () => {
        const view = explorer('X86')
        expect((await view.menu('chall')).has('New program from this file')).toBe(true)
        await view.choose('chall', 'New program from this file')
        expect(view.calls).toEqual(['new chall'])
    })

    it('makes a Program of the File picked', async () => {
        const view = explorer()
        await view.choose('macros.inc', 'New program from this file')
        expect(view.calls).toEqual(['new macros.inc'])
    })

    it('disables both during a Debug session', async () => {
        const view = explorer()
        view.props.locked = true
        flushSync()
        expect((await view.menu('macros.inc')).get('New program from this file')?.disabled).toBe(
            true
        )
        expect((await view.menu('main.s')).get('Remove program')?.disabled).toBe(true)
    })

    it('removes a Program without asking when nothing goes with it, keeping the File', async () => {
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        const view = explorer()
        await view.choose('sort.s', 'Remove program')
        expect(confirm).not.toHaveBeenCalled()
        expect(view.calls).toEqual(['remove sort.s'])
        expect(view.fileSystem.files['sort.s']).toBeDefined()
    })

    it('asks before removing a Program whose Settings or Testcases go with it', async () => {
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(false)
        const view = explorer('RISC-V', { 'main.s': { settings: true, testcases: 3 } })
        await view.choose('main.s', 'Remove program')
        expect(confirm).toHaveBeenCalledWith(
            'Remove the program of main.s? This deletes its Settings and 3 Testcases; the File stays.'
        )
        expect(view.calls).toEqual([])
        confirm.mockResolvedValue(true)
        await view.choose('main.s', 'Remove program')
        expect(view.calls).toEqual(['remove main.s'])
    })
})

describe('deleting an Entry', () => {
    it.each<[string, Loss | undefined, string]>([
        [
            'main.s',
            { settings: true, testcases: 3 },
            'Delete main.s? This also deletes its program: its Settings and 3 Testcases.'
        ],
        [
            'main.s',
            { settings: true, testcases: 0 },
            'Delete main.s? This also deletes its program: its Settings.'
        ],
        [
            'main.s',
            { settings: false, testcases: 1 },
            'Delete main.s? This also deletes its program: its 1 Testcase.'
        ],
        //a Program with nothing decided goes without a word, as a File does
        ['main.s', { settings: false, testcases: 0 }, 'Delete main.s?'],
        ['notes.txt', undefined, 'Delete notes.txt?']
    ])('asks to delete %s naming what goes with it (%o)', async (path, loss, question) => {
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        const view = explorer('RISC-V', loss ? { [path]: loss } : {})
        await view.choose(path, 'Delete')
        expect(confirm).toHaveBeenCalledWith(question)
        expect(view.fileSystem.files[path]).toBeUndefined()
        //the host's hook deletes the Program
        expect(view.calls).toEqual([`deleted ${path}`])
    })

    it('deletes the Program at a path a move replaces before moving the File there', async () => {
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        const view = explorer('RISC-V', { 'main.s': { settings: false, testcases: 2 } })
        const transfer = {
            types: [] as string[],
            effectAllowed: 'all',
            dropEffect: 'none',
            setData: () => {}
        }
        const drag = (type: string, target: Element) => {
            const event = new Event(type, { bubbles: true, cancelable: true })
            Object.defineProperty(event, 'dataTransfer', { value: transfer })
            target.dispatchEvent(event)
            flushSync()
        }
        const tree = view.target.querySelector('.file-tree')!
        drag('dragstart', view.row('src/main.s').querySelector('.file-select')!)
        drag('dragover', tree)
        drag('drop', tree)
        await vi.waitFor(() => expect(view.calls).toHaveLength(2))
        expect(confirm).toHaveBeenCalledWith(
            '"main.s" already exists in the project root. Replace it? This also deletes its program: its 2 Testcases.'
        )
        expect(view.calls).toEqual(['deleted main.s', 'renamed src/main.s main.s'])
        expect(view.fileSystem.files['src/main.s']).toBeUndefined()
    })
})

describe('renaming or moving an Entry onto a missing one', () => {
    /** The Explorer with `b.s` a Program whose Entry is missing, its Settings and Testcases kept. */
    function withMissing() {
        const view = explorer('RISC-V', { 'b.s': { settings: true, testcases: 2 } })
        view.props.programs = [
            { entry: 'b.s', label: 'b.s', missing: true },
            ...view.props.programs
        ]
        flushSync()
        return view
    }
    async function rename(view: ReturnType<typeof explorer>, path: string, name: string) {
        await view.choose(path, 'Rename')
        const input = view.target.querySelector<HTMLInputElement>('.name-input')!
        input.value = name
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        await new Promise((resolve) => setTimeout(resolve, 0))
        flushSync()
    }
    const question = 'Replace the program of b.s? This deletes its Settings and 2 Testcases.'

    it('asks before a rename replaces that Program, and keeps the name on No', async () => {
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(false)
        const view = withMissing()
        await rename(view, 'main.s', 'b.s')
        expect(confirm).toHaveBeenCalledWith(question)
        expect(view.fileSystem.files['main.s']).toBeDefined()
        expect(view.fileSystem.files['b.s']).toBeUndefined()
        expect(view.calls).toEqual([])
        expect(view.target.querySelector('.name-input')).toBeNull()

        confirm.mockResolvedValue(true)
        await rename(view, 'main.s', 'b.s')
        expect(view.fileSystem.files['b.s']).toBeDefined()
        expect(view.calls).toEqual(['renamed main.s b.s'])
    })

    it('renames a File that is no Entry without asking, as the Program there takes it', async () => {
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
        const view = withMissing()
        await rename(view, 'notes.txt', 'b.s')
        expect(confirm).not.toHaveBeenCalled()
        expect(view.calls).toEqual(['renamed notes.txt b.s'])
    })

    it('asks before a move replaces that Program', async () => {
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(false)
        const view = explorer('RISC-V', { 'src/sort.s': { settings: false, testcases: 1 } })
        view.props.programs = [
            ...view.props.programs,
            { entry: 'src/sort.s', label: 'src/sort.s', missing: true }
        ]
        flushSync()
        const transfer = {
            types: [] as string[],
            effectAllowed: 'all',
            dropEffect: 'none',
            setData: () => {}
        }
        const drag = (type: string, target: Element) => {
            const event = new Event(type, { bubbles: true, cancelable: true })
            Object.defineProperty(event, 'dataTransfer', { value: transfer })
            target.dispatchEvent(event)
            flushSync()
        }
        //the Entry sort.s into src, where src/sort.s is the missing Entry of a Program
        const folder = view.target.querySelector('.tree-row.directory[title="src"]')!
        drag('dragstart', view.row('sort.s').querySelector('.file-select')!)
        drag('dragover', folder)
        drag('drop', folder)
        await vi.waitFor(() => expect(confirm).toHaveBeenCalled())
        expect(confirm).toHaveBeenCalledWith(
            'Replace the program of src/sort.s? This deletes its 1 Testcase.'
        )
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(view.fileSystem.files['sort.s']).toBeDefined()
        expect(view.calls).toEqual([])
    })
})

describe('a test run', () => {
    it('refuses a deletion whose question was open when the Files were locked', async () => {
        let answer!: (confirmed: boolean) => void
        vi.spyOn(Prompt, 'confirm').mockReturnValue(
            new Promise<boolean>((resolve) => (answer = resolve))
        )
        const view = explorer()
        const deleted = view.choose('main.s', 'Delete')
        await new Promise((resolve) => setTimeout(resolve, 0))
        //a test run started while the question was open locks the Explorer, as SidePanel does
        view.props.locked = true
        flushSync()
        answer(true)
        await deleted
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(view.fileSystem.files['main.s']).toBeDefined()
        expect(view.calls).toEqual([])
    })
})

describe('the path a typed name makes', () => {
    /** Types `name` into the open inline input, and presses Enter. */
    async function type(view: ReturnType<typeof explorer>, name: string) {
        const input = view.target.querySelector<HTMLInputElement>('.name-input')!
        input.value = name
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        await new Promise((resolve) => setTimeout(resolve, 0))
        flushSync()
    }

    it('hands the host the path the File was renamed to, not the name as typed', async () => {
        const view = explorer()
        await view.choose('src/main.s', 'Rename')
        await type(view, '../b.s')
        expect(view.fileSystem.files['b.s']).toBeDefined()
        expect(view.calls).toEqual(['renamed src/main.s b.s'])
        expect(view.props.onSelect).toHaveBeenLastCalledWith('b.s')
        //an Entry's, whose Program the host moves to that path
        await view.choose('main.s', 'Rename')
        await type(view, './first.s')
        expect(view.calls).toEqual(['renamed src/main.s b.s', 'renamed main.s first.s'])
    })

    it('hands the host the path a new File was made at', async () => {
        const view = explorer()
        view.target.querySelector<HTMLButtonElement>('[title="New text file"]')!.click()
        flushSync()
        await type(view, './x.s')
        expect(view.fileSystem.files['x.s']).toBeDefined()
        expect(view.calls).toEqual(['added x.s'])
        expect(view.props.onSelect).toHaveBeenLastCalledWith('x.s')
    })

    it('refuses a name above the root, keeping the input open to fix it', async () => {
        const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        const view = explorer()
        await view.choose('notes.txt', 'Rename')
        await type(view, '../notes.txt')
        expect(error).toHaveBeenCalledWith('Path escapes the Project root')
        expect(view.fileSystem.files['notes.txt']).toBeDefined()
        expect(view.calls).toEqual([])
        expect(view.target.querySelector('.name-input')).not.toBeNull()
    })
})

describe('Files the Explorer adds', () => {
    it('reports a new File, so a Project with no Program can make its first', async () => {
        const view = explorer()
        view.props.programs = []
        view.props.selectedProgram = undefined
        flushSync()
        view.target.querySelector<HTMLButtonElement>('[aria-label="New text file"]')!.click()
        flushSync()
        const input = view.target.querySelector<HTMLInputElement>('.name-input')!
        input.value = 'bubble.s'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        expect(view.fileSystem.files['bubble.s']).toBeDefined()
        expect(view.calls).toEqual(['added bubble.s'])
    })
})
