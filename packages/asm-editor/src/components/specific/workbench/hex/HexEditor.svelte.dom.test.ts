/**
 * The Hex editor in jsdom ([file-views.md](../../../../../../../docs/design/file-views.md),
 * decisions 3, 7 and 9; the plan's E3): typing overwrites bytes through the Edit journal, whose
 * Undo and Redo take each run back and put it back, and the grid draws only the rows in sight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import HexEditor from './HexEditor.svelte'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { EditJournal } from '#lib/editJournal.ts'
import type { ProjectFileKind } from '#lib/fileKinds.ts'
import { readFileSync } from 'node:fs'
import {
    cleanFiles,
    encodeBase64,
    fileBytes,
    type BuildSources,
    type ProjectFile,
    type ProjectFiles
} from '#lib/projectFiles.ts'
import { editorGroupsFixture } from '#lib/workbench/__fixtures__/editorGroups.svelte.ts'
import * as hexSearch from './hexSearch'

//`#lib/utils.ts`, which the data inspector reads numbers through, reaches the projects store and
//its IndexedDB, which jsdom does not have
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

const writeText = vi.fn(async (_text: string) => {})
beforeEach(() => {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } })
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
    writeText.mockClear()
})
afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
})

/** `ABCDEFGHIJKLMNOPQRSTUVWXYZ` and six more bytes, 32 in all: two rows. */
const ALPHABET = Uint8Array.from({ length: 32 }, (_, index) => (index < 26 ? 0x41 + index : index))

function setup(
    options: {
        bytes?: Uint8Array
        readOnly?: string
        file?: ProjectFile
        kind?: ProjectFileKind
        onShowInListing?: (offset: number) => void
    } = {}
) {
    let files = $state.raw<ProjectFiles>(
        cleanFiles({
            blob: options.file ?? {
                encoding: 'base64',
                content: encodeBase64(options.bytes ?? ALPHABET)
            }
        })
    )
    const fs = new FileSystem(
        {},
        {
            read: () => files,
            write: (next) => {
                files = next
            }
        }
    )
    const journal = new EditJournal(fs)
    /** Why each edit the FileSystem refused was refused, as the Workbench would say it. */
    const refused: string[] = []
    const target = document.createElement('div')
    document.body.appendChild(target)
    //a getter keeps the File the editor is given the FileSystem's current one
    const props = {
        path: 'blob',
        get file() {
            return files.blob
        },
        kind: options.kind ?? 'bytes',
        onShowInListing: options.onShowInListing,
        readOnly: options.readOnly,
        //as the Workbench session's: each run of typing an Edit step
        onEdit: (path: string, offset: number, bytes: Uint8Array) => {
            try {
                journal.change(path, 'Typing', { runs: [{ offset, bytes }] })
                return true
            } catch (error) {
                refused.push((error as Error).message)
                return false
            }
        },
        onUndoEdit: (path: string, redo: boolean) => {
            const made = journal.undo(path, redo)
            return made && 'runs' in made ? made.runs[0].offset : undefined
        }
    }
    const editor = mount(HexEditor, { target, props })
    flushSync()
    const grid = target.querySelector<HTMLElement>('[role="grid"]')!
    const key = (key: string, init: KeyboardEventInit = {}) => {
        grid.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
        flushSync()
    }
    return {
        fs,
        journal,
        refused,
        props,
        target,
        grid,
        key,
        type: (text: string) => Array.from(text).forEach((character) => key(character)),
        cell: (column: 'hex' | 'text', offset: number) =>
            target.querySelector<HTMLElement>(`[data-column="${column}"][data-offset="${offset}"]`),
        status: () => target.querySelector('.hex-status')!.textContent!.replace(/\s+/g, ' '),
        bytes: () => [...fs.readBytes('blob')],
        unmount: () => unmount(editor)
    }
}

describe('typing in the Hex editor', () => {
    it('overwrites digits in the hex column, shown at once and saved as one Edit step', () => {
        vi.useFakeTimers()
        const hex = setup()
        hex.key('ArrowRight')
        hex.type('7f4')
        //the typed digits show before they are saved
        expect(hex.cell('hex', 1)!.textContent).toBe('7F')
        expect(hex.cell('hex', 2)!.textContent).toBe('43')
        expect(hex.cell('text', 2)!.textContent).toBe('C')
        expect(hex.bytes().slice(0, 3)).toEqual([0x41, 0x42, 0x43])
        hex.type('5')
        expect(hex.cell('text', 2)!.textContent).toBe('E')
        vi.advanceTimersByTime(1000)
        flushSync()
        expect(hex.journal.journalOf('blob')?.undo.map((step) => step.change)).toEqual([
            { runs: [{ offset: 1, bytes: Uint8Array.from([0x42, 0x43]) }] }
        ])
        expect(hex.bytes().slice(0, 4)).toEqual([0x41, 0x7f, 0x45, 0x44])
    })

    it('overwrites characters in the text column, Tab moving between the columns', () => {
        const hex = setup()
        hex.key('Tab')
        hex.type('hi')
        //moving the caret saves the run
        hex.key('ArrowRight')
        expect(hex.bytes().slice(0, 4)).toEqual([0x68, 0x69, 0x43, 0x44])
        //a key that is no hex digit types nothing there
        hex.key('Tab', { shiftKey: true })
        hex.type('xyz')
        expect(hex.cell('hex', 3)!.textContent).toBe('44')
        expect(hex.fs.files.blob.encoding).toBe('base64')
    })

    it('undoes and redoes a whole run of typing', () => {
        const hex = setup()
        hex.type('00')
        hex.key('ArrowRight')
        hex.type('11')
        hex.key('z', { ctrlKey: true })
        expect(hex.bytes().slice(0, 3)).toEqual([0x00, 0x42, 0x43])
        hex.key('z', { ctrlKey: true })
        expect(hex.fs.files.blob.content).toBe(encodeBase64(ALPHABET))
        hex.key('y', { ctrlKey: true })
        expect(hex.bytes().slice(0, 3)).toEqual([0x00, 0x42, 0x43])
        hex.key('z', { ctrlKey: true, shiftKey: true })
        expect(hex.bytes().slice(0, 3)).toEqual([0x00, 0x42, 0x11])
    })

    it('saves what was typed when it closes', () => {
        const hex = setup()
        hex.type('ff')
        hex.unmount()
        expect(hex.bytes()[0]).toBe(0xff)
    })

    it('types nothing while the File is read-only', () => {
        const hex = setup({ readOnly: 'The Files are read-only during a Debug session' })
        hex.type('00')
        hex.key('Tab')
        hex.type('Q')
        hex.key('ArrowRight')
        expect(hex.fs.files.blob.content).toBe(encodeBase64(ALPHABET))
        expect(hex.cell('hex', 0)!.textContent).toBe('41')
        expect(hex.status()).toContain('read-only')
        expect(hex.grid.getAttribute('aria-readonly')).toBe('true')
    })

    it("keeps the Workbench's keys from reaching it", () => {
        const hex = setup()
        const workbench = vi.fn()
        window.addEventListener('keydown', workbench)
        //Shift+B builds from anywhere else; here it is the digit B
        hex.key('B', { shiftKey: true })
        window.removeEventListener('keydown', workbench)
        expect(workbench).not.toHaveBeenCalled()
        expect(hex.cell('hex', 0)!.textContent).toBe('B1')
    })
})

describe('typing over a File stored as text', () => {
    /** `C3 A9 20 61 62`: a character of two bytes, then ASCII. */
    const notes = { encoding: 'plain', content: 'é ab' } as const

    it('changes its text, and undoes by writing back what it wrote over', () => {
        const hex = setup({ file: notes, kind: 'markdown' })
        expect(hex.grid.getAttribute('aria-readonly')).toBe('false')
        hex.key('End')
        hex.key('ArrowLeft')
        hex.key('Tab')
        hex.type('XY')
        hex.key('ArrowLeft')
        expect(hex.fs.files.blob).toEqual({ encoding: 'plain', content: 'é XY' })
        hex.key('z', { ctrlKey: true })
        expect(hex.fs.files.blob.content).toBe('é ab')
        hex.key('y', { ctrlKey: true })
        expect(hex.fs.files.blob).toEqual({ encoding: 'plain', content: 'é XY' })
    })

    it('waits for the rest of a character typed in hex, and refuses one left cut in two', () => {
        vi.useFakeTimers()
        const hex = setup({ file: notes, kind: 'markdown' })
        hex.key('ArrowRight')
        hex.key('ArrowRight')
        hex.type('c3')
        vi.advanceTimersByTime(1000)
        flushSync()
        //`C3 61` is not UTF-8: what was typed waits, shown, for the character's second byte
        expect(hex.fs.files.blob.content).toBe('é ab')
        expect(hex.cell('hex', 2)!.textContent).toBe('C3')
        hex.type('a8')
        vi.advanceTimersByTime(1000)
        flushSync()
        expect(hex.fs.files.blob.content).toBe('éèb')
        //a letter over the first byte of `é` strands its second: the caret leaving says why not
        hex.key('Home')
        hex.key('Tab')
        hex.type('e')
        hex.key('End')
        expect(hex.refused).toEqual([expect.stringContaining('no longer UTF-8')])
        expect(hex.fs.files.blob.content).toBe('éèb')
        expect(hex.cell('text', 0)!.textContent).toBe('.')
    })
})

describe('selecting and copying', () => {
    it('selects with Shift and copies in the form of the caret’s column', () => {
        const hex = setup()
        hex.key('ArrowRight', { shiftKey: true })
        hex.key('ArrowRight', { shiftKey: true })
        hex.key('ArrowDown', { shiftKey: true })
        expect(hex.status()).toContain('19 bytes selected')
        expect(hex.cell('hex', 10)!.getAttribute('aria-selected')).toBe('true')
        expect(hex.cell('hex', 19)!.getAttribute('aria-selected')).toBe('false')
        hex.key('Escape')
        hex.key('ArrowRight', { shiftKey: true })
        hex.key('ArrowRight', { shiftKey: true })
        hex.key('ArrowRight', { shiftKey: true })
        hex.key('c', { ctrlKey: true })
        expect(writeText).toHaveBeenLastCalledWith('53 54 55 56')
        hex.key('Tab')
        hex.key('c', { ctrlKey: true })
        expect(writeText).toHaveBeenLastCalledWith('STUV')
        //with nothing selected, the caret's byte
        hex.key('ArrowLeft')
        hex.key('c', { ctrlKey: true })
        expect(writeText).toHaveBeenLastCalledWith('U')
    })

    it('copies from its context menu', async () => {
        const hex = setup()
        hex.cell('hex', 26)!.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        )
        //the menu focuses its first item once it is open
        await tick()
        const item = [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')].find(
            (button) => button.textContent?.includes('Copy as hex')
        )
        item!.click()
        flushSync()
        expect(writeText).toHaveBeenLastCalledWith('1a')
    })
})

function findStatus(target: HTMLElement) {
    const status = target.querySelector('.hex-find-bar [role="status"]')
    return status ? [...status.children].map((child) => child.textContent).join(' · ') : ''
}

describe('going to an offset and finding', () => {
    it('goes to an offset typed in hex or in decimal', () => {
        const hex = setup()
        hex.key('g', { ctrlKey: true })
        const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
        input.value = '#20'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        expect(hex.status()).toContain('Offset 0x0014')
        expect(hex.target.querySelector('.hex-find-bar')).toBeNull()
        hex.key('g', { ctrlKey: true })
        const again = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
        again.value = '0x40'
        again.dispatchEvent(new Event('input', { bubbles: true }))
        again.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        expect(findStatus(hex.target)).toBe('0x40 is past the end, at 0x1f')
    })

    it('finds hex bytes with wildcards, next and previous, wrapping round', () => {
        const hex = setup({ bytes: Uint8Array.from([0, 0x4c, 9, 0x46, 0, 0x4c, 8, 0x46, 0]) })
        hex.key('f', { ctrlKey: true })
        const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
        expect(hex.target.querySelector('.hex-find-bar [role="status"]')).toBeNull()
        input.value = '4c ?? 46'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        const enter = (shiftKey = false) => {
            input.dispatchEvent(
                new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true })
            )
            flushSync()
        }
        enter()
        expect(hex.status()).toContain('Offset 0x0001')
        expect(hex.status()).toContain('3 bytes selected')
        expect(findStatus(hex.target)).toBe('Offset 0x0001 · 1 of 2')
        expect(
            hex.target.querySelector('[aria-label^="Previous match"]')!.getAttribute('title')
        ).toBe('Previous match (Shift+Enter)')
        enter()
        expect(hex.status()).toContain('Offset 0x0005')
        expect(findStatus(hex.target)).toBe('Offset 0x0005 · 2 of 2')
        expect(hex.target.querySelector('[aria-label^="Next match"]')!.getAttribute('title')).toBe(
            'Next match (Enter)'
        )
        enter()
        expect(hex.status()).toContain('Offset 0x0001')
        expect(findStatus(hex.target)).toBe('Offset 0x0001 · 1 of 2')
        enter(true)
        expect(hex.status()).toContain('Offset 0x0005')
        //text finds the characters
        input.value = 'nothing'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        enter()
        expect(findStatus(hex.target)).toBe('No results')
    })

    it('turns Find to Text when what is typed is not hex', () => {
        const hex = setup()
        hex.key('f', { ctrlKey: true })
        const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
        const kind = () =>
            hex.target.querySelector('.hex-find-bar [aria-pressed="true"]')!.textContent!.trim()
        const typeQuery = (text: string) => {
            input.value = text
            input.dispatchEvent(new Event('input', { bubbles: true }))
            flushSync()
        }
        //bytes, whole or still being typed, stay hex
        for (const bytes of ['deadbeef', '4c ?', '4c ?? 46', '4142']) typeQuery(bytes)
        expect(kind()).toBe('Hex')
        //the first character no byte has turns it to text, which is then found as such
        typeQuery('HIJ')
        expect(kind()).toBe('Text')
        expect(input.getAttribute('aria-label')).toBe('Text to find')
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        expect(findStatus(hex.target)).toBe('Offset 0x0007 · 1 of 1')
        //and it stays text, even for what reads as hex, until Hex is picked again
        typeQuery('ABC')
        expect(kind()).toBe('Text')
    })

    it('counts text matches and keeps the arrow buttons for a single result', () => {
        const hex = setup({ bytes: Uint8Array.of(0x61, 0x62, 0x61) })
        hex.key('f', { ctrlKey: true })
        const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
        input.value = 'b'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        expect(hex.target.querySelector('.hex-find-bar input.failed')).not.toBeNull()
        hex.target.querySelector<HTMLButtonElement>('.hex-find-bar [aria-pressed="false"]')!.click()
        flushSync()
        expect(findStatus(hex.target)).toBe('')
        expect(hex.target.querySelector('.hex-find-bar input.failed')).toBeNull()
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        expect(findStatus(hex.target)).toBe('Offset 0x0001 · 1 of 1')
        for (const direction of ['Previous', 'Next']) {
            const button = hex.target.querySelector<HTMLButtonElement>(
                `[aria-label^="${direction} match"]`
            )!
            expect(button.title).toBe(
                direction === 'Previous' ? 'Previous match (Shift+Enter)' : 'Next match (Enter)'
            )
            button.click()
            flushSync()
            expect(findStatus(hex.target)).toBe('Offset 0x0001 · 1 of 1')
        }
    })

    it('reuses counts on navigation and recounts after editing bytes and undoing', () => {
        const count = vi.spyOn(hexSearch, 'countMatches')
        try {
            const hex = setup({ bytes: Uint8Array.of(0xff, 0, 0xff, 0, 0xff) })
            hex.key('f', { ctrlKey: true })
            const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
            const search = () => {
                input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
                flushSync()
            }
            const message = () => findStatus(hex.target)
            input.value = 'ff'
            input.dispatchEvent(new Event('input', { bubbles: true }))
            search()
            expect(message()).toBe('Offset 0x0000 · 1 of 3')
            search()
            search()
            search()
            expect(message()).toBe('Offset 0x0000 · 1 of 3')
            expect(count).toHaveBeenCalledTimes(1)
            hex.type('00')
            expect(message()).toBe('')
            search()
            expect(message()).toBe('Offset 0x0002 · 1 of 2')
            expect(count).toHaveBeenCalledTimes(2)
            hex.key('z', { ctrlKey: true })
            expect(message()).toBe('')
            search()
            expect(message()).toBe('Offset 0x0000 · 1 of 3')
            expect(count).toHaveBeenCalledTimes(3)
            // A manually moved caret starts from its actual position, rather than the old rank.
            hex.key('ArrowRight')
            search()
            expect(message()).toBe('Offset 0x0002 · 2 of 3')
        } finally {
            count.mockRestore()
        }
    })

    it('keeps navigation during a large-file count and discards stale results', async () => {
        vi.useFakeTimers()
        const count = vi.spyOn(hexSearch, 'countMatchesAsync')
        try {
            const bytes = new Uint8Array(256 * 1024 + 8)
            bytes[0] = bytes[2] = bytes[4] = 0xff
            const hex = setup({ bytes })
            hex.key('f', { ctrlKey: true })
            const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
            const search = (shiftKey = false) => {
                input.dispatchEvent(
                    new KeyboardEvent('keydown', { key: 'Enter', shiftKey, bubbles: true })
                )
                flushSync()
            }
            const message = () => findStatus(hex.target)
            input.value = 'ff'
            input.dispatchEvent(new Event('input', { bubbles: true }))
            search()
            expect(message()).toBe('Offset 0x00000')
            search(true)
            search(true)
            expect(message()).toBe('Offset 0x00002')
            await vi.runAllTimersAsync()
            flushSync()
            expect(message()).toBe('Offset 0x00002 · 2 of 3')
            expect(count).toHaveBeenCalledTimes(1)
            // A query change while counting must never display the previous query's total.
            input.value = '00'
            input.dispatchEvent(new Event('input', { bubbles: true }))
            search()
            input.value = 'ff'
            input.dispatchEvent(new Event('input', { bubbles: true }))
            flushSync()
            await vi.runAllTimersAsync()
            flushSync()
            expect(message()).toBe('')
            search()
            await vi.runAllTimersAsync()
            flushSync()
            expect(message()).toBe('Offset 0x00004 · 3 of 3')
        } finally {
            count.mockRestore()
        }
    })
})

describe('a large File', () => {
    it('draws only the rows in sight and reaches the last one', { timeout: 60_000 }, () => {
        const size = 16 * 1024 * 1024
        const bytes = new Uint8Array(size)
        bytes[size - 1] = 0xee
        const hex = setup({ file: { encoding: 'base64', content: encodeBase64(bytes) } })
        const rows = () => hex.target.querySelectorAll('.hex-scroller [role="row"]')
        expect(rows().length).toBeLessThan(40)
        //the scroller is kept under the browsers' limit, scaled
        const sizer = hex.target.querySelector<HTMLElement>('.hex-sizer')!
        expect(parseFloat(sizer.style.height)).toBeLessThanOrEqual(8_000_100)
        expect(hex.grid.getAttribute('aria-rowcount')).toBe(String(size / 16 + 1))
        hex.key('End', { ctrlKey: true })
        expect(rows().length).toBeLessThan(40)
        expect(hex.cell('hex', size - 1)!.textContent).toBe('EE')
        expect(hex.status()).toContain('Offset 0xFFFFFF')
        expect(fileBytes(hex.fs.files.blob)[size - 1]).toBe(0xee)
    })
})

describe('an Executable', () => {
    //relative to the package, where the tests run: a DOM test's module URL is no file URL
    const crackme = () => new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

    async function menu(hex: ReturnType<typeof setup>, offset: number) {
        hex.cell('hex', offset)!.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        )
        await tick()
        return [...document.querySelectorAll<HTMLButtonElement>('[role="menuitem"]')]
    }

    it('tints its headers and sections and names them where the caret is', () => {
        const hex = setup({ bytes: crackme(), kind: 'executable' })
        const header = hex.cell('hex', 0x10)!
        expect(header.classList).toContain('tinted')
        expect(header.getAttribute('style')).toContain('--region-color')
        expect(hex.status()).toContain('ELF header')
        hex.key('g', { ctrlKey: true })
        const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
        input.value = '11e9'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        expect(hex.status()).toContain('.text')
        expect(hex.cell('hex', 0x11e9)!.classList).toContain('tinted')
        //a File that is no Executable has no tints
        const bytes = setup({ bytes: crackme() })
        expect(bytes.cell('hex', 0x10)!.classList).not.toContain('tinted')
    })

    it('puts its hover card away while dragging, for the context menu and Find, and on a key', async () => {
        const hex = setup({ bytes: crackme(), kind: 'executable' })
        const card = () => hex.target.querySelector('.hex-hover[role="tooltip"]')
        const pointer = (type: string, offset: number) => {
            hex.cell('hex', offset)!.dispatchEvent(
                new PointerEvent(type, { bubbles: true, pointerType: 'mouse' })
            )
            flushSync()
        }
        pointer('pointermove', 0x10)
        expect(card()?.textContent).toContain('ELF header')
        //a key, wherever it is pressed: the bytes take theirs before anything else sees them
        hex.key('Shift')
        expect(card()).toBeNull()
        pointer('pointermove', 0x11)
        expect(card()).not.toBeNull()
        //a press that drags a selection
        pointer('pointerdown', 0x11)
        expect(card()).toBeNull()
        pointer('pointermove', 0x14)
        expect(card()).toBeNull()
        pointer('pointerup', 0x14)
        pointer('pointermove', 0x14)
        expect(card()).not.toBeNull()
        //the context menu, for as long as it is open
        hex.cell('hex', 0x14)!.dispatchEvent(
            new MouseEvent('contextmenu', { bubbles: true, cancelable: true })
        )
        await tick()
        expect(card()).toBeNull()
        pointer('pointermove', 0x15)
        expect(card()).toBeNull()
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        flushSync()
        pointer('pointermove', 0x15)
        expect(card()).not.toBeNull()
        //Find, opened from the status bar
        hex.target.querySelector<HTMLButtonElement>('.hex-status [title^="Find"]')!.click()
        flushSync()
        expect(hex.target.querySelector('.hex-find-bar')).not.toBeNull()
        expect(card()).toBeNull()
    })

    it('shows a byte of its code in the Listing, from the context menu', async () => {
        const shown: number[] = []
        const hex = setup({
            bytes: crackme(),
            kind: 'executable',
            onShowInListing: (offset) => shown.push(offset)
        })
        const header = (await menu(hex, 0x10)).find((item) =>
            item.textContent?.includes('Show in Listing')
        )!
        expect(header.disabled).toBe(true)
        document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
        flushSync()
        hex.key('g', { ctrlKey: true })
        const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
        input.value = '1100'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
        flushSync()
        const code = (await menu(hex, 0x1100)).find((item) =>
            item.textContent?.includes('Show in Listing')
        )!
        expect(code.disabled).toBe(false)
        code.click()
        flushSync()
        expect(shown).toEqual([0x1100])
    })
})

describe('typing before a Build', () => {
    /**
     * The Hex editor in a Workbench session over `blob.bin`, its props passed as `EditorPane`
     * passes them, so that a Build or a test run sees the session's view of the Files.
     */
    function inSession() {
        const fixture = editorGroupsFixture('MIPS', {
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                'blob.bin': { encoding: 'base64', content: encodeBase64(ALPHABET) }
            }
        })
        const { session, project, emulator } = fixture
        const group = session.groups[0]
        session.selectFile('blob.bin', group)
        flushSync()
        const built: BuildSources[] = []
        const flushes = { count: 0 }
        emulator.compile = async (_history, sources) => {
            built.push(sources)
        }
        const target = document.createElement('div')
        document.body.appendChild(target)
        const editor = mount(HexEditor, {
            target,
            props: {
                path: 'blob.bin',
                get file() {
                    return group.displayedFile!
                },
                kind: 'bytes',
                get readOnly() {
                    return group.bytesReadOnly
                },
                onEdit: (path: string, offset: number, bytes: Uint8Array) =>
                    session.editFileBytes(path, offset, bytes),
                onUndoEdit: (path: string, redo: boolean) => session.undoFileEdit(path, redo),
                registerFlush: (flush: () => void) =>
                    session.registerTypingFlush(() => {
                        flushes.count++
                        flush()
                    })
            }
        })
        flushSync()
        const grid = target.querySelector<HTMLElement>('[role="grid"]')!
        const type = (text: string) => {
            for (const key of text) {
                grid.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
                flushSync()
            }
        }
        let mounted = true
        const close = () => {
            if (mounted) unmount(editor)
            mounted = false
        }
        return {
            ...fixture,
            built,
            flushes,
            type,
            close,
            dispose: () => {
                close()
                fixture.dispose()
            },
            blob: (files = project.files) => [...fileBytes(files['blob.bin'])].slice(0, 4)
        }
    }

    it('saves what was typed into the File and the Build before the Build locks the Files', async () => {
        const hex = inSession()
        hex.type('7f45')
        //the typing has not paused: nothing is saved yet
        expect(hex.blob()).toEqual([0x41, 0x42, 0x43, 0x44])
        await hex.session.build()
        expect(hex.blob()).toEqual([0x7f, 0x45, 0x43, 0x44])
        expect(hex.built).toHaveLength(1)
        expect(hex.blob(hex.built[0].files)).toEqual([0x7f, 0x45, 0x43, 0x44])
        //and Undo takes it back as one Edit step
        expect(hex.session.fileJournal('blob.bin')?.undo).toHaveLength(1)
        expect(hex.session.undoFileEdit('blob.bin')).toBe(0)
        expect(hex.blob()).toEqual([0x41, 0x42, 0x43, 0x44])
        hex.dispose()
    })

    it('saves it before a test run too, and no more once the editor is gone', async () => {
        const hex = inSession()
        const tested: BuildSources[] = []
        Object.assign(hex.emulator, {
            test: async (sources: BuildSources) => {
                tested.push(sources)
                return []
            }
        })
        hex.type('00')
        await hex.session.test()
        expect(hex.blob(tested[0].files)).toEqual([0, 0x42, 0x43, 0x44])
        expect(hex.blob()).toEqual([0, 0x42, 0x43, 0x44])
        expect(hex.flushes.count).toBe(1)
        //a closed editor saved its typing as it closed, and a Build no longer asks it
        hex.close()
        await hex.session.build()
        expect(hex.built).toHaveLength(1)
        expect(hex.flushes.count).toBe(1)
        hex.dispose()
    })
})
