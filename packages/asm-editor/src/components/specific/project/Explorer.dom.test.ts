import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import Explorer from './Explorer.svelte'
import { FileSystem } from '#lib/languages/peripherals/FileSystem.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'
import { toast } from '#stores/toastStore.ts'
import { executableKind } from '#lib/executables.ts'
import type { AvailableLanguages } from '#lib/Project.svelte.ts'

const fixture = () => new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))

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
            entry: 'main.asm',
            selectedPath: 'main.asm',
            hints: true,
            onSelect: vi.fn(),
            onEntryChange: vi.fn()
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

async function upload(bytes: Uint8Array, confirm = true) {
    const fileSystem = new FileSystem({ 'main.asm': { encoding: 'plain', content: 'nop' } })
    const target = document.createElement('div')
    document.body.append(target)
    const choose = vi.fn()
    const prompt = vi.spyOn(Prompt, 'confirm').mockResolvedValue(confirm)
    const warn = vi.spyOn(toast, 'warn').mockImplementation(() => undefined)
    const component = mount(Explorer, {
        target,
        props: {
            files: fileSystem.files,
            fileSystem,
            language: 'X86',
            entry: 'main.asm',
            selectedPath: 'main.asm',
            onSelect: vi.fn(),
            onEntryChange: choose
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

it('uploads an extensionless Executable and offers to make it the Entry file', async () => {
    const result = await upload(fixture())
    try {
        expect(executableKind(result.fileSystem.files.chall)).toBe('supported')
        expect(result.prompt).toHaveBeenCalledWith('Make chall the Entry file?')
        expect(result.choose).toHaveBeenCalledWith('chall')
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
