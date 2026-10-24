import type monaco from 'monaco-editor'

/**
 * Monaco's find controller, as much of it as this file needs: the state of its find widget.
 * `getContribution` is public API but the controller's class is not exported. A change event says,
 * field by field, which parts of the state changed.
 */
type FindController = monaco.editor.IEditorContribution & {
    getState(): {
        readonly isRevealed: boolean
        onFindReplaceStateChange: monaco.IEvent<{ isRevealed: boolean }>
    }
}

const FIND_CONTRIBUTION = 'editor.contrib.findController'

const NOTHING_TO_DISPOSE: monaco.IDisposable = { dispose() {} }

/**
 * Tells `onChange` whether the editor's find widget is open, at once and whenever it opens or
 * closes, until disposed. The controller keeps the widget open from one model to the next, so this
 * follows it whatever the editor shows.
 */
export function watchFindWidget(
    editor: monaco.editor.ICodeEditor,
    onChange: (open: boolean) => void
): monaco.IDisposable {
    const controller = editor.getContribution<FindController>(FIND_CONTRIBUTION)
    //A Monaco upgrade that renames these leaves the widget reported closed, as before this was
    //watched, rather than throwing
    const state = typeof controller?.getState === 'function' ? controller.getState() : undefined
    if (!state || typeof state.onFindReplaceStateChange !== 'function') {
        onChange(false)
        return NOTHING_TO_DISPOSE
    }
    onChange(state.isRevealed)
    return state.onFindReplaceStateChange((event) => {
        if (event.isRevealed) onChange(state.isRevealed)
    })
}
