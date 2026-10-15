import type monaco from 'monaco-editor'
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
    /**
     * The context menu's group it is listed in, and its place there: the modification group
     * first by default, as "Patch instruction…" is; `navigation` for one that goes elsewhere.
     */
    menuGroup?: string
    menuOrder?: number
    /** Whether it applies to a 0-based line now. */
    available: (line: number) => boolean
    run: (line: number) => void
}

/** The context key telling Monaco whether an action is available on the cursor's line. */
export function lineActionContextKey(action: Pick<EditorLineAction, 'id'>): string {
    return `asmEditorLineAction_${action.id.replace(/\W/g, '_')}`
}

/**
 * The Monaco action a line action is registered as: in the context menu's modification group,
 * enabled where its context key says, and bound to its keys only while the editor's text has the
 * keyboard. Without `editorTextFocus` a key such as Space would also be taken from Monaco's Find
 * widget and command palette, whose inputs are inside the editor: "call strcmp" typed in Find
 * would lose its space and could open the action instead.
 */
export function lineActionDescriptor(
    action: EditorLineAction,
    currentMonaco: MonacoType,
    run: (editor: monaco.editor.ICodeEditor) => void
): monaco.editor.IActionDescriptor {
    return {
        id: action.id,
        label: action.label,
        keybindings: action.keybindings?.(currentMonaco),
        precondition: lineActionContextKey(action),
        keybindingContext: 'editorTextFocus',
        contextMenuGroupId: action.menuGroup ?? '1_modification',
        contextMenuOrder: action.menuOrder ?? 0,
        run
    }
}
