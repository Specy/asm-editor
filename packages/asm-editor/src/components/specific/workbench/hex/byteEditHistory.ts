import type { ByteEdit, ProjectFile } from '#lib/projectFiles.ts'

/** A File's Byte edits as they were before a change, and the offset the change started at. */
export type ByteEditStep = Readonly<{ edits: readonly ByteEdit[]; offset: number }>

/**
 * A change to a File stored as text, whose bytes are its UTF-8 and which keeps no Byte edits: the
 * bytes from `offset` before and after it, so that Undo writes the first back and Redo the second.
 */
export type TextOverwrite = Readonly<{ offset: number; before: Uint8Array; after: Uint8Array }>

type Stack =
    | { kind: 'bytes'; content: string; undo: ByteEditStep[]; redo: ByteEditStep[] }
    | { kind: 'text'; undo: TextOverwrite[]; redo: TextOverwrite[] }

/** How many changes of one File are kept to undo. */
const KEPT_STEPS = 1000

/** Whether `bytes` hold `expected` from `offset`. */
function holds(bytes: Uint8Array, offset: number, expected: Uint8Array): boolean {
    if (offset + expected.length > bytes.length) return false
    return expected.every((byte, index) => bytes[offset + index] === byte)
}

/**
 * The Hex editor's Undo and Redo, per File: the Byte edits it had before each change, kept for the
 * Workbench session's lifetime as Monaco keeps a model's text history, so that every pane showing
 * the File shares them. A File's stack belongs to the original its edits were made over: once its
 * content is replaced, by an upload or a program's write, the lists no longer fit it and the stack
 * starts again. A File stored as text has no edits to put back, so its stack keeps the bytes each
 * change wrote over, written back for as long as the text still holds what the change wrote:
 * typing into its Text view that moves those bytes or writes over them starts the stack again.
 */
export class ByteEditHistory {
    private readonly stacks = new Map<string, Stack>()

    private stack(path: string, file: ProjectFile): Extract<Stack, { kind: 'bytes' }> {
        const stack = this.stacks.get(path)
        if (stack?.kind === 'bytes' && stack.content === file.content) return stack
        const fresh = { kind: 'bytes' as const, content: file.content, undo: [], redo: [] }
        this.stacks.set(path, fresh)
        return fresh
    }

    private textStack(path: string): Extract<Stack, { kind: 'text' }> {
        const stack = this.stacks.get(path)
        if (stack?.kind === 'text') return stack
        const fresh = { kind: 'text' as const, undo: [], redo: [] }
        this.stacks.set(path, fresh)
        return fresh
    }

    /** Called before a change starting at `offset`, with the File as it still is. */
    record(path: string, file: ProjectFile, offset: number) {
        const stack = this.stack(path, file)
        stack.undo.push({ edits: file.edits ?? [], offset })
        if (stack.undo.length > KEPT_STEPS) stack.undo.shift()
        stack.redo = []
    }

    /** The edits to put back to undo the last change, which Redo can then put back again. */
    undo(path: string, file: ProjectFile): ByteEditStep | undefined {
        const stack = this.stack(path, file)
        const step = stack.undo.pop()
        if (step) stack.redo.push({ edits: file.edits ?? [], offset: step.offset })
        return step
    }

    redo(path: string, file: ProjectFile): ByteEditStep | undefined {
        const stack = this.stack(path, file)
        const step = stack.redo.pop()
        if (step) stack.undo.push({ edits: file.edits ?? [], offset: step.offset })
        return step
    }

    /** Called once a change to a File stored as text is made. */
    recordText(path: string, change: TextOverwrite) {
        const stack = this.textStack(path)
        stack.undo.push(change)
        if (stack.undo.length > KEPT_STEPS) stack.undo.shift()
        stack.redo = []
    }

    /**
     * The last change to a text File, whose `before` writes it back, when the File's `bytes` still
     * hold what it wrote; Redo can then write its `after` again.
     */
    undoText(path: string, bytes: Uint8Array): TextOverwrite | undefined {
        return this.stepText(path, bytes, false)
    }

    redoText(path: string, bytes: Uint8Array): TextOverwrite | undefined {
        return this.stepText(path, bytes, true)
    }

    private stepText(path: string, bytes: Uint8Array, redo: boolean): TextOverwrite | undefined {
        const stack = this.textStack(path)
        const [from, to] = redo ? [stack.redo, stack.undo] : [stack.undo, stack.redo]
        const step = from.at(-1)
        if (!step) return undefined
        //the text changed under the change since, and no step of the stack fits it any more
        if (!holds(bytes, step.offset, redo ? step.before : step.after)) {
            this.stacks.delete(path)
            return undefined
        }
        from.pop()
        to.push(step)
        return step
    }

    /** Carries a File's history to its new path, or forgets it with its File. */
    move(from: string, to?: string) {
        const stack = this.stacks.get(from)
        this.stacks.delete(from)
        if (stack && to !== undefined) this.stacks.set(to, stack)
    }
}
