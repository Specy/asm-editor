/**
 * The Workbench's Undo and Redo of Annotations, per File
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 19).
 */
import { describe, expect, it } from 'vite-plus/test'
import { AnnotationHistory, type AnnotationChange } from './annotationHistory'
import { rename, setComment } from './annotations'
import {
    overwriteBytes,
    withAnnotations,
    type Annotations,
    type ProjectFile
} from '#lib/projectFiles.ts'

const original: ProjectFile = { encoding: 'base64', content: 'f0VMRgIBAQA=' }
const named = (annotations: Annotations | undefined, file = original) =>
    withAnnotations('chall', file, annotations)
const at = (address: number): AnnotationChange => ({ kind: 'name', address })

/** A File's changes as the Workbench makes them: annotate, then record. */
function session() {
    const history = new AnnotationHistory()
    let file = original
    return {
        history,
        get file() {
            return file
        },
        set file(next: ProjectFile) {
            file = next
        },
        change(annotations: Annotations | undefined, change: AnnotationChange) {
            const before = file
            file = named(annotations, file)
            history.record('chall', before, annotations, change)
        },
        undo() {
            return history.undo('chall', file, (annotations) => (file = named(annotations, file)))
        },
        redo() {
            return history.redo('chall', file, (annotations) => (file = named(annotations, file)))
        }
    }
}

describe('the annotation history', () => {
    it('puts back the whole record before each step, and again after, with what changed', () => {
        const run = session()
        const first = rename(undefined, 0x1139, 'check')
        const second = setComment(first, 0x1150, 'the password')
        run.change(first, at(0x1139))
        run.change(second, { kind: 'comment', address: 0x1150 })
        expect(run.history.canUndo('chall', run.file)).toBe(true)
        expect(run.history.canRedo('chall', run.file)).toBe(false)
        expect(run.undo()).toEqual({
            annotations: first,
            change: { kind: 'comment', address: 0x1150 }
        })
        expect(run.file.annotations).toEqual(first)
        expect(run.undo()).toEqual({ annotations: undefined, change: at(0x1139) })
        expect(run.file).toEqual(original)
        expect(run.undo()).toBeUndefined()
        expect(run.history.canUndo('chall', run.file)).toBe(false)
        expect(run.redo()).toEqual({ annotations: first, change: at(0x1139) })
        expect(run.redo()?.annotations).toEqual(second)
        expect(run.file.annotations).toEqual(second)
        expect(run.redo()).toBeUndefined()
    })

    it('forgets what can be redone at a new step, and keeps none for no change', () => {
        const run = session()
        run.change(rename(undefined, 0x1139, 'check'), at(0x1139))
        run.undo()
        run.change(rename(undefined, 0x1200, 'other'), at(0x1200))
        expect(run.redo()).toBeUndefined()
        //renaming to the name it has is no step
        run.change(run.file.annotations, at(0x1200))
        expect(run.undo()?.annotations).toBeUndefined()
        expect(run.undo()).toBeUndefined()
    })

    it('keeps its steps over an overwrite, which keeps the Annotations', () => {
        const run = session()
        run.change(rename(undefined, 0x1139, 'check'), at(0x1139))
        const before = run.file
        const overwritten = overwriteBytes(before, [{ offset: 0, bytes: Uint8Array.of(0) }])!
        run.file = overwritten.file
        //as the Workbench tells it of each
        run.history.overwritten('chall', before, run.file)
        expect(run.undo()?.annotations).toBeUndefined()
        expect(run.file.content).toBe(overwritten.file.content)
        expect(run.file.annotations).toBeUndefined()
        //a change the history was not told of still starts it again
        run.change(rename(undefined, 0x1139, 'check'), at(0x1139))
        run.file = overwriteBytes(run.file, [{ offset: 0, bytes: Uint8Array.of(1) }])!.file
        expect(run.undo()).toBeUndefined()
    })

    it('starts again over a new content, which dropped the Annotations', () => {
        const run = session()
        run.change(rename(undefined, 0x1139, 'check'), at(0x1139))
        run.change(rename(run.file.annotations, 0x1200, 'other'), at(0x1200))
        run.undo()
        //an upload over the File: a new original without Annotations
        run.file = { encoding: 'base64', content: 'AAAA' }
        expect(run.history.canUndo('chall', run.file)).toBe(false)
        expect(run.undo()).toBeUndefined()
        expect(run.redo()).toBeUndefined()
        //and a step on the new content is the first of its stack
        run.change(rename(undefined, 0x1300, 'fresh'), at(0x1300))
        expect(run.undo()?.annotations).toBeUndefined()
        expect(run.undo()).toBeUndefined()
    })

    it('starts again when the Annotations changed another way', () => {
        const run = session()
        run.change(rename(undefined, 0x1139, 'check'), at(0x1139))
        run.change(rename(run.file.annotations, 0x1200, 'other'), at(0x1200))
        //instruction Undo of a program's write put back an older record
        run.file = named(rename(undefined, 0x1300, 'older'))
        expect(run.undo()).toBeUndefined()
        expect(run.file.annotations).toEqual({ names: { '0x1300': 'older' } })
    })

    it('follows a renamed File and forgets a deleted one', () => {
        const run = session()
        run.change(rename(undefined, 0x1139, 'check'), at(0x1139))
        run.history.move('chall', 'moved')
        const put = () => {}
        expect(run.history.undo('chall', run.file, put)).toBeUndefined()
        expect(run.history.undo('moved', run.file, put)?.annotations).toBeUndefined()
        run.history.move('moved')
        expect(run.history.redo('moved', original, put)).toBeUndefined()
    })

    it('keeps a step the File refuses to take back, to undo or redo again', () => {
        const run = session()
        const first = rename(undefined, 0x1139, 'check')
        const second = setComment(first, 0x1150, 'the password')
        run.change(first, at(0x1139))
        run.change(second, { kind: 'comment', address: 0x1150 })
        const refuse = () => {
            throw new Error(
                'This Project could not be saved, as it contains too many renames and comments (at most 256 KiB). Delete some and try again.'
            )
        }
        expect(() => run.history.undo('chall', run.file, refuse)).toThrow('256 KiB')
        //nothing moved: the File still fits its stack, and the same step is undone next
        expect(run.history.canUndo('chall', run.file)).toBe(true)
        expect(run.history.canRedo('chall', run.file)).toBe(false)
        expect(run.undo()?.annotations).toEqual(first)
        expect(() => run.history.redo('chall', run.file, refuse)).toThrow('256 KiB')
        expect(run.history.canRedo('chall', run.file)).toBe(true)
        expect(run.redo()?.annotations).toEqual(second)
        expect(run.file.annotations).toEqual(second)
        expect(run.undo()?.annotations).toEqual(first)
        expect(run.undo()?.annotations).toBeUndefined()
    })

    it('keeps the last thousand steps of a File', () => {
        const run = session()
        for (let index = 0; index < 1005; index++)
            run.change(rename(run.file.annotations, 0x1139, `name${index}`), at(0x1139))
        let steps = 0
        while (run.undo()) steps++
        expect(steps).toBe(1000)
        expect(run.file.annotations).toEqual({ names: { '0x1139': 'name4' } })
    })
})
