/**
 * The language an embed link asks for. Links are written by hand on other sites as well as by
 * the embed builder, so the `language` parameter is read the way a playground fence is, in any of
 * its spellings, and one the editor has not got opens the default language.
 */
import 'fake-indexeddb/auto'
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { flushSync, mount, unmount } from 'svelte'

// svelte/motion reads the reduced motion query as it loads, before any hook runs
vi.hoisted(() => {
    window.matchMedia = (() => ({
        matches: false,
        addEventListener() {},
        removeEventListener() {}
    })) as unknown as typeof window.matchMedia
})
const page = vi.hoisted(() => ({ url: new URL('https://asm-editor.specy.app/embed') }))
vi.mock('$app/state', () => ({ page }))
//no Core loads in jsdom
vi.mock('#cmp/shared/providers/EmulatorLoader.svelte', async () => ({
    default: (await import('#cmp/shared/providers/__fixtures__/EmulatorLoaderStub.svelte')).default
}))

// jsdom has no Web Animations API, which the page's transitions use.
Element.prototype.animate ??= function () {
    return { onfinish: null, cancel() {}, finish() {} } as unknown as Animation
}
Element.prototype.getAnimations ??= () => []

afterEach(() => {
    document.body.replaceChildren()
})

/** The language the embed at `/embed<search>` loads its emulator for. */
async function languageOf(search: string) {
    page.url = new URL(`https://asm-editor.specy.app/embed${search}`)
    const target = document.createElement('div')
    document.body.append(target)
    const component = mount((await import('./+page.svelte')).default, { target })
    flushSync()
    const language = target.querySelector('.emulator-source')?.getAttribute('data-language')
    void unmount(component)
    return language
}

it('reads the language of a hand-written link the way a playground fence spells it', async () => {
    expect(await languageOf('?language=riscv')).toBe('RISC-V')
    expect(await languageOf('?language=riscv64')).toBe('RISC-V-64')
    expect(await languageOf('?language=x86')).toBe('X86')
})

it('keeps the spelling the embed builder writes', async () => {
    expect(await languageOf('?language=RISC-V-64')).toBe('RISC-V-64')
    expect(await languageOf('?language=Z80')).toBe('Z80')
})

it('opens the default language for one the editor has not got', async () => {
    expect(await languageOf('?language=fortran')).toBe('M68K')
    expect(await languageOf('')).toBe('M68K')
})
