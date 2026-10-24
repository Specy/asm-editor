import { describe, expect, it } from 'vite-plus/test'
import type monaco from 'monaco-editor'
import { watchFindWidget } from './findWidget'

type StateChange = { isRevealed: boolean; searchString: boolean }

/** An editor whose find controller holds a state the test changes, as Monaco's widget would. */
function editorWithFind() {
    const listeners = new Set<(event: StateChange) => void>()
    const state = {
        isRevealed: false,
        onFindReplaceStateChange: (listener: (event: StateChange) => void) => {
            listeners.add(listener)
            return { dispose: () => listeners.delete(listener) }
        }
    }
    const controller = { getId: () => 'editor.contrib.findController', getState: () => state }
    const editor = {
        getContribution: (id: string) => (id === controller.getId() ? controller : null)
    } as unknown as monaco.editor.ICodeEditor
    return {
        editor,
        listeners,
        /** Opens or closes the widget, or with undefined changes only what is searched for. */
        change(isRevealed?: boolean) {
            const event = {
                isRevealed: isRevealed !== undefined && isRevealed !== state.isRevealed,
                searchString: isRevealed === undefined
            }
            if (isRevealed !== undefined) state.isRevealed = isRevealed
            for (const listener of listeners) listener(event)
        }
    }
}

describe("an editor's find widget", () => {
    it('is reported open and closed as it is revealed and hidden, and no more once disposed', () => {
        const find = editorWithFind()
        const reports: boolean[] = []
        find.change(true)
        const watch = watchFindWidget(find.editor, (open) => reports.push(open))
        expect(reports).toEqual([true])
        //typing into it changes the state without opening or closing it
        find.change()
        expect(reports).toEqual([true])
        find.change(false)
        find.change(true)
        expect(reports).toEqual([true, false, true])
        watch.dispose()
        expect(find.listeners.size).toBe(0)
        find.change(false)
        expect(reports).toEqual([true, false, true])
    })

    it('is reported closed when Monaco has no find controller it knows', () => {
        const reports: boolean[] = []
        const editor = { getContribution: () => null } as unknown as monaco.editor.ICodeEditor
        expect(() => watchFindWidget(editor, (open) => reports.push(open)).dispose()).not.toThrow()
        expect(reports).toEqual([false])
    })
})
