import { untrack } from 'svelte'

/**
 * How tall the bottom panel grows while a Debug session's program writes or waits for input: about
 * eight lines of the Terminal under its tabs and its Command line, where the default shows two.
 */
export const PROGRAM_IO_HEIGHT = 232

/** The bottom panel as the growth reads and sizes it. */
export type ProgramIoPanel = {
    /** Whether a Debug session is on, other than a test run's. */
    readonly debugging: boolean
    /** Whether the program wrote anything to the Terminal, or waits to read from it. */
    readonly talking: boolean
    /** The panel's height now. */
    readonly height: number
    /** The most the panel may take, which leaves the editor its least. */
    readonly room: number
    grow: (height: number) => void
}

/**
 * The bottom panel growing for a program's input and output
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
 * 12): once a Debug session's program writes or waits to read, to `PROGRAM_IO_HEIGHT` as far as
 * there is room, and never back by itself. Once the person sizes it during the session, which
 * `resized` says, it is left as they chose until the next session. Its effects are the caller's,
 * so it is set up with a component.
 */
export function growForProgramIo(panel: ProgramIoPanel): { resized: () => void } {
    let sized = false
    $effect(() => {
        if (!panel.debugging) sized = false
    })
    const talking = $derived(panel.debugging && panel.talking)
    $effect(() => {
        if (!talking) return
        untrack(() => {
            const height = Math.min(PROGRAM_IO_HEIGHT, panel.room)
            if (!sized && panel.height < height) panel.grow(height)
        })
    })
    return {
        resized: () => {
            if (untrack(() => panel.debugging)) sized = true
        }
    }
}
