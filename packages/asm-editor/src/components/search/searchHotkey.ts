import {
    modShortcutKey,
    ShortcutAction,
    shortcutRecording,
    shortcutsStore
} from '#stores/shortcutsStore.ts'

/**
 * Whether the key was pressed in a code editor or a text field. The navbar's search leaves Ctrl+K
 * to them: on a page with an editor, as /embed, /exam and /chat are, it starts Monaco's chords.
 */
export function typedInEditor(event: KeyboardEvent): boolean {
    return event
        .composedPath()
        .some(
            (node) =>
                node instanceof HTMLElement &&
                (node.matches(
                    'input, textarea, select, canvas, [contenteditable=""], [contenteditable="true"]'
                ) ||
                    node.classList.contains('monaco-editor'))
        )
}

/**
 * Ctrl+K (⌘K) on the pages that have a search palette, through the same binding as in the
 * Workbench, so a key rebound in Settings is rebound everywhere. Caught on the way down, before the
 * Monaco editor of an instruction page or a lecture's demo takes it for the start of a chord, and
 * before the browser's own Ctrl+K. Returns the cleanup, for an `$effect` or `onMount`.
 */
export function listenForSearchKey(open: (event: KeyboardEvent) => boolean | void): () => void {
    const listener = (event: KeyboardEvent) => {
        if (shortcutRecording.active) return
        const key = modShortcutKey(event)
        if (!key || shortcutsStore.get(key)?.type !== ShortcutAction.SearchDocumentation) return
        // `false` leaves the key alone, for whatever has the focus
        if (open(event) === false) return
        event.preventDefault()
        event.stopPropagation()
    }
    window.addEventListener('keydown', listener, { capture: true })
    return () => window.removeEventListener('keydown', listener, { capture: true })
}
