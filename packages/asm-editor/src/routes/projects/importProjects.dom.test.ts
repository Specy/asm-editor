import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { zipSync } from 'fflate'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { fileBytes } from '#lib/projectFiles.ts'
import { goto } from '$app/navigation'

vi.mock('$app/navigation', () => ({ goto: vi.fn() }))

// jsdom has no Web Animations API, which the page's card transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

const crackme = () => new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

/** A File whose bytes jsdom's FileReader and `arrayBuffer()` both read. */
function file(bytes: Uint8Array, name: string) {
    return new File([bytes.slice()], name)
}

async function page(route: 'list' | 'create' = 'list') {
    const target = document.createElement('div')
    document.body.append(target)
    const component =
        route === 'list'
            ? mount((await import('./+page.svelte')).default, { target })
            : mount((await import('./create/+page.svelte')).default, {
                  target,
                  props: { data: { templates: {} } } as never
              })
    flushSync()
    return {
        target,
        dispose: async () => {
            await unmount(component)
            target.remove()
        }
    }
}

/** A drag of files from the computer, which jsdom has no DataTransfer for. */
function drag(target: EventTarget, type: string, files: { file: File; folder?: boolean }[] = []) {
    const event = new Event(type, { bubbles: true, cancelable: true })
    Object.defineProperty(event, 'dataTransfer', {
        value: {
            types: ['Files'],
            dropEffect: 'none',
            items: files.map(({ file, folder = false }) => ({
                kind: 'file',
                getAsFile: () => file,
                webkitGetAsEntry: () => ({ isDirectory: folder })
            }))
        }
    })
    target.dispatchEvent(event)
    flushSync()
    return event
}

async function projectNamed(name: string) {
    await vi.waitFor(() =>
        expect(ProjectStore.projects.some((project) => project.name === name)).toBe(true)
    )
    return ProjectStore.projects.find((project) => project.name === name)!
}

afterEach(async () => {
    for (const project of [...ProjectStore.projects]) await ProjectStore.deleteProject(project)
    ProjectStore.writableFiles.clear()
    delete (window as { showOpenFilePicker?: unknown }).showOpenFilePicker
    vi.restoreAllMocks()
})

it('imports an extensionless ELF as an x86 Project before trying a zip or text', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => undefined)
    const { target, dispose } = await page()
    try {
        const input = target.querySelector('input[type=file]') as HTMLInputElement
        // No filter: CTF binaries rarely have an extension.
        expect(input.accept).toBe('')
        Object.defineProperty(input, 'files', {
            value: [file(crackme(), 'chall')],
            configurable: true
        })
        input.dispatchEvent(new Event('change', { bubbles: true }))
        const project = await projectNamed('chall')
        expect(project.language).toBe('X86')
        expect(project.entry).toBe('chall')
        expect(fileBytes(project.files.chall)).toEqual(crackme())
    } finally {
        await dispose()
    }
})

it('refuses an ELF the editor cannot run, with the reason', async () => {
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const { target, dispose } = await page()
    try {
        const input = target.querySelector('input[type=file]') as HTMLInputElement
        const arm = crackme()
        new DataView(arm.buffer).setUint16(18, 183, true)
        Object.defineProperty(input, 'files', { value: [file(arm, 'chall')], configurable: true })
        input.dispatchEvent(new Event('change', { bubbles: true }))
        await vi.waitFor(() =>
            expect(error).toHaveBeenCalledWith(expect.stringContaining('an ARM program'))
        )
        expect(ProjectStore.projects).toEqual([])
    } finally {
        await dispose()
    }
})

it('never links an Executable Project to the ELF file it came from', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => undefined)
    const handle = (bytes: Uint8Array, name: string) =>
        ({
            getFile: async () => file(bytes, name),
            createWritable: vi.fn()
        }) as unknown as FileSystemFileHandle
    const elf = handle(crackme(), 'chall')
    const source = handle(new TextEncoder().encode('mov eax, 1\n'), 'notes.asm')
    const archive = handle(
        zipSync({ 'notes.txt': new TextEncoder().encode('not a Project') }),
        'other.asmproj'
    )
    let picked: FileSystemFileHandle[] = [elf, source]
    ;(window as { showOpenFilePicker?: unknown }).showOpenFilePicker = async () => picked
    const { target, dispose } = await page()
    try {
        const importButton = [...target.querySelectorAll('button')].find(
            (button) => button.textContent?.trim() === 'Import'
        )!
        expect(target.querySelector('input[type=file]')).toBeNull()
        importButton.click()
        await projectNamed('chall')
        // The first detection loads every architecture's instruction tables on demand
        await vi.waitFor(() => expect(ProjectStore.projects).toHaveLength(2), { timeout: 15000 })
        const executable = ProjectStore.projects.find((project) => project.name === 'chall')!
        const text = ProjectStore.projects.find((project) => project.name !== 'chall')!
        expect(ProjectStore.writableFiles.has(executable.id)).toBe(false)
        await vi.waitFor(() =>
            expect(ProjectStore.writableFiles.get(text.id)).toMatchObject({
                handle: source,
                format: 'legacy'
            })
        )
        expect(elf.createWritable).not.toHaveBeenCalled()
        // A zip is read as a Project archive and linked as one, or refused as one.
        vi.spyOn(toast, 'error').mockImplementation(() => undefined)
        vi.spyOn(console, 'error').mockImplementation(() => undefined)
        picked = [archive]
        importButton.click()
        await vi.waitFor(() => expect(toast.error).toHaveBeenCalled())
        expect(ProjectStore.projects).toHaveLength(2)
    } finally {
        await dispose()
    }
})

it('shows where files can be dropped, and imports what is dropped anywhere on the page', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => undefined)
    const error = vi.spyOn(toast, 'error').mockImplementation(() => undefined)
    const { target, dispose } = await page()
    try {
        const zone = target.querySelector('.drop-zone')!
        expect(zone.textContent).toContain('Drop files here to import them')
        expect(target.querySelector('.drop-overlay')).toBeNull()
        // Something dragged off the page itself is no import.
        drag(document.body, 'dragstart')
        drag(document.body, 'dragenter')
        expect(target.querySelector('.drop-overlay')).toBeNull()
        drag(document.body, 'dragend')
        expect(drag(document.body, 'dragover').defaultPrevented).toBe(true)
        const overlay = target.querySelector('.drop-overlay')!
        expect(overlay).not.toBeNull()
        expect(zone.classList.contains('dragging')).toBe(true)
        drag(overlay, 'dragleave')
        expect(zone.classList.contains('dragging')).toBe(false)
        drag(document.body, 'dragenter')
        const dropped = drag(document.body, 'drop', [
            { file: file(new Uint8Array(), 'sources'), folder: true },
            { file: file(crackme(), 'chall') }
        ])
        expect(dropped.defaultPrevented).toBe(true)
        expect(zone.classList.contains('dragging')).toBe(false)
        expect(error).toHaveBeenCalledWith('sources is a folder: drop the files in it instead')
        const project = await projectNamed('chall')
        expect(project.language).toBe('X86')
        // A copy: the dropped file is never written to.
        expect(ProjectStore.writableFiles.has(project.id)).toBe(false)
        expect(ProjectStore.projects).toHaveLength(1)
    } finally {
        await dispose()
    }
})

it('opens the Project a file dropped on Create project became', async () => {
    vi.spyOn(toast, 'success').mockImplementation(() => undefined)
    const { target, dispose } = await page('create')
    try {
        expect(target.querySelector('.drop-zone')?.textContent).toContain(
            'Already have a program? Drop it here'
        )
        drag(document.body, 'dragenter')
        drag(document.body, 'drop', [{ file: file(crackme(), 'chall') }])
        const project = await projectNamed('chall')
        await vi.waitFor(() => expect(goto).toHaveBeenCalledWith(`/projects/${project.id}`))
    } finally {
        await dispose()
    }
})
