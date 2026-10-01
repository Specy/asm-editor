import {
    modShortcutKey,
    ShortcutAction,
    shortcutRecording,
    shortcutsStore
} from '$stores/shortcutsStore'

/**
 * Ctrl+K (⌘K) on the pages that have a search palette, through the same binding as in the
 * Workbench, so a key rebound in Settings is rebound everywhere. Caught on the way down, before the
 * Monaco editor of an instruction page or a lecture's demo takes it for the start of a chord, and
 * before the browser's own Ctrl+K. Returns the cleanup, for an `$effect` or `onMount`.
 */
export function listenForSearchKey(open: () => void): () => void {
    const listener = (event: KeyboardEvent) => {
        if (shortcutRecording.active) return
        const key = modShortcutKey(event)
        if (!key || shortcutsStore.get(key)?.type !== ShortcutAction.SearchDocumentation) return
        event.preventDefault()
        event.stopPropagation()
        open()
    }
    window.addEventListener('keydown', listener, { capture: true })
    return () => window.removeEventListener('keydown', listener, { capture: true })
}
