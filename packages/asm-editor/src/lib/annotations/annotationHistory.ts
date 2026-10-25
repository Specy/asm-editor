import { annotationsKey, type Annotations, type ProjectFile } from '#lib/projectFiles.ts'

/**
 * What one step changed, so that Undo and Redo can show the place and redo only the work it
 * touches (decision 22): a global rename, a line comment or a function comment at a link-time
 * address, or a local rename of variable `id` of the function at `address`.
 */
export type AnnotationChange = Readonly<
    | { kind: 'name' | 'comment' | 'function comment'; address: number }
    | { kind: 'local'; address: number; id: string }
>

/** A File's Annotations as they were on one side of a step, and what the step changed. */
export type AnnotationStep = Readonly<{
    annotations: Annotations | undefined
    change: AnnotationChange
}>

type Stack = {
    /** The File the steps were made on: its content, and its Annotations as the last left them. */
    encoding: ProjectFile['encoding']
    content: string
    key: string
    undo: AnnotationStep[]
    redo: AnnotationStep[]
}

/** How many steps of one File are kept to undo, as the Hex editor keeps. */
const KEPT_STEPS = 1000

/**
 * The Workbench's Undo and Redo of Annotations
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 19), per File, for the Workbench session's lifetime, so that every pane showing the
 * File's Listing or Pseudocode shares them: each rename, reset, comment or deletion is one step,
 * which puts back the whole record the File had before it. Neither instruction Undo nor Monaco's
 * text Undo.
 *
 * A File's stack belongs to its content and to the Annotations its last step left: once the
 * content is replaced (an upload, a program's write), which drops the Annotations, or the
 * Annotations change by another way (instruction Undo of a program's write puts back an older
 * record), the steps no longer fit and the stack starts again. An overwrite of the Hex or Pixel
 * editor keeps it, as it keeps the Annotations: the Workbench tells it of each (`overwritten`).
 *
 * A caller makes a change through `FileSystem.annotate` first and records it once it is made, so
 * that a refused change leaves no step; for Undo and Redo it passes what puts back the step's
 * `annotations`, and the step moves only once that is done, so a refusal leaves the history as it
 * was.
 */
export class AnnotationHistory {
    private readonly stacks = new Map<string, Stack>()

    /** The stack of `path` when `file` is as its last step left it. */
    private fitting(path: string, file: ProjectFile): Stack | undefined {
        const stack = this.stacks.get(path)
        if (
            stack &&
            stack.content === file.content &&
            stack.encoding === file.encoding &&
            stack.key === annotationsKey(file)
        )
            return stack
        return undefined
    }

    private stack(path: string, file: ProjectFile): Stack {
        const stack = this.fitting(path, file)
        if (stack) return stack
        const fresh: Stack = {
            encoding: file.encoding,
            content: file.content,
            key: annotationsKey(file),
            undo: [],
            redo: []
        }
        this.stacks.set(path, fresh)
        return fresh
    }

    /**
     * Called once a change is made: `before` is the File as it was, `after` the Annotations it
     * has now. A change that changed nothing is no step.
     */
    record(
        path: string,
        before: ProjectFile,
        after: Annotations | undefined,
        change: AnnotationChange
    ) {
        const key = annotationsKey({ annotations: after })
        if (key === annotationsKey(before)) return
        const stack = this.stack(path, before)
        stack.undo.push({ annotations: before.annotations, change })
        if (stack.undo.length > KEPT_STEPS) stack.undo.shift()
        stack.redo = []
        stack.key = key
    }

    /**
     * Undoes the last step on `file`, as it is now: `put` puts back the Annotations it had before
     * that step, and the step then moves to Redo, which can put back what `file` has now. Gives
     * the step, with what it changed; undefined when there is nothing to undo. When `put` throws
     * (the FileSystem refuses the record), the history stays as it was and the error goes on.
     */
    undo(
        path: string,
        file: ProjectFile,
        put: (annotations: Annotations | undefined) => void
    ): AnnotationStep | undefined {
        return this.step(path, file, false, put)
    }

    redo(
        path: string,
        file: ProjectFile,
        put: (annotations: Annotations | undefined) => void
    ): AnnotationStep | undefined {
        return this.step(path, file, true, put)
    }

    private step(
        path: string,
        file: ProjectFile,
        redo: boolean,
        put: (annotations: Annotations | undefined) => void
    ): AnnotationStep | undefined {
        const stack = this.stack(path, file)
        const [from, to] = redo ? [stack.redo, stack.undo] : [stack.undo, stack.redo]
        const step = from.at(-1)
        if (!step) return undefined
        put(step.annotations)
        from.pop()
        to.push({ annotations: file.annotations, change: step.change })
        stack.key = annotationsKey(step)
        return step
    }

    /** Whether Undo has a step for `file` as it is now, without starting its stack again. */
    canUndo(path: string, file: ProjectFile): boolean {
        return !!this.fitting(path, file)?.undo.length
    }

    canRedo(path: string, file: ProjectFile): boolean {
        return !!this.fitting(path, file)?.redo.length
    }

    /**
     * Carries a File's steps over a change the Hex or Pixel editor made to its bytes, from `before`
     * to `after`, when the change kept its Annotations, as an overwrite does.
     */
    overwritten(path: string, before: ProjectFile | undefined, after: ProjectFile | undefined) {
        const stack = before && after && this.fitting(path, before)
        if (!stack || annotationsKey(after) !== stack.key) return
        stack.content = after.content
        stack.encoding = after.encoding
    }

    /** Carries a File's history to its new path, or forgets it with its File. */
    move(from: string, to?: string) {
        const stack = this.stacks.get(from)
        this.stacks.delete(from)
        if (stack && to !== undefined) this.stacks.set(to, stack)
    }
}
