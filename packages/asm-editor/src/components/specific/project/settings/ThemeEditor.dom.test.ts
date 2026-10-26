import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'
import ThemeEditor from './ThemeEditor.svelte'
import { ThemeStore } from '#stores/themeStore.svelte.ts'
import { Prompt } from '#stores/promptStore.svelte.ts'

beforeEach(() => {
    //an editable theme's colour rows scale in, which jsdom cannot animate
    Element.prototype.animate = (() => ({
        cancel() {},
        finish() {},
        onfinish: null,
        finished: Promise.resolve()
    })) as unknown as typeof Element.prototype.animate
    Element.prototype.getAnimations ??= () => []
})
const mounted: (() => void)[] = []
afterEach(() => {
    mounted.splice(0).forEach((dispose) => dispose())
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

/** The trash button's handler waits on the confirmation before it deletes. */
const settle = () => new Promise((resolve) => setTimeout(resolve))

function render() {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const editor = mount(ThemeEditor, { target })
    mounted.push(() => unmount(editor))
    flushSync()
    return target
}

describe('deleting a custom theme', () => {
    it('leaves the active theme selected', async () => {
        ThemeStore.createNewAndSet('Theme A')
        const a = ThemeStore.meta.id
        ThemeStore.createNewAndSet('Theme B')
        const b = ThemeStore.meta.id
        const target = render()
        const confirm = vi.spyOn(Prompt, 'confirm').mockResolvedValue(false)
        const preset = [...target.querySelectorAll('.theme-selector')].find((button) =>
            button.textContent?.includes('Theme A')
        )!
        preset.querySelector<HTMLButtonElement>('.btn')!.click()
        await settle()
        expect(confirm).toHaveBeenCalledOnce()
        expect(ThemeStore.meta.id).toBe(b)

        confirm.mockResolvedValue(true)
        preset.querySelector<HTMLButtonElement>('.btn')!.click()
        await settle()
        expect(ThemeStore.themes.some((theme) => theme.id === a)).toBe(false)
        expect(ThemeStore.meta.id).toBe(b)
        ThemeStore.delete(b)
    })
})
