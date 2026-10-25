import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, tick, unmount } from 'svelte'
import Explorer from './Explorer.svelte'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { executableKind } from '#lib/executables.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'
import type { ProgramChoice } from '#lib/workbench/WorkbenchSession.svelte.ts'

const fixture = () => new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

/** The Programs of a Project whose Entries are `entries`, each labelled by its path. */
const programsAt = (...entries: string[]): ProgramChoice[] =>
    entries.map((entry) => ({ entry, label: entry, missing: false }))

it.each<AvailableLanguages>(['X86', 'M68K', 'MIPS', 'RISC-V', 'RISC-V-64', 'Z80'])(
    'renders hints on the first open and keeps them on reopen for %s',
    async (language) => {
        const fileSystem = new FileSystem({ 'main.asm': { encoding: 'plain', content: 'nop' } })
        const target = document.createElement('div')
        document.body.append(target)
        const props = {
            files: fileSystem.files,
            fileSystem,
            language,
            programs: programsAt('main.asm'),
            selectedProgram: 'main.asm',
            selectedPath: 'main.asm',
            hints: true,
            onSelect: vi.fn()
        }
        let component: ReturnType<typeof mount> | undefined
        try {
            component = mount(Explorer, { target, props })
            flushSync()
            const tipTexts = () =>
                Array.from(target.querySelectorAll('.hints a, .hints p'), (tip) => tip.textContent)
            const firstTips = tipTexts()
            expect(firstTips).toHaveLength(language === 'M68K' || language === 'Z80' ? 2 : 1)
            await unmount(component)
            component = undefined

            component = mount(Explorer, { target, props })
            flushSync()
            expect(tipTexts()).toEqual(firstTips)
        } finally {
            if (component) await unmount(component)
            target.remove()
        }
    }
)

/** Uploads `chall` into an x86 Project whose Programs are `programs`. */
async function upload(bytes: Uint8Array, confirm = true, programs = programsAt('main.asm')) {
    const fileSystem = new FileSystem({ 'main.asm': { encoding: 'plain', content: 'nop' } })
    const target = document.createElement('div')
    document.body.append(target)
    const choose = vi.fn()
    const added = vi.fn()
    const prompt = vi.spyOn(Prompt, 'confirm').mockResolvedValue(confirm)
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => undefined)
    const component = mount(Explorer, {
        target,
        props: {
            files: fileSystem.files,
            fileSystem,
            language: 'X86',
            programs,
            selectedProgram: programs[0]?.entry,
            selectedPath: 'main.asm',
            onSelect: vi.fn(),
            onNewProgram: choose,
            onFilesAdded: added
        }
    })
    flushSync()
    const input = target.querySelector('input[type=file]') as HTMLInputElement
    const file = new File([], 'chall')
    Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.slice().buffer })
    Object.defineProperty(input, 'files', { value: [file] })
    input.dispatchEvent(new Event('change', { bubbles: true }))
    await vi.waitFor(() => expect(fileSystem.files.chall).toBeDefined())
    await new Promise((resolve) => setTimeout(resolve, 0))
    flushSync()
    return {
        fileSystem,
        choose,
        added,
        prompt,
        warn,
        dispose: async () => {
            await unmount(component)
            target.remove()
            prompt.mockRestore()
            warn.mockRestore()
        }
    }
}

it('uploads an extensionless Executable and offers it a program of its own', async () => {
    const result = await upload(fixture())
    try {
        expect(executableKind(result.fileSystem.files.chall)).toBe('supported')
        expect(result.added).toHaveBeenCalledWith(['chall'])
        expect(result.prompt).toHaveBeenCalledWith('Create a program for chall?')
        expect(result.choose).toHaveBeenCalledWith('chall')
    } finally {
        await result.dispose()
    }
})

it('asks nothing when the Project has no program, whose first the upload makes', async () => {
    const result = await upload(fixture(), true, [])
    try {
        //the host's first-Program rule makes it from the Files added
        expect(result.added).toHaveBeenCalledWith(['chall'])
        expect(result.prompt).not.toHaveBeenCalled()
        expect(result.choose).not.toHaveBeenCalled()
    } finally {
        await result.dispose()
    }
})

it('asks nothing when the Executable is an Entry already', async () => {
    const result = await upload(fixture(), true, programsAt('chall', 'main.asm'))
    try {
        expect(result.prompt).not.toHaveBeenCalled()
        expect(result.choose).not.toHaveBeenCalled()
    } finally {
        await result.dispose()
    }
})

it('keeps an unsupported ELF as a File and explains why it cannot run', async () => {
    const result = await upload(fixture().subarray(0, 25))
    try {
        expect(result.choose).not.toHaveBeenCalled()
        expect(result.warn).toHaveBeenCalledWith(expect.stringContaining('truncated'))
    } finally {
        await result.dispose()
    }
})

it('downloads a File as its exact bytes under its name, typed so no extension is added', async () => {
    //jsdom has no popovers, which the context menu opens as
    HTMLElement.prototype.showPopover ??= function () {}
    HTMLElement.prototype.hidePopover ??= function () {}
    const fileSystem = new FileSystem({
        'main.asm': { encoding: 'plain', content: 'nop' },
        crackme: { encoding: 'base64', content: 'f0RMRgIBAQ==' }
    })
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount(Explorer, {
        target,
        props: {
            files: fileSystem.files,
            fileSystem,
            language: 'X86',
            programs: programsAt('main.asm'),
            selectedProgram: 'main.asm',
            selectedPath: 'main.asm',
            onSelect: vi.fn()
        }
    })
    const saved: { name: string; blob: Blob }[] = []
    let blob: Blob | undefined
    //jsdom has no Blob URLs
    const { createObjectURL, revokeObjectURL } = URL
    URL.createObjectURL = vi.fn((value: Blob) => ((blob = value), 'blob:crackme'))
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
        this: HTMLAnchorElement
    ) {
        saved.push({ name: this.download, blob: blob! })
    })
    try {
        flushSync()
        const row = [...target.querySelectorAll<HTMLElement>('.tree-row')].find((candidate) =>
            candidate.textContent?.includes('crackme')
        )!
        row.dispatchEvent(
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
            (candidate) => candidate.textContent?.trim() === 'Download'
        )!
        item.click()
        expect(saved.map(({ name }) => name)).toEqual(['crackme'])
        expect(saved[0].blob.type).toBe('application/octet-stream')
        expect(new Uint8Array(await saved[0].blob.arrayBuffer())).toEqual(
            new Uint8Array([0x7f, 0x44, 0x4c, 0x46, 2, 1, 1])
        )
    } finally {
        URL.createObjectURL = createObjectURL
        URL.revokeObjectURL = revokeObjectURL
        click.mockRestore()
        await unmount(component)
        target.remove()
    }
})

it("opens a File's row in preview with a click, or selects it when the host has no preview", async () => {
    const fileSystem = new FileSystem({
        'main.asm': { encoding: 'plain', content: 'nop' },
        'notes.txt': { encoding: 'plain', content: 'hi' }
    })
    for (const preview of [true, false]) {
        const target = document.createElement('div')
        document.body.append(target)
        const onSelect = vi.fn()
        const onPreview = vi.fn()
        const component = mount(Explorer, {
            target,
            props: {
                files: fileSystem.files,
                fileSystem,
                programs: programsAt('main.asm'),
                selectedProgram: 'main.asm',
                selectedPath: 'main.asm',
                onSelect,
                ...(preview ? { onPreview } : {})
            }
        })
        flushSync()
        target.querySelector<HTMLElement>('[title="notes.txt"] .file-select')!.click()
        expect((preview ? onPreview : onSelect).mock.calls).toEqual([['notes.txt']])
        expect((preview ? onSelect : onPreview).mock.calls).toEqual([])
        await unmount(component)
        target.remove()
    }
})

it.each<[AvailableLanguages, number, number]>([
    ['RISC-V', 32, 0],
    ['MIPS', 32, 0],
    ['M68K', 32, 0],
    ['X86', 32, 0],
    ['Z80', 8, 256]
])(
    'makes a new picture in %s in the Screen’s layout, as bytes, and opens it to draw in',
    async (language, bits, colours) => {
        const fileSystem = new FileSystem({
            'main.s': { encoding: 'plain', content: 'nop' },
            'art/sprite.bmp': { encoding: 'plain', content: 'taken' }
        })
        const target = document.createElement('div')
        document.body.append(target)
        HTMLElement.prototype.showPopover ??= function () {}
        HTMLElement.prototype.hidePopover ??= function () {}
        const created = vi.fn()
        const added = vi.fn()
        const component = mount(Explorer, {
            target,
            props: {
                get files() {
                    return fileSystem.files
                },
                fileSystem,
                language,
                programs: programsAt('main.s'),
                selectedProgram: 'main.s',
                selectedPath: 'main.s',
                onSelect: vi.fn(),
                onFilesAdded: added,
                onPictureCreated: created
            }
        })
        try {
            flushSync()
            //from the folder's menu: its name taken, the next one is offered
            const folder = target.querySelector<HTMLElement>('[title="art"]')!
            folder.dispatchEvent(
                new MouseEvent('contextmenu', { bubbles: true, clientX: 5, clientY: 5 })
            )
            flushSync()
            //the menu focuses its first entry a tick after it opens
            await tick()
            const item = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
                (entry) => entry.textContent?.includes('New picture in this folder')
            )!
            item.click()
            flushSync()
            await tick()
            const dialog = target.querySelector<HTMLFormElement>('.new-picture')!
            expect(dialog.querySelector<HTMLInputElement>('input[type=text]')!.value).toBe(
                'sprite1.bmp'
            )
            dialog.requestSubmit()
            flushSync()
            const file = fileSystem.files['art/sprite1.bmp']
            expect(file.encoding).toBe('base64')
            const bytes = fileSystem.readBytes('art/sprite1.bmp')
            const view = new DataView(bytes.buffer, bytes.byteOffset)
            expect([view.getInt32(18, true), view.getInt32(22, true)]).toEqual([16, -16])
            expect(view.getUint16(28, true)).toBe(bits)
            expect(view.getUint32(46, true)).toBe(colours)
            expect(added).toHaveBeenCalledWith(['art/sprite1.bmp'])
            expect(created).toHaveBeenCalledWith('art/sprite1.bmp')
            expect(target.querySelector('.new-picture')).toBeNull()
        } finally {
            await unmount(component)
            target.remove()
        }
    }
)
