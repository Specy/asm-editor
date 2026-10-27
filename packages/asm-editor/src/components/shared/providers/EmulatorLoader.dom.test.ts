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
        expect(document.body.textContent).toContain('Failed to load the emulator.')
    )
    expect(document.body.textContent).toContain('Failed to fetch dynamically imported module')
    expect(logged).toHaveBeenCalledWith(
        'Could not load the emulator',
        expect.objectContaining({ message: 'Failed to fetch dynamically imported module' })
    )
    void unmount(app)
})
