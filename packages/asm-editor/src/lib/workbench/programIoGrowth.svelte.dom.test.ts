/**
 * The bottom panel growing for a program's input and output
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision 12).
 * Only a browser build runs effects, so this runs in the DOM project.
 */
import { afterEach, describe, expect, it } from 'vite-plus/test'
import { flushSync } from 'svelte'
import { growForProgramIo, PROGRAM_IO_HEIGHT } from './programIoGrowth.svelte'

const disposers: (() => void)[] = []
afterEach(() => disposers.splice(0).forEach((dispose) => dispose()))

/** A panel at the default height, its program silent, with room to grow. */
function panel() {
    const state = $state({ debugging: false, talking: false, height: 96, room: 600 })
    let growth!: ReturnType<typeof growForProgramIo>
    disposers.push(
        $effect.root(() => {
            growth = growForProgramIo({
                get debugging() {
                    return state.debugging
                },
                get talking() {
                    return state.talking
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
    it("grows once a Debug session's program writes or reads, and never shrinks back", () => {
        const { state } = panel()
        state.talking = true
        flushSync()
        //the program of no Debug session, such as the last session's output, moves nothing
        expect(state.height).toBe(96)
        state.debugging = true
        flushSync()
        expect(state.height).toBe(PROGRAM_IO_HEIGHT)
        state.talking = false
        state.debugging = false
        flushSync()
        expect(state.height).toBe(PROGRAM_IO_HEIGHT)
        //one taller already stays as it is
        state.height = 400
        state.debugging = true
        state.talking = true
        flushSync()
        expect(state.height).toBe(400)
    })

    it('grows only as far as the editor leaves room for', () => {
        const { state } = panel()
        state.room = 150
        state.debugging = true
        state.talking = true
        flushSync()
        expect(state.height).toBe(150)
    })

    it('is left as the person sized it during the session, and grows again in the next', () => {
        const { state, growth } = panel()
        state.debugging = true
        flushSync()
        growth.resized()
        state.height = 80
        state.talking = true
        flushSync()
        expect(state.height).toBe(80)
        //a resize outside a session leaves the next one free to grow it
        state.debugging = false
        state.talking = false
        flushSync()
        growth.resized()
        state.debugging = true
        state.talking = true
        flushSync()
        expect(state.height).toBe(PROGRAM_IO_HEIGHT)
    })
})
