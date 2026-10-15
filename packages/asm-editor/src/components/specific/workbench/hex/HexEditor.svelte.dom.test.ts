/**
 * The Hex editor in jsdom ([file-views.md](../../../../../../../docs/design/file-views.md),
 * decisions 3, 7 and 9; the plan's E3): typing makes Byte edits through the FileSystem, Undo and
 * Redo put back whole lists of them, and the grid draws only the rows in sight.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import HexEditor from './HexEditor.svelte'
import { ByteEditHistory } from './byteEditHistory'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import {
    cleanFiles,
    encodeBase64,
    fileBytes,
    type ProjectFile,
    type ProjectFiles
} from '#lib/projectFiles.ts'

//`#lib/utils.ts`, which the data inspector reads numbers through, reaches the projects store and
//its IndexedDB, which jsdom does not have
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

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

function setup(options: { bytes?: Uint8Array; readOnly?: string; file?: ProjectFile } = {}) {
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
    const history = new ByteEditHistory()
    const target = document.createElement('div')
    document.body.appendChild(target)
    //a getter keeps the File the editor is given the FileSystem's current one
    const props = {
        path: 'blob',
        get file() {
            return files.blob
        },
        readOnly: options.readOnly,
        history,
        onEdit: (path: string, offset: number, bytes: Uint8Array) => {
            fs.editBytes(path, offset, bytes)
            return true
        },
        onSetEdits: (path: string, edits: Parameters<FileSystem['setByteEdits']>[1]) => {
            fs.setByteEdits(path, edits)
            return true
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
    it('overwrites digits in the hex column, shown at once and saved as one Byte edit', () => {
        vi.useFakeTimers()
        const hex = setup()
        hex.key('ArrowRight')
        hex.type('7f4')
        //the typed digits show before they are saved
        expect(hex.cell('hex', 1)!.textContent).toBe('7F')
        expect(hex.cell('hex', 2)!.textContent).toBe('43')
        expect(hex.cell('text', 2)!.textContent).toBe('C')
        expect(hex.fs.files.blob.edits).toBeUndefined()
        hex.type('5')
        expect(hex.cell('text', 2)!.textContent).toBe('E')
        vi.advanceTimersByTime(1000)
        flushSync()
        expect(hex.fs.files.blob.edits).toEqual([
            { offset: 1, remove: 2, insert: encodeBase64(Uint8Array.from([0x7f, 0x45])) }
        ])
        expect(hex.bytes().slice(0, 4)).toEqual([0x41, 0x7f, 0x45, 0x44])
        expect(hex.status()).toContain('edited')
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
        expect(hex.bytes().slice(0, 3)).toEqual([0x41, 0x42, 0x43])
        expect(hex.fs.files.blob.edits).toBeUndefined()
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
        expect(hex.fs.files.blob.edits).toBeUndefined()
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
        expect(hex.target.querySelector('.hex-find-bar [role="status"]')!.textContent).toBe(
            '0x40 is past the end, at 0x1f'
        )
    })

    it('finds hex bytes with wildcards, next and previous, wrapping round', () => {
        const hex = setup({ bytes: Uint8Array.from([0, 0x4c, 9, 0x46, 0, 0x4c, 8, 0x46, 0]) })
        hex.key('f', { ctrlKey: true })
        const input = hex.target.querySelector<HTMLInputElement>('.hex-find-bar input')!
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
        enter()
        expect(hex.status()).toContain('Offset 0x0005')
        enter()
        expect(hex.status()).toContain('Offset 0x0001')
        expect(hex.target.querySelector('.hex-find-bar [role="status"]')!.textContent).toBe(
            '0x0001, wrapped'
        )
        enter(true)
        expect(hex.status()).toContain('Offset 0x0005')
        //text finds the characters
        input.value = 'nothing'
        input.dispatchEvent(new Event('input', { bubbles: true }))
        hex.target.querySelector<HTMLButtonElement>('.hex-find-bar [aria-pressed="false"]')!.click()
        enter()
        expect(hex.target.querySelector('.hex-find-bar [role="status"]')!.textContent).toBe(
            'No results'
        )
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
