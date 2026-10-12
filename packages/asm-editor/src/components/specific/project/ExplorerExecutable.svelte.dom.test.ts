import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import Explorer from './Explorer.svelte'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'

const crackme = () => new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

/** Mounts the Explorer with reactive props, so a test can start a Debug session (lock it). */
function explorer(language: 'X86' | 'MIPS') {
    const fileSystem = new FileSystem({ 'main.asm': { encoding: 'plain', content: 'nop' } })
    const target = document.createElement('div')
    document.body.append(target)
    const choose = vi.fn()
    const props = $state({
        files: fileSystem.files,
        fileSystem,
        language,
        entry: 'main.asm',
        selectedPath: 'main.asm',
        locked: false,
        onSelect: vi.fn(),
        onEntryChange: choose
    })
    const component = mount(Explorer, { target, props })
    flushSync()
    return {
        props,
        fileSystem,
        choose,
        async upload(bytes: Uint8Array, name: string) {
            const input = target.querySelector('input[type=file]') as HTMLInputElement
            const file = new File([], name)
            Object.defineProperty(file, 'arrayBuffer', { value: async () => bytes.slice().buffer })
            Object.defineProperty(input, 'files', { value: [file], configurable: true })
            input.dispatchEvent(new Event('change', { bubbles: true }))
            await vi.waitFor(() => expect(fileSystem.files[name]).toBeDefined())
            await new Promise((resolve) => setTimeout(resolve, 0))
            flushSync()
        },
        async dispose() {
            await unmount(component)
            target.remove()
        }
    }
}

it('keeps an ELF a plain File outside x86 Projects, without a toast or a question', async () => {
    const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(true)
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => undefined)
    const view = explorer('MIPS')
    try {
        await view.upload(crackme(), 'chall')
        await view.upload(crackme().subarray(0, 25), 'broken')
        expect(confirm).not.toHaveBeenCalled()
        expect(warn).not.toHaveBeenCalled()
        expect(view.choose).not.toHaveBeenCalled()
    } finally {
        await view.dispose()
        vi.restoreAllMocks()
    }
})

it('does not change the Entry when a Debug session started while it asked', async () => {
    let answer!: (value: boolean) => void
    vi.spyOn(Prompt, 'confirm').mockImplementation(
        () => new Promise<boolean>((resolve) => (answer = resolve))
    )
    const view = explorer('X86')
    try {
        await view.upload(crackme(), 'chall')
        await vi.waitFor(() => expect(answer).toBeTypeOf('function'))
        view.props.locked = true
        flushSync()
        answer(true)
        await new Promise((resolve) => setTimeout(resolve, 0))
        expect(view.choose).not.toHaveBeenCalled()
    } finally {
        await view.dispose()
        vi.restoreAllMocks()
    }
})
