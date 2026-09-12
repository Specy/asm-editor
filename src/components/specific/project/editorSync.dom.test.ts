import { describe, expect, it } from 'vitest'
import { flushSync, mount, unmount } from 'svelte'
import ProjectSyncHarness from './__fixtures__/ProjectSyncHarness.svelte'

/**
 * Content sync between the Project's Files and the editor's models.
 *
 * The regression this pins: the editor wrote its `code` prop from a content listener while the host
 * was deriving that same prop from the Files. Assigning a `$bindable()` prop the host did not bind
 * overwrites a pending update from the host and detaches the prop from it, so the effect that picks
 * the model ran with the newly opened File's key and the previously edited File's text — and gave
 * the new File a model holding the other one's source. A multi-File host now passes an atomic
 * `source` and the editor never writes `code`.
 */
function open(multiFile: boolean) {
    const target = document.createElement('div')
    document.body.appendChild(target)
    const app = mount(ProjectSyncHarness, { target, props: { multiFile } })
    flushSync()
    return app
}

describe('editor content sync', () => {
    it('shows each File its own contents after editing another one', () => {
        const app = open(true)
        expect(app.shown()).toBe('contents of A')

        app.typeInEditor('edited A')
        flushSync()
        expect(app.shown()).toBe('edited A')
        expect(app.files_()).toEqual({ 'a.asm': 'edited A', 'b.asm': 'contents of B' })

        app.open('b.asm')
        flushSync()
        //the heart of it: B must not open holding A's text
        expect(app.shown()).toBe('contents of B')
        expect(app.files_()).toEqual({ 'a.asm': 'edited A', 'b.asm': 'contents of B' })

        app.open('a.asm')
        flushSync()
        expect(app.shown()).toBe('edited A')
        unmount(app)
    })

    it('does not write one File’s text into another when edits and switches interleave', () => {
        const app = open(true)
        app.typeInEditor('first edit')
        flushSync()
        app.open('b.asm')
        flushSync()
        app.typeInEditor('edited B')
        flushSync()
        app.open('a.asm')
        flushSync()
        expect(app.files_()).toEqual({ 'a.asm': 'first edit', 'b.asm': 'edited B' })
        expect(app.shown()).toBe('first edit')
        unmount(app)
    })

    it('still carries edits back through code for a single-source host', () => {
        const app = open(false)
        expect(app.shown()).toBe('contents of A')
        app.typeInEditor('edited A')
        flushSync()
        expect(app.shown()).toBe('edited A')
        unmount(app)
    })
})
