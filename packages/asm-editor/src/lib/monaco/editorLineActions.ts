import type { MonacoType } from './Monaco'

/**
 * A command on the line the cursor is on, which an editor offers in its context menu and on a
 * key: "Patch instruction…" on a Listing line. It is offered only where `available` says, which
 * the editor asks again whenever the cursor moves and whenever what `available` reads changes.
 */
export type EditorLineAction = {
    /** Unique among the editor's actions: `asm-editor.patchInstruction`. */
    id: string
    /** As the context menu lists it. */
    label: string
    /** Monaco key codes, modifiers included, that run it. */
    keybindings?: (monaco: MonacoType) => number[]
    /** Whether it applies to a 0-based line now. */
    available: (line: number) => boolean
    run: (line: number) => void
}

/** The context key telling Monaco whether an action is available on the cursor's line. */
export function lineActionContextKey(action: Pick<EditorLineAction, 'id'>): string {
    return `asmEditorLineAction_${action.id.replace(/\W/g, '_')}`
}
