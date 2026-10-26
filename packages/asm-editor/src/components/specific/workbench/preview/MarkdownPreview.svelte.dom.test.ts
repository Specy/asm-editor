import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import MarkdownPreview from './MarkdownPreview.svelte'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { bytesFile, cleanFiles, type ProjectFile, type ProjectFiles } from '#lib/projectFiles.ts'

//the renderer reaches the projects store, which opens an IndexedDB jsdom does not have
vi.mock('#lib/storage/db', () => ({ db: { getProjects: async () => [] } }))

const png = bytesFile(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0]))
const text = (content: string): ProjectFile => ({ encoding: 'plain', content })

/** Polls until `found` answers, as Carta's render and the pause before it are asynchronous. */
async function until<T>(found: () => T | undefined | null | false, what: string): Promise<T> {
    for (let attempt = 0; attempt < 300; attempt++) {
        const value = found()
        if (value) return value
        await new Promise((resolve) => setTimeout(resolve, 10))
    }
    throw new Error(`never ${what}`)
}

describe('the Preview of a Markdown File', () => {
    let urls = 0
    beforeEach(() => {
        //jsdom has no Blob URLs
        URL.createObjectURL = vi.fn(() => `blob:test/${urls++}`)
        URL.revokeObjectURL = vi.fn()
    })
    let cleanup: (() => void) | undefined
    afterEach(() => cleanup?.())

    function render(content: string, files: ProjectFiles = {}) {
        const target = document.createElement('div')
        document.body.appendChild(target)
        const props = $state({
            path: 'docs/README.md',
            file: text(content),
            files: { 'docs/README.md': text(content), ...files },
            onOpenFile: vi.fn()
        })
        const component = mount(MarkdownPreview, { target, props })
        flushSync()
        cleanup = () => {
            unmount(component)
            target.remove()
        }
        return { target, props }
    }

    it('renders again as the text changes, once typing pauses', async () => {
        const { target, props } = render('# First\n')
        await until(() => target.querySelector('h1')?.textContent === 'First', 'rendered')
        props.file = text('# Second\n')
        await until(() => target.querySelector('h1')?.textContent === 'Second', 'rendered again')
    })

    it("shows an image File from its bytes, and never asks the page's own address", async () => {
        const { target } = render(
            '![logo](img/logo.png) ![none](missing.png) ![web](https://x/y.png)',
            {
                'docs/img/logo.png': png
            }
        )
        const images = await until(() => {
            const found = target.querySelectorAll('img')
            return found.length === 3 && found
        }, 'three images')
        expect(images[0].getAttribute('src')).toMatch(/^blob:test\//)
        expect(images[1].hasAttribute('src')).toBe(false)
        expect(images[1].title).toBe('No image File at docs/missing.png')
        expect(images[2].getAttribute('src')).toBe('https://x/y.png')
    })

    it('keeps its images while the Markdown is typed, and renders it again once typing pauses', async () => {
        //the Project's Files in a FileSystem, read through getters as the pane hands them over
        let files = $state.raw<ProjectFiles>(
            cleanFiles({
                'docs/README.md': text('![logo](img/logo.png)\n'),
                'docs/img/logo.png': png
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
        const target = document.createElement('div')
        document.body.appendChild(target)
        const component = mount(MarkdownPreview, {
            target,
            props: {
                path: 'docs/README.md',
                get file() {
                    return files['docs/README.md']
                },
                get files() {
                    return files
                },
                onOpenFile: vi.fn()
            }
        })
        cleanup = () => {
            unmount(component)
            target.remove()
        }
        flushSync()
        const src = await until(() => target.querySelector('img')?.getAttribute('src'), 'an image')
        fs.writeText('docs/README.md', '![logo](img/logo.png)\n\nMore\n')
        flushSync()
        //nothing renders before the pause, and the image keeps its Blob
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        expect(target.textContent).not.toContain('More')
        await until(() => target.textContent?.includes('More'), 'rendered again')
        expect(URL.createObjectURL).toHaveBeenCalledTimes(1)
        expect(URL.revokeObjectURL).not.toHaveBeenCalled()
        expect(target.querySelector('img')!.getAttribute('src')).toBe(src)
    })

    it('opens a linked File in the Workbench rather than following it', async () => {
        const { target, props } = render('[the Entry](../main.asm) [nowhere](gone.md)', {
            'main.asm': text('nop\n')
        })
        const links = await until(() => {
            const found = target.querySelectorAll('a')
            return found.length === 2 && found
        }, 'two links')
        const click = (link: Element) => {
            const event = new MouseEvent('click', { bubbles: true, cancelable: true })
            link.dispatchEvent(event)
            return event.defaultPrevented
        }
        expect(click(links[0])).toBe(true)
        expect(props.onOpenFile).toHaveBeenCalledWith('main.asm')
        expect(click(links[1])).toBe(true)
        expect(props.onOpenFile).toHaveBeenCalledTimes(1)
    })

    it('takes off the styles, frames and forms the Markdown brings', async () => {
        const { target } = render(
            '<p style="position:fixed;inset:0">over</p>\n\n<style>body{display:none}</style>\n\n<iframe src="https://x"></iframe><form><input></form>\n'
        )
        const paragraph = await until(() => target.querySelector('.markdown-body p'), 'rendered')
        expect(paragraph.hasAttribute('style')).toBe(false)
        expect(target.querySelector('.markdown-body style, iframe, form, input')).toBeNull()
    })
})
