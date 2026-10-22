import type monaco from 'monaco-editor'
import type { MonacoType } from './Monaco'

/**
 * A command on the line the cursor is on, which an editor offers in its context menu and on a
 * key: "Patch instruction…" on a Listing line. It is offered only where `available` says, which
 * the editor asks again whenever the cursor moves and whenever what `available` reads changes.
 * Both are given the cursor's 0-based line and column, the column for a command on the name under
 * the cursor, as Rename… is.
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
    /** Whether it applies to a 0-based line, at a 0-based column, now. */
    available: (line: number, column: number) => boolean
    run: (line: number, column: number) => void
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

/**
 * Back and forward through the navigation history of the pane an editor is in, which it offers
 * while it shows a Listing or a Pseudocode.
 */
export type EditorNavigation = {
    readonly canGoBack: boolean
    readonly canGoForward: boolean
    back: () => void
    forward: () => void
}

/**
 * Go Back and Go Forward ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md),
 * decision 8): on Alt+← and Alt+→, as a browser has them, and first in the context menu's
 * navigation group while there is somewhere to go.
 */
export function navigationActions(navigation: EditorNavigation): EditorLineAction[] {
    return [
        {
            id: 'asm-editor.goBack',
            label: 'Go Back',
            keybindings: (monaco) => [monaco.KeyMod.Alt | monaco.KeyCode.LeftArrow],
            menuGroup: 'navigation',
            menuOrder: 0.1,
            available: () => navigation.canGoBack,
            run: () => navigation.back()
        },
        {
            id: 'asm-editor.goForward',
            label: 'Go Forward',
            keybindings: (monaco) => [monaco.KeyMod.Alt | monaco.KeyCode.RightArrow],
            menuGroup: 'navigation',
            menuOrder: 0.2,
            available: () => navigation.canGoForward,
            run: () => navigation.forward()
        }
    ]
}

/**
 * Breakpoints and Run to Cursor on the lines of the editor's Listing or Pseudocode, where its pane
 * says they apply.
 */
export type EditorDebugging = {
    canToggleBreakpoint: (line: number) => boolean
    toggleBreakpoint: (line: number) => void
    /** Whether Run to Cursor can start from a line now, which needs a Debug session. */
    canRunToCursor: (line: number) => boolean
    runToCursor: (line: number) => void
}

/**
 * Toggle Breakpoint, and Run to Cursor while it can run
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
 * 11): in a group of their own after the navigation, before "Patch instruction…", on F9 and
 * Ctrl+F10 (⌘F10 on a Mac) as Visual Studio has them, which neither the Workbench's shortcuts nor
 * Monaco's take.
 */
export function debuggingActions(debugging: EditorDebugging): EditorLineAction[] {
    return [
        {
            id: 'asm-editor.toggleBreakpoint',
            label: 'Toggle Breakpoint',
            keybindings: (monaco) => [monaco.KeyCode.F9],
            menuGroup: '1_debug',
            menuOrder: 1,
            available: (line) => debugging.canToggleBreakpoint(line),
            run: (line) => debugging.toggleBreakpoint(line)
        },
        {
            id: 'asm-editor.runToCursor',
            label: 'Run to Cursor',
            keybindings: (monaco) => [monaco.KeyMod.CtrlCmd | monaco.KeyCode.F10],
            menuGroup: '1_debug',
            menuOrder: 2,
            available: (line) => debugging.canRunToCursor(line),
            run: (line) => debugging.runToCursor(line)
        }
    ]
}

/**
 * Renaming and commenting in an Executable's own Listing, at the cursor
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 18):
 * a name under the cursor or a label's line takes Rename… and, once renamed, Reset name; a line
 * with an address takes Comment… (a function's label line its function comment), a line inside a
 * function Function comment…, and one with a comment Delete comment. Undo and Redo take back and
 * bring back the last of them, by the File's annotation history (decision 19).
 */
export type EditorAnnotations = {
    canRename: (line: number, column: number) => boolean
    rename: (line: number, column: number) => void
    canResetName: (line: number, column: number) => boolean
    resetName: (line: number, column: number) => void
    canComment: (line: number) => boolean
    comment: (line: number) => void
    canCommentFunction: (line: number) => boolean
    commentFunction: (line: number) => void
    canDeleteComment: (line: number) => boolean
    deleteComment: (line: number) => void
    readonly canUndo: boolean
    undo: () => void
    readonly canRedo: boolean
    redo: () => void
}

/**
 * Rename…, Comment… and the rest, in a group of their own after the debugging one, before "Patch
 * instruction…": Rename… on `n` and F2, Comment… on `;`, as IDA, Binary Ninja and Cutter have `n`
 * and `;` and VS Code F2; Undo on Ctrl+Z and Redo on Ctrl+Shift+Z and Ctrl+Y (⌘ on a Mac). Each
 * key is the editor text's only (`lineActionDescriptor`): a Listing is read-only, so `n` and `;`
 * type nothing there, Monaco's own F2 needs a writable model, and its text Undo has nothing to
 * take back, while the action is offered. Monaco binds `;` by the key a US layout types it with.
 */
export function annotationActions(annotations: EditorAnnotations): EditorLineAction[] {
    const group = '1_edit_annotations'
    return [
        {
            id: 'asm-editor.rename',
            label: 'Rename…',
            keybindings: (monaco) => [monaco.KeyCode.KeyN, monaco.KeyCode.F2],
            menuGroup: group,
            menuOrder: 1,
            available: (line, column) => annotations.canRename(line, column),
            run: (line, column) => annotations.rename(line, column)
        },
        {
            id: 'asm-editor.comment',
            label: 'Comment…',
            keybindings: (monaco) => [monaco.KeyCode.Semicolon],
            menuGroup: group,
            menuOrder: 2,
            available: (line) => annotations.canComment(line),
            run: (line) => annotations.comment(line)
        },
        {
            id: 'asm-editor.functionComment',
            label: 'Function comment…',
            menuGroup: group,
            menuOrder: 3,
            available: (line) => annotations.canCommentFunction(line),
            run: (line) => annotations.commentFunction(line)
        },
        {
            id: 'asm-editor.resetName',
            label: 'Reset name',
            menuGroup: group,
            menuOrder: 4,
            available: (line, column) => annotations.canResetName(line, column),
            run: (line, column) => annotations.resetName(line, column)
        },
        {
            id: 'asm-editor.deleteComment',
            label: 'Delete comment',
            menuGroup: group,
            menuOrder: 5,
            available: (line) => annotations.canDeleteComment(line),
            run: (line) => annotations.deleteComment(line)
        },
        {
            id: 'asm-editor.undoAnnotation',
            label: 'Undo rename or comment',
            keybindings: (monaco) => [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyZ],
            menuGroup: group,
            menuOrder: 6,
            available: () => annotations.canUndo,
            run: () => annotations.undo()
        },
        {
            id: 'asm-editor.redoAnnotation',
            label: 'Redo rename or comment',
            keybindings: (monaco) => [
                monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyZ,
                monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyY
            ],
            menuGroup: group,
            menuOrder: 7,
            available: () => annotations.canRedo,
            run: () => annotations.redo()
        }
    ]
}

/** Where a key goes in the history: Alt+← back and Alt+→ forward, with no other modifier. */
export function navigationKeyStep(
    event: Pick<KeyboardEvent, 'key' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>
): 'back' | 'forward' | undefined {
    if (!event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return undefined
    return event.key === 'ArrowLeft' ? 'back' : event.key === 'ArrowRight' ? 'forward' : undefined
}

/** Where a mouse button goes in the history: the back button (3) and the forward button (4). */
export function navigationButtonStep(
    event: Pick<MouseEvent, 'button'>
): 'back' | 'forward' | undefined {
    return event.button === 3 ? 'back' : event.button === 4 ? 'forward' : undefined
}
