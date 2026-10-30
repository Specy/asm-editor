/**
 * The loader around every embedded emulator: a Core that fails to load is shown in its place and
 * logged, where it was also an unhandled rejection.
 */
import { afterEach, expect, it, vi } from 'vite-plus/test'
import { createRawSnippet, mount, unmount } from 'svelte'
import type { Emulator } from '#lib/languages/Emulator.ts'
import EmulatorLoader from './EmulatorLoader.svelte'

const createEmulator = vi.hoisted(() => vi.fn())
vi.mock('#lib/languages/Emulator.ts', async (original) => ({
    ...(await original<typeof import('#lib/languages/Emulator.ts')>()),
    createEmulator
}))

afterEach(() => {
    vi.restoreAllMocks()
    document.body.replaceChildren()
})

it('shows and logs a Core that failed to load', async () => {
    const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createEmulator.mockRejectedValue(new Error('Failed to fetch dynamically imported module'))
    const app = mount(EmulatorLoader, {
        target: document.body,
        props: {
            //x86 plays no sound, so no audio output is made for it
            language: 'X86',
            code: '',
            children: createRawSnippet<[Emulator]>(() => ({ render: () => '<p>loaded</p>' }))
        }
    })
    await vi.waitFor(() =>
        expect(document.body.textContent).toContain("The x86-64 emulator didn't load")
    )
    expect(document.querySelector('.error-message')?.textContent).toBe(
        'Failed to fetch dynamically imported module'
    )
    expect(logged).toHaveBeenCalledWith(
        'Could not load the emulator',
        expect.objectContaining({ message: 'Failed to fetch dynamically imported module' })
    )
    void unmount(app)
})

it('offers Reload, the host its own ways out, and a report filled in with the error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
    createEmulator.mockRejectedValue(new Error('function import requires a callable'))
    const app = mount(EmulatorLoader, {
        target: document.body,
        props: {
            language: 'X86',
            code: '',
            children: createRawSnippet<[Emulator]>(() => ({ render: () => '<p>loaded</p>' })),
            failureActions: createRawSnippet(() => ({
                render: () => '<a href="/projects">Back to projects</a>'
            }))
        }
    })
    await vi.waitFor(() => expect(document.querySelector('[role="alert"]')).not.toBeNull())
    const buttons = [...document.querySelectorAll('button')].map((button) => button.textContent)
    expect(buttons.some((text) => text?.includes('Reload the page'))).toBe(true)
    expect(document.querySelector('a[href="/projects"]')?.textContent).toBe('Back to projects')
    const report = new URL(
        document.querySelector<HTMLAnchorElement>('a[href^="https://github.com"]')!.href
    )
    expect(report.searchParams.get('title')).toBe("The x86-64 emulator didn't load")
    expect(report.searchParams.get('body')).toContain('function import requires a callable')
    void unmount(app)
})
