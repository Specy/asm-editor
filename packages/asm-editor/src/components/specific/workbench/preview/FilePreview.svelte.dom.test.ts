/**
 * The Preview in jsdom ([file-views.md](../../../../../../../docs/design/file-views.md), decision
 * 14; the plan's E5): each kind in the browser's own element, from a Blob URL typed by the
 * signature the File matched, revoked when the bytes change, and the Hex editor where the browser
 * cannot show the File after all.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import FilePreview from './FilePreview.svelte'
import { formatDuration, pdfDisplay, PREVIEW_UNAVAILABLE } from './previewSupport'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import {
    cleanFiles,
    encodeBase64,
    overwriteBytes,
    type ProjectFile,
    type ProjectFiles
} from '#lib/projectFiles.ts'
import type { FilePreview as PreviewKind } from '#lib/fileKinds.ts'

//`#lib/utils.ts`, whose download the PDF notice uses, reaches the projects store and its
//IndexedDB, which jsdom does not have
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0])
const PDF = new TextEncoder().encode('%PDF-1.7\n%%EOF\n')

/** The Blob URLs made and revoked, each with the Blob it was made from. */
let made: { url: string; blob: Blob }[] = []
let revoked: string[] = []
const open = vi.fn()

function stubNavigator(fields: Partial<Navigator>) {
    vi.stubGlobal('navigator', {
        userAgent: 'Mozilla/5.0 (X11; Linux x86_64) Chrome/153.0',
        maxTouchPoints: 0,
        pdfViewerEnabled: true,
        ...fields
    })
}

beforeEach(() => {
    made = []
    revoked = []
    open.mockClear()
    vi.stubGlobal('URL', {
        ...URL,
        createObjectURL: (blob: Blob) => {
            const url = `blob:http://localhost/${made.length + 1}`
            made.push({ url, blob })
            return url
        },
        revokeObjectURL: (url: string) => revoked.push(url)
    })
    vi.stubGlobal('open', open)
    //how wide an image is drawn, which jsdom never lays out
    vi.stubGlobal(
        'ResizeObserver',
        class {
            observe() {}
            unobserve() {}
            disconnect() {}
        }
    )
    stubNavigator({})
})
afterEach(() => {
    vi.unstubAllGlobals()
    document.body.replaceChildren()
})

function file(bytes: Uint8Array): ProjectFile {
    return { encoding: 'base64', content: encodeBase64(bytes) }
}

function setup(path: string, bytes: Uint8Array, kind: PreviewKind) {
    const props = $state({ path, file: file(bytes), kind })
    const onUnavailable = vi.fn()
    const target = document.createElement('div')
    document.body.appendChild(target)
    const preview = mount(FilePreview, {
        target,
        props: {
            get path() {
                return props.path
            },
            get file() {
                return props.file
            },
            get kind() {
                return props.kind
            },
            onUnavailable
        }
    })
    flushSync()
    return { target, props, onUnavailable, dispose: () => void unmount(preview) }
}

describe('the Preview', () => {
    it('shows an image in an img, typed as its signature and not its name', async () => {
        const { target, dispose } = setup('photo.pdf', PNG, {
            preview: 'image',
            mime: 'image/png'
        })
        const image = target.querySelector('img')!
        expect(image.getAttribute('src')).toBe(made[0].url)
        expect(made[0].blob.type).toBe('image/png')
        expect(new Uint8Array(await made[0].blob.arrayBuffer())).toEqual(PNG)
        expect(target.textContent).toContain('image/png')
        expect(target.textContent).toContain('10 bytes')
        //fitted to the pane until shown at its own size
        const toggle = target.querySelector<HTMLButtonElement>('button[aria-pressed]')!
        expect(toggle.getAttribute('aria-pressed')).toBe('false')
        toggle.click()
        flushSync()
        expect(toggle.getAttribute('aria-pressed')).toBe('true')
        expect(target.querySelector('.preview-body')!.classList.contains('actual-size')).toBe(true)
        dispose()
        expect(revoked).toEqual([made[0].url])
    })

    it('shows audio and video in their elements, with controls', () => {
        const audio = setup('song', Uint8Array.from([0x49, 0x44, 0x33]), {
            preview: 'audio',
            mime: 'audio/mpeg'
        })
        const element = audio.target.querySelector('audio')!
        expect(element.hasAttribute('controls')).toBe(true)
        expect(element.getAttribute('src')).toBe(made[0].url)
        expect(made[0].blob.type).toBe('audio/mpeg')
        audio.dispose()

        const video = setup('clip', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), {
            preview: 'video',
            mime: 'video/webm'
        })
        expect(video.target.querySelector('video')!.hasAttribute('controls')).toBe(true)
        expect(made[1].blob.type).toBe('video/webm')
        video.dispose()
    })

    it('shows a PDF in an unsandboxed frame where the browser has a PDF viewer', () => {
        const { target, dispose } = setup('report', PDF, {
            preview: 'pdf',
            mime: 'application/pdf'
        })
        const frame = target.querySelector('iframe')!
        expect(frame.getAttribute('src')).toBe(made[0].url)
        expect(frame.hasAttribute('sandbox')).toBe(false)
        expect(made[0].blob.type).toBe('application/pdf')
        dispose()
    })

    it('offers a PDF in a new tab or as a download where it has none', () => {
        stubNavigator({ pdfViewerEnabled: false })
        const { target, dispose } = setup('docs/report.pdf', PDF, {
            preview: 'pdf',
            mime: 'application/pdf'
        })
        expect(target.querySelector('iframe')).toBeNull()
        expect(target.textContent).toContain('This browser cannot show a PDF inside the page.')
        const buttons = [...target.querySelectorAll<HTMLButtonElement>('.pdf-actions button')]
        expect(buttons.map((button) => button.textContent?.trim())).toEqual([
            'Open in a new tab',
            'Download'
        ])
        buttons[0].click()
        expect(open).toHaveBeenCalledWith(made[0].url, '_blank')
        dispose()
    })

    it('makes a new URL when the bytes change, and revokes the old one', () => {
        const { props, dispose } = setup('photo', PNG, { preview: 'image', mime: 'image/png' })
        expect(made).toHaveLength(1)
        props.file = overwriteBytes(props.file, [{ offset: 8, bytes: Uint8Array.of(1) }])!.file
        flushSync()
        expect(made).toHaveLength(2)
        expect(revoked).toEqual([made[0].url])
        props.path = 'renamed'
        flushSync()
        expect(revoked).toEqual([made[0].url, made[1].url])
        dispose()
        expect(revoked).toEqual(made.map((entry) => entry.url))
    })

    it('keeps its URL while other Files change, or its own bytes are written again', () => {
        //the Project's Files in a FileSystem, read through getters as the pane hands them over
        let files = $state.raw<ProjectFiles>(
            cleanFiles({ 'main.s': { encoding: 'plain', content: 'nop' }, 'manual.pdf': file(PDF) })
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
        const target = document.createElement('div')
        document.body.appendChild(target)
        const preview = mount(FilePreview, {
            target,
            props: {
                path: 'manual.pdf',
                get file() {
                    return files['manual.pdf']
                },
                //a kind worked out again from the File, as the pane does
                get kind(): PreviewKind {
                    return files['manual.pdf'] && { preview: 'pdf', mime: 'application/pdf' }
                }
            }
        })
        flushSync()
        expect(made).toHaveLength(1)
        //typing in another pane, and a rewrite of the same bytes, which is a new record
        fs.writeText('main.s', 'nop\nnop')
        flushSync()
        fs.writeBytes('manual.pdf', PDF, true, 'base64')
        flushSync()
        expect(made).toHaveLength(1)
        expect(revoked).toEqual([])
        expect(target.querySelector('iframe')!.getAttribute('src')).toBe(made[0].url)
        void unmount(preview)
    })

    it('asks for the Hex editor where the browser cannot show the File, for its current bytes', () => {
        const image = setup('photo', PNG, { preview: 'image', mime: 'image/png' })
        image.target.querySelector('img')!.dispatchEvent(new Event('error'))
        expect(image.onUnavailable).toHaveBeenCalledWith('photo', PREVIEW_UNAVAILABLE.image)
        image.dispose()

        const audio = setup('song', Uint8Array.from([0x49, 0x44, 0x33]), {
            preview: 'audio',
            mime: 'audio/mpeg'
        })
        audio.target.querySelector('audio')!.dispatchEvent(new Event('error'))
        expect(audio.onUnavailable).toHaveBeenCalledWith('song', PREVIEW_UNAVAILABLE.audio)
        audio.dispose()

        const video = setup('clip', Uint8Array.from([0x1a, 0x45, 0xdf, 0xa3]), {
            preview: 'video',
            mime: 'video/webm'
        })
        const element = video.target.querySelector('video')!
        //an element still holding an earlier URL says nothing about the bytes now shown
        element.setAttribute('src', 'blob:http://localhost/stale')
        element.dispatchEvent(new Event('error'))
        expect(video.onUnavailable).not.toHaveBeenCalled()
        video.dispose()
    })
})

describe('what the browser can show', () => {
    const chrome = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/153.0 Safari/537.36'
    const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15'
    const mac =
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'

    it('shows a PDF in a frame where there is a viewer, except on iOS and iPadOS', () => {
        const display = (userAgent: string, pdfViewerEnabled: boolean, maxTouchPoints = 0) =>
            pdfDisplay({ userAgent, pdfViewerEnabled, maxTouchPoints })
        expect(display(chrome, true)).toBe('frame')
        expect(display(chrome, false)).toBe('tab')
        expect(display(mac, true)).toBe('frame')
        expect(display(iphone, true, 5)).toBe('first-page')
        //iPadOS's Safari, which names itself a Mac
        expect(display(mac, true, 5)).toBe('first-page')
    })

    it('writes a duration as minutes and seconds', () => {
        expect(formatDuration(187.4)).toBe('3:07')
        expect(formatDuration(3723)).toBe('1:02:03')
        expect(formatDuration(Number.NaN)).toBeUndefined()
        expect(formatDuration(Infinity)).toBeUndefined()
    })
})
