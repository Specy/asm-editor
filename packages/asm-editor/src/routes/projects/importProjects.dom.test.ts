import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import { zipSync } from 'fflate'
import { ProjectStore } from '#stores/projectsStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { fileBytes } from '#lib/projectFiles.ts'

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

async function page() {
    const target = document.createElement('div')
    document.body.append(target)
    const { default: Page } = await import('./+page.svelte')
    const component = mount(Page, { target })
    flushSync()
    return {
        target,
        dispose: async () => {
            await unmount(component)
            target.remove()
        }
    }
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
        await vi.waitFor(() => expect(ProjectStore.projects).toHaveLength(2))
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
