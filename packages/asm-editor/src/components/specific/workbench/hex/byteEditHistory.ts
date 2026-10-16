import type { ByteEdit, ProjectFile } from '#lib/projectFiles.ts'

/** A File's Byte edits as they were before a change, and the offset the change started at. */
export type ByteEditStep = Readonly<{ edits: readonly ByteEdit[]; offset: number }>

type Stack = { content: string; undo: ByteEditStep[]; redo: ByteEditStep[] }

/** How many changes of one File are kept to undo. */
const KEPT_STEPS = 1000

/**
 * The Hex editor's Undo and Redo, per File: the Byte edits it had before each change, kept for the
 * Workbench session's lifetime as Monaco keeps a model's text history, so that every pane showing
 * the File shares them. A File's stack belongs to the original its edits were made over: once its
 * content is replaced, by an upload or a program's write, the lists no longer fit it and the stack
 * starts again.
 */
export class ByteEditHistory {
    private readonly stacks = new Map<string, Stack>()

    private stack(path: string, file: ProjectFile): Stack {
        let stack = this.stacks.get(path)
        if (!stack || stack.content !== file.content) {
            stack = { content: file.content, undo: [], redo: [] }
            this.stacks.set(path, stack)
        }
        return stack
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

    /** Carries a File's history to its new path, or forgets it with its File. */
    move(from: string, to?: string) {
        const stack = this.stacks.get(from)
        this.stacks.delete(from)
        if (stack && to !== undefined) this.stacks.set(to, stack)
    }
}
