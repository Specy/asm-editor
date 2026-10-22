/**
 * The Workbench's Undo and Redo of Annotations, per File
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision 19).
 */
import { describe, expect, it } from 'vite-plus/test'
import { AnnotationHistory, type AnnotationChange } from './annotationHistory'
import { rename, setComment } from './annotations'
import { withAnnotations, type Annotations, type ProjectFile } from '#lib/projectFiles.ts'

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
            const step = history.undo('chall', file)
            if (step) file = named(step.annotations, file)
            return step
        },
        redo() {
            const step = history.redo('chall', file)
            if (step) file = named(step.annotations, file)
            return step
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

    it('keeps its steps over a Byte edit, which keeps the Annotations', () => {
        const run = session()
        run.change(rename(undefined, 0x1139, 'check'), at(0x1139))
        run.file = { ...run.file, edits: [{ offset: 0, remove: 1, insert: 'AA==' }] }
        expect(run.undo()?.annotations).toBeUndefined()
        expect(run.file.edits).toHaveLength(1)
        expect(run.file.annotations).toBeUndefined()
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
        expect(run.history.undo('chall', run.file)).toBeUndefined()
        expect(run.history.undo('moved', run.file)?.annotations).toBeUndefined()
        run.history.move('moved')
        expect(run.history.redo('moved', original)).toBeUndefined()
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
