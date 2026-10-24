/**
 * The bottom panel growing for a program's input
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision 12,
 * as the design record revised it on 2026-10-23). Only a browser build runs effects, so this runs
 * in the DOM project.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { DEFAULT_BOTTOM_HEIGHT } from '#stores/workbenchLayoutStore.svelte.ts'
import { growForProgramIo } from './programIoGrowth.svelte'

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

/** A panel dragged to its least height, its program not reading, with room to grow. */
function panel() {
    const state = $state({ debugging: false, reading: false, height: 72, room: 600 })
    let growth!: ReturnType<typeof growForProgramIo>
    disposers.push(
        $effect.root(() => {
            growth = growForProgramIo({
                get debugging() {
                    return state.debugging
                },
                get reading() {
                    return state.reading
                },
                get height() {
                    return state.height
                },
                get room() {
                    return state.room
                },
                grow: (height) => (state.height = height)
            })
        })
    )
    flushSync()
    return { state, growth }
}

describe('the bottom panel', () => {
    it("grows to the default height once a Debug session's program reads, and never shrinks back", () => {
        const { state } = panel()
        state.reading = true
        flushSync()
        //a read outside a Debug session, such as a test run's, moves nothing
        expect(state.height).toBe(72)
        state.debugging = true
        flushSync()
        expect(state.height).toBe(DEFAULT_BOTTOM_HEIGHT)
        state.reading = false
        state.debugging = false
        flushSync()
        expect(state.height).toBe(DEFAULT_BOTTOM_HEIGHT)
    })

    it('leaves a panel at the default height or taller as it is', () => {
        const { state } = panel()
        state.height = DEFAULT_BOTTOM_HEIGHT + 4
        state.debugging = true
        state.reading = true
        flushSync()
        expect(state.height).toBe(DEFAULT_BOTTOM_HEIGHT + 4)
    })

    it('grows only as far as the editor leaves room for', () => {
        const { state } = panel()
        state.room = 80
        state.debugging = true
        state.reading = true
        flushSync()
        expect(state.height).toBe(80)
    })

    it('is left as the person sized it during the session, and grows again in the next', () => {
        const { state, growth } = panel()
        state.debugging = true
        flushSync()
        growth.resized()
        state.height = 76
        state.reading = true
        flushSync()
        expect(state.height).toBe(76)
        //a resize outside a session leaves the next one free to grow it
        state.debugging = false
        state.reading = false
        flushSync()
        growth.resized()
        state.debugging = true
        state.reading = true
        flushSync()
        expect(state.height).toBe(DEFAULT_BOTTOM_HEIGHT)
    })
})
