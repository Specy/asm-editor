/**
 * The Pixel editor in jsdom ([pixel-editor.md](../../../../../../../docs/design/pixel-editor.md),
 * decisions 4 and 6 to 9): a stroke is one change saved through the FileSystem when the pointer
 * comes up as a labelled Edit step, Undo and Redo walk the File's steps, a Canvas size is undone,
 * and nothing is drawn while the Files are read-only. jsdom has no canvas, so the drawing context is
 * a stub and the pane has no size: the picture sits at the canvas's top-left at 100%, a pixel a
 * screen pixel.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import PixelEditor from './PixelEditor.svelte'
import { FileSystem, type ByteRun } from '#lib/languages/peripherals/FileSystem.ts'
import { EditJournal } from '#lib/editJournal.ts'
import { cleanFiles, encodeBase64, type ProjectFiles } from '#lib/projectFiles.ts'
import { makeBmp, readBmpLayout, readRaw } from '#lib/pixels/bmp.ts'
import { PixelDocument, type PixelViewState } from '#lib/pixels/pixelDocument.ts'
import { PALETTE_16 } from '#lib/pixels/palettes.ts'
import type { CellGrid } from '#lib/Project.svelte.ts'

//the theme store, which the editor draws its lines and checkerboard in, reaches the projects'
//IndexedDB, which jsdom does not have
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] }, id: () => 'test' }))

beforeEach(() => {
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
    vi.stubGlobal(
        'ImageData',
        class {
            constructor(
                readonly data: Uint8ClampedArray,
                readonly width: number,
                readonly height: number
            ) {}
        }
    )
    //a context that draws nothing, which is all jsdom could do
    const context = new Proxy({}, { get: (_, key) => (key === 'canvas' ? undefined : () => {}) })
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(
        context as CanvasRenderingContext2D
    )
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
})
const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    document.body.replaceChildren()
})

function setup(
    options: { bytes?: Uint8Array; readOnly?: string; grid?: CellGrid; view?: PixelViewState } = {}
) {
    let files = $state.raw<ProjectFiles>(
        cleanFiles({
            'sprite.bmp': {
                encoding: 'base64',
                content: encodeBase64(
                    options.bytes ?? makeBmp({ width: 8, height: 4, format: 'rgb32' })
                )
            },
            'main.s': { encoding: 'plain', content: 'nop' }
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
    const labels: string[] = []
    const saves: ByteRun[][] = []
    const grids: (CellGrid | undefined)[] = []
    const target = document.createElement('div')
    document.body.appendChild(target)
    const props = {
        path: 'sprite.bmp',
        get file() {
            return files['sprite.bmp']
        },
        readOnly: options.readOnly,
        cellGrid: options.grid,
        viewState: options.view,
        //as the Workbench session's
        onEditRuns: (path: string, runs: readonly ByteRun[], label: string) => {
            saves.push([...runs])
            labels.push(label)
            journal.change(path, label, { runs })
            return true
        },
        onUndoEdit: (path: string, redo: boolean) => journal.undo(path, redo) !== undefined,
        //as the Workbench's pane passes them: the journal's, read again as the File changes
        get canUndo() {
            void files
            return !!journal.journalOf('sprite.bmp')?.undo.length
        },
        get canRedo() {
            void files
            return !!journal.journalOf('sprite.bmp')?.redo.length
        },
        onResize: (path: string, bytes: Uint8Array, label: string) => {
            labels.push(label)
            journal.change(path, label, { content: bytes, encoding: 'base64' })
            return true
        },
        onCellGrid: (_path: string, grid: CellGrid | undefined) => grids.push(grid)
    }
    const editor = mount(PixelEditor, { target, props })
    let mountedNow = true
    const dispose = () => {
        if (mountedNow) unmount(editor)
        mountedNow = false
    }
    mounted.push(dispose)
    flushSync()
    const root = target.querySelector<HTMLElement>('.pixel-editor')!
    const canvas = () => target.querySelector('canvas')!
    const pointer = (
        type: string,
        x: number,
        y: number,
        init: MouseEventInit = {},
        touch?: number
    ) => {
        const event = new MouseEvent(type, {
            clientX: x + 0.5,
            clientY: y + 0.5,
            bubbles: true,
            ...init
        })
        //jsdom has no PointerEvent: a finger is a mouse event told it is one
        if (touch !== undefined) {
            Object.defineProperty(event, 'pointerType', { value: 'touch' })
            Object.defineProperty(event, 'pointerId', { value: touch })
        }
        canvas().dispatchEvent(event)
        flushSync()
    }
    const key = (key: string, init: KeyboardEventInit = {}) => {
        root.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }))
        flushSync()
    }
    const button = (name: string) =>
        target.querySelector<HTMLButtonElement>(`button[aria-label="${name}"]`)
    const bytes = () => fs.readBytes('sprite.bmp')
    const raw = (x: number, y: number) => {
        const current = bytes()
        return readRaw(current, readBmpLayout(current, current.length).layout!, x, y)
    }
    return {
        fs,
        saves,
        labels,
        grids,
        target,
        pointer,
        key,
        button,
        bytes,
        raw,
        status: () => target.querySelector('.pixel-status')!.textContent!.replace(/\s+/g, ' '),
        unmount: dispose
    }
}

const WHITE = 0xffffff

describe('drawing', () => {
    it('saves a stroke once, when the pointer comes up, as runs a row', () => {
        const pixels = setup()
        pixels.pointer('pointerdown', 1, 1)
        pixels.pointer('pointermove', 4, 1)
        pixels.pointer('pointermove', 4, 2)
        //nothing saved while the pointer is down
        expect(pixels.saves).toHaveLength(0)
        pixels.pointer('pointerup', 4, 2)
        expect(pixels.saves).toHaveLength(1)
        expect(pixels.saves[0]).toHaveLength(2)
        expect([1, 2, 3, 4].map((x) => pixels.raw(x, 1))).toEqual([WHITE, WHITE, WHITE, WHITE])
        expect(pixels.raw(4, 2)).toBe(WHITE)
        expect(pixels.raw(0, 1)).toBe(0)
    })

    it('undoes and redoes a stroke through the shared history', () => {
        const pixels = setup()
        const enabled = () => [!pixels.button('Undo')!.disabled, !pixels.button('Redo')!.disabled]
        //nothing to take back or put back yet
        expect(enabled()).toEqual([false, false])
        pixels.pointer('pointerdown', 2, 2)
        pixels.pointer('pointerup', 2, 2)
        expect(pixels.raw(2, 2)).toBe(WHITE)
        expect(enabled()).toEqual([true, false])
        pixels.key('z', { ctrlKey: true })
        expect(pixels.raw(2, 2)).toBe(0)
        expect(enabled()).toEqual([false, true])
        pixels.key('z', { ctrlKey: true, shiftKey: true })
        expect(pixels.raw(2, 2)).toBe(WHITE)
        pixels.button('Undo')!.click()
        flushSync()
        expect(pixels.raw(2, 2)).toBe(0)
    })

    it('chooses tools by their keys, and fills with Fill', () => {
        const pixels = setup()
        pixels.key('g')
        expect(pixels.button('Fill')!.getAttribute('aria-pressed')).toBe('true')
        pixels.pointer('pointerdown', 0, 0)
        expect(pixels.saves).toHaveLength(1)
        expect(pixels.raw(7, 3)).toBe(WHITE)
        pixels.key('l')
        expect(pixels.button('Line')!.getAttribute('aria-pressed')).toBe('true')
        //no Erase in a picture without an alpha channel
        expect(pixels.button('Eraser')).toBeNull()
        pixels.key('e')
        expect(pixels.button('Line')!.getAttribute('aria-pressed')).toBe('true')
    })

    it('draws with the Pencil where the Erase it kept has no alpha channel to erase to', () => {
        const pixels = setup({ view: { tool: 'erase', filled: false } })
        expect(pixels.button('Pencil')!.getAttribute('aria-pressed')).toBe('true')
        pixels.pointer('pointerdown', 1, 1)
        pixels.pointer('pointerup', 1, 1)
        expect(pixels.labels).toEqual(['Pencil'])
    })

    it('draws a rectangle when it is let go, filled with Shift', () => {
        const pixels = setup()
        pixels.key('u')
        pixels.pointer('pointerdown', 1, 0)
        pixels.pointer('pointermove', 3, 2, { shiftKey: true })
        expect(pixels.saves).toHaveLength(0)
        pixels.pointer('pointerup', 3, 2, { shiftKey: true })
        expect(pixels.saves).toHaveLength(1)
        expect(pixels.raw(2, 1)).toBe(WHITE)
    })

    it('opens a tool’s settings from its arrow, or from the tool once chosen, under it', () => {
        const pixels = setup()
        const card = () => pixels.target.querySelector('.tool-settings')
        //Fill and the Eyedropper have none
        expect(pixels.button('Fill settings')).toBeNull()
        expect(pixels.button('Pencil settings')!.getAttribute('aria-expanded')).toBe('false')
        pixels.button('Pencil')!.click()
        flushSync()
        expect(card()!.getAttribute('aria-label')).toBe('Pencil settings')
        expect(pixels.button('Pencil settings')!.getAttribute('aria-expanded')).toBe('true')
        pixels.button('Pencil')!.click()
        flushSync()
        expect(card()).toBeNull()
        //the arrow of another tool chooses it too
        pixels.button('Line settings')!.click()
        flushSync()
        expect(pixels.button('Line')!.getAttribute('aria-pressed')).toBe('true')
        expect(card()!.querySelector('input[aria-label="Line width"]')).not.toBeNull()
        //Escape, another tool and a pointer elsewhere close them
        pixels.key('Escape')
        expect(card()).toBeNull()
        pixels.button('Line settings')!.click()
        flushSync()
        pixels.key('u')
        expect(card()).toBeNull()
        pixels.button('Rectangle settings')!.click()
        flushSync()
        card()!
            .querySelector('button')!
            .dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
        flushSync()
        expect(card()).not.toBeNull()
        pixels.pointer('pointerdown', 1, 1)
        expect(card()).toBeNull()
    })

    it('draws with a brush of the size and shape chosen, which the Eraser shares', () => {
        const pixels = setup()
        const size = () =>
            pixels.target.querySelector<HTMLInputElement>('input[aria-label="Brush size"]')!
        pixels.button('Pencil settings')!.click()
        flushSync()
        size().value = '3'
        size().dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
        pixels.pointer('pointerdown', 3, 1)
        pixels.pointer('pointerup', 3, 1)
        //a round brush of 3 is a plus
        for (const [x, y] of [
            [3, 0],
            [2, 1],
            [3, 1],
            [4, 1],
            [3, 2]
        ])
            expect(pixels.raw(x, y)).toBe(WHITE)
        expect(pixels.raw(2, 0)).toBe(0)
        pixels.button('Pencil settings')!.click()
        flushSync()
        expect(size().value).toBe('3')
        pixels.button('Square brush')!.click()
        flushSync()
        pixels.pointer('pointerdown', 6, 2)
        pixels.pointer('pointerup', 6, 2)
        expect(pixels.raw(5, 1)).toBe(WHITE)
        expect(pixels.raw(7, 3)).toBe(WHITE)
        //a size past the limits is brought within them
        pixels.button('Pencil settings')!.click()
        flushSync()
        size().value = '99'
        size().dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
        expect(size().value).toBe('32')
    })

    it('draws a line as thick as its width', () => {
        const pixels = setup()
        pixels.key('l')
        pixels.button('Line settings')!.click()
        flushSync()
        const width = pixels.target.querySelector<HTMLInputElement>(
            'input[aria-label="Line width"]'
        )!
        width.value = '3'
        width.dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
        expect(pixels.target.querySelector('input[aria-label="Brush size"]')).toBeNull()
        pixels.pointer('pointerdown', 2, 1)
        pixels.pointer('pointermove', 5, 1)
        pixels.pointer('pointerup', 5, 1)
        expect(pixels.labels).toEqual(['Line'])
        expect(pixels.raw(1, 1)).toBe(WHITE)
        expect(pixels.raw(3, 0)).toBe(WHITE)
        expect(pixels.raw(3, 2)).toBe(WHITE)
        expect(pixels.raw(1, 0)).toBe(0)
    })

    it('draws an ellipse, or with its switch or Shift a circle, as a line or filled', () => {
        const pixels = setup()
        pixels.key('o')
        expect(pixels.button('Ellipse')!.getAttribute('aria-pressed')).toBe('true')
        pixels.pointer('pointerdown', 0, 0)
        pixels.pointer('pointermove', 4, 2)
        expect(pixels.saves).toHaveLength(0)
        pixels.pointer('pointerup', 4, 2)
        expect(pixels.labels).toEqual(['Ellipse'])
        //its outline, the middle left alone
        expect([pixels.raw(2, 0), pixels.raw(0, 1), pixels.raw(4, 1), pixels.raw(2, 1)]).toEqual([
            WHITE,
            WHITE,
            WHITE,
            0
        ])
        //a drag two pixels high makes a circle as wide as it is long: four rows of the picture
        pixels.button('Ellipse')!.click()
        flushSync()
        pixels.button('Circle')!.click()
        flushSync()
        pixels.pointer('pointerdown', 0, 0)
        pixels.pointer('pointermove', 4, 1)
        pixels.pointer('pointerup', 4, 1)
        expect(pixels.raw(0, 2)).toBe(WHITE)
        //Shift does the opposite of the switch, and Filled fills it
        pixels.button('Ellipse settings')!.click()
        flushSync()
        pixels.button('Filled')!.click()
        flushSync()
        pixels.pointer('pointerdown', 5, 0)
        pixels.pointer('pointermove', 7, 1, { shiftKey: true })
        pixels.pointer('pointerup', 7, 1, { shiftKey: true })
        expect([pixels.raw(6, 0), pixels.raw(6, 1), pixels.raw(6, 2)]).toEqual([WHITE, WHITE, 0])
    })

    it('keeps a slot for every colour of the row, an empty one adding a colour', () => {
        const pixels = setup()
        const row = () => [...pixels.target.querySelectorAll('.colours .swatch')]
        expect(row()).toHaveLength(16)
        pixels.button('Add a colour')!.click()
        //the picker belongs under the colour drawn with, which the browser opens it under
        const picker = pixels.target.querySelector<HTMLInputElement>(
            '.current-colour input.hidden-picker'
        )!
        picker.value = '#ff00aa'
        picker.dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
        //drawn with, and shown in the row before the picture uses it, which keeps its width
        expect(pixels.button('Use #ff00aa')!.getAttribute('aria-pressed')).toBe('true')
        expect(row()).toHaveLength(16)
        pixels.pointer('pointerdown', 1, 1)
        pixels.pointer('pointerup', 1, 1)
        expect(pixels.raw(1, 1)).toBe(0xff00aa)
    })

    it('says X and Y always, the pixel under the pointer once there is one, in their room', () => {
        const pixels = setup()
        const values = () =>
            [...pixels.target.querySelectorAll('.coordinate')].map((value) => value.textContent)
        expect(pixels.status()).toMatch(/X Y/)
        expect(values()).toEqual(['', ''])
        pixels.pointer('pointermove', 3, 2)
        expect(values()).toEqual(['3', '2'])
        expect(pixels.status()).toMatch(/X 3 Y 2 #000000/)
    })

    it('draws nothing while the Files are read-only, and says why', () => {
        const pixels = setup({ readOnly: 'The Files are read-only during a Debug session' })
        pixels.pointer('pointerdown', 1, 1)
        pixels.pointer('pointerup', 1, 1)
        expect(pixels.saves).toHaveLength(0)
        expect(pixels.button('Pencil')!.disabled).toBe(true)
        expect(pixels.button('Undo')!.disabled).toBe(true)
        expect(pixels.status()).toContain('read-only')
    })
})

describe('touch', () => {
    it('fills as the finger lifts, and a second finger makes it a pinch that fills nothing', () => {
        const pixels = setup()
        pixels.key('g')
        pixels.pointer('pointerdown', 0, 0, {}, 1)
        expect(pixels.saves).toHaveLength(0)
        pixels.pointer('pointerdown', 6, 3, {}, 2)
        pixels.pointer('pointerup', 0, 0, {}, 1)
        pixels.pointer('pointerup', 6, 3, {}, 2)
        expect(pixels.saves).toHaveLength(0)
        expect(pixels.raw(3, 2)).toBe(0)
        pixels.pointer('pointerdown', 0, 0, {}, 3)
        pixels.pointer('pointerup', 0, 0, {}, 3)
        expect(pixels.saves).toHaveLength(1)
        expect(pixels.raw(3, 2)).toBe(WHITE)
    })
})

describe('reading the File again', () => {
    it('only when its bytes change, not when another File does', () => {
        const read = vi.spyOn(PixelDocument, 'read')
        const pixels = setup()
        read.mockClear()
        pixels.fs.writeText('main.s', 'nop\nnop')
        flushSync()
        expect(read).not.toHaveBeenCalled()
        pixels.pointer('pointerdown', 1, 1)
        pixels.pointer('pointerup', 1, 1)
        expect(read).not.toHaveBeenCalled()
        pixels.key('z', { ctrlKey: true })
        expect(read).toHaveBeenCalledTimes(1)
    })
})

describe('a picture with a palette', () => {
    it('draws in its palette, chosen from it', () => {
        const pixels = setup({
            bytes: makeBmp({ width: 4, height: 2, format: 'indexed4', palette: PALETTE_16 })
        })
        const entries = pixels.target.querySelectorAll('[role="option"]')
        expect(entries).toHaveLength(16)
        //white, the last entry, to begin with
        expect(entries[15].getAttribute('aria-selected')).toBe('true')
        ;(entries[9] as HTMLElement).click()
        flushSync()
        pixels.pointer('pointerdown', 1, 1)
        pixels.pointer('pointerup', 1, 1)
        expect(pixels.raw(1, 1)).toBe(9)
    })
})

describe('Canvas size and the cell grid', () => {
    it('resizes from the top-left corner, and Undo puts the whole File back', () => {
        const pixels = setup()
        pixels.pointer('pointerdown', 0, 0)
        pixels.pointer('pointerup', 0, 0)
        const drawn = pixels.fs.files['sprite.bmp']
        pixels.button('Canvas size')!.click()
        flushSync()
        const width = pixels.target.querySelector<HTMLInputElement>(
            '.canvas-size input[aria-label="Width"]'
        )!
        width.value = '12'
        width.dispatchEvent(new Event('input', { bubbles: true }))
        pixels.target.querySelector<HTMLFormElement>('.canvas-size')!.requestSubmit()
        flushSync()
        expect(pixels.status()).toContain('12 × 4 px')
        expect(pixels.raw(0, 0)).toBe(WHITE)
        expect(pixels.labels).toEqual(['Pencil', 'Resize canvas to 12 × 4'])
        pixels.key('z', { ctrlKey: true })
        expect(pixels.fs.files['sprite.bmp'].content).toBe(drawn.content)
        expect(pixels.status()).toContain('8 × 4 px')
        pixels.key('y', { ctrlKey: true })
        expect(pixels.status()).toContain('12 × 4 px')
    })

    it('takes no Canvas size that is the picture’s own', () => {
        const pixels = setup()
        pixels.button('Canvas size')!.click()
        flushSync()
        const submit = pixels.target.querySelector<HTMLButtonElement>(
            '.canvas-size button[type="submit"]'
        )!
        expect(submit.disabled).toBe(true)
        pixels.target.querySelector<HTMLFormElement>('.canvas-size')!.requestSubmit()
        flushSync()
        expect(pixels.labels).toEqual([])
        const width = pixels.target.querySelector<HTMLInputElement>(
            '.canvas-size input[aria-label="Width"]'
        )!
        width.value = '9'
        width.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        expect(submit.disabled).toBe(false)
    })

    it('says why it will not resize, and takes a large picture up to its own size', () => {
        const pixels = setup({
            bytes: makeBmp({ width: 1500, height: 2, format: 'indexed1', palette: [0, 0xffffffff] })
        })
        pixels.button('Canvas size')!.click()
        flushSync()
        const width = pixels.target.querySelector<HTMLInputElement>(
            '.canvas-size input[aria-label="Width"]'
        )!
        width.value = '1200'
        width.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        expect(pixels.target.querySelector('.canvas-size [role="alert"]')).toBeNull()
        width.value = '1600'
        width.dispatchEvent(new Event('input', { bubbles: true }))
        flushSync()
        expect(pixels.target.querySelector('.canvas-size [role="alert"]')!.textContent).toContain(
            'from 1 to 1500'
        )
        expect(
            pixels.target.querySelector<HTMLButtonElement>('.canvas-size button[type="submit"]')!
                .disabled
        ).toBe(true)
    })

    it('opens the cell grid and Canvas size in cards under their buttons', () => {
        const pixels = setup()
        const card = () => pixels.target.querySelector('.tool-settings')
        pixels.button('Cell grid')!.click()
        flushSync()
        expect(card()!.getAttribute('aria-label')).toBe('Cell grid')
        expect(pixels.button('Cell grid')!.getAttribute('aria-expanded')).toBe('true')
        //no line drawn by opening it
        expect(pixels.grids).toEqual([])
        pixels.button('Canvas size')!.click()
        flushSync()
        expect(card()!.getAttribute('aria-label')).toBe('Canvas size')
        expect(card()!.querySelector('input[aria-label="Width"]')).not.toBeNull()
        ;[...card()!.querySelectorAll('button')]
            .find((button) => button.textContent === 'Cancel')!
            .click()
        flushSync()
        expect(card()).toBeNull()
    })

    it('shows a cell grid it could not save, as in a read-only Project', () => {
        const pixels = setup()
        pixels.button('Cell grid')!.click()
        flushSync()
        pixels.button('On')!.click()
        flushSync()
        expect(pixels.button('Cell grid')!.getAttribute('aria-pressed')).toBe('true')
        expect(pixels.target.querySelector('input[aria-label="Cell width"]')).not.toBeNull()
    })

    it('turns the cell grid on at 16 × 16, sizes it, and turns it off and on again', () => {
        const off = setup()
        off.button('Cell grid')!.click()
        flushSync()
        off.button('On')!.click()
        flushSync()
        expect(off.grids).toEqual([{ width: 16, height: 16 }])
        off.unmount()
        const on = setup({ grid: { width: 8, height: 8 } })
        on.button('Cell grid')!.click()
        flushSync()
        on.button('Off')!.click()
        flushSync()
        expect(on.grids).toEqual([undefined])
        //typing a size shows the lines at it, and turning them on again keeps it
        const width = on.target.querySelector<HTMLInputElement>('input[aria-label="Cell width"]')!
        expect(width.value).toBe('8')
        width.value = '12'
        width.dispatchEvent(new Event('change', { bubbles: true }))
        flushSync()
        on.button('Off')!.click()
        flushSync()
        on.button('On')!.click()
        flushSync()
        expect(on.grids).toEqual([
            undefined,
            { width: 12, height: 8 },
            undefined,
            { width: 12, height: 8 }
        ])
    })
})
