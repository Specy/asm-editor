import { untrack } from 'svelte'
import { DEFAULT_BOTTOM_HEIGHT } from '#stores/workbenchLayoutStore.svelte.ts'

/** The bottom panel as the growth reads and sizes it. */
export type ProgramIoPanel = {
    /** Whether a Debug session is on, other than a test run's. */
    readonly debugging: boolean
    /** Whether the program waits to read from the Terminal. */
    readonly reading: boolean
    /** The panel's height now. */
    readonly height: number
    /** The most the panel may take, which leaves the editor its least. */
    readonly room: number
    grow: (height: number) => void
}

/**
 * The bottom panel growing for a program's input
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
 * 12, as [the design record](../../../../../docs/design/workbench.md) revised it on 2026-10-23):
 * once a Debug session's program waits to read, a panel dragged below the default height grows
 * back to it, as far as there is room, so the line being typed shows. What the program writes
 * moves nothing, and a panel at the default height or taller is left as it is. Once the person
 * sizes it during the session, which `resized` says, it is left as they chose until the next
 * session. Its effects are the caller's, so it is set up with a component.
 */
export function growForProgramIo(panel: ProgramIoPanel): { resized: () => void } {
    let sized = false
    $effect(() => {
        if (!panel.debugging) sized = false
    })
    const reading = $derived(panel.debugging && panel.reading)
    $effect(() => {
        if (!reading) return
        untrack(() => {
            const height = Math.min(DEFAULT_BOTTOM_HEIGHT, panel.room)
            if (!sized && panel.height < height) panel.grow(height)
        })
    })
    return {
        resized: () => {
            if (untrack(() => panel.debugging)) sized = true
        }
    }
}
