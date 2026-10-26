/**
 * What one function's decompilation takes of a File's Annotations
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 13
 * to 17).
 */
import { describe, expect, it } from 'vite-plus/test'
import type { Annotations } from '#lib/projectFiles.ts'
import {
    annotationOptions,
    functionAnnotations,
    functionAnnotationsKey,
    isDecompilerVariableId
} from './pseudocodeAnnotations'

const annotations: Annotations = {
    names: { '0x11e9': 'check' },
    comments: {
        '0x1100': 'in _start',
        '0x11e9': 'at the entry',
        '0x1271': 'before strcmp',
        '0x12b0': 'past the end'
    },
    functionComments: { '0x11e9': 'Reads the password', '0x1100': 'The entry point' },
    locals: {
        '0x11e9': { 'stack:-0x98': 'password', 'register:0x0:4@+0x8e': 'result' },
        '0x1100': { 'register:0x10:8@-0x1': 'finish' }
    }
}

describe("a function's Annotations", () => {
    it('are its locals, the comments in its range and its function comment', () => {
        expect(functionAnnotations(annotations, 0x11e9, 0x12b0)).toEqual({
            locals: [
                { id: 'register:0x0:4@+0x8e', name: 'result' },
                { id: 'stack:-0x98', name: 'password' }
            ],
            comments: [
                { address: 0x11e9, text: 'at the entry' },
                { address: 0x1271, text: 'before strcmp' }
            ],
            functionComment: 'Reads the password'
        })
        expect(functionAnnotations(annotations, 0x1100, 0x1130)).toEqual({
            locals: [{ id: 'register:0x10:8@-0x1', name: 'finish' }],
            comments: [{ address: 0x1100, text: 'in _start' }],
            functionComment: 'The entry point'
        })
        expect(functionAnnotations(annotations, 0x1130, 0x1160)).toEqual({
            locals: [],
            comments: []
        })
        //every comment, in address order, from the record's comments sorted once
        expect(functionAnnotations(annotations, 0, 0x10000).comments).toEqual([
            { address: 0x1100, text: 'in _start' },
            { address: 0x11e9, text: 'at the entry' },
            { address: 0x1271, text: 'before strcmp' },
            { address: 0x12b0, text: 'past the end' }
        ])
        expect(functionAnnotations(undefined, 0x11e9, 0x12b0)).toEqual({ locals: [], comments: [] })
    })

    it('key a function by what it has, and leave one without any as it was keyed', () => {
        const none = functionAnnotations({ names: { '0x11e9': 'check' } }, 0x11e9, 0x12b0)
        expect(functionAnnotationsKey(none)).toBe('')
        const own = functionAnnotations(annotations, 0x11e9, 0x12b0)
        expect(functionAnnotationsKey(own)).toBe(JSON.stringify(own))
        //a comment in another function changes nothing of this one
        const elsewhere = functionAnnotations(
            { ...annotations, comments: { ...annotations.comments, '0x1101': 'more' } },
            0x11e9,
            0x12b0
        )
        expect(functionAnnotationsKey(elsewhere)).toBe(functionAnnotationsKey(own))
    })

    it('become the decompiler’s options at the image’s addresses, unplaced comments listed', () => {
        const own = functionAnnotations(annotations, 0x11e9, 0x12b0)
        expect(annotationOptions(own, 0x555555554000)).toEqual({
            locals: own.locals,
            comments: [
                { address: 0x5555555551e9, text: 'at the entry' },
                { address: 0x555555555271, text: 'before strcmp' }
            ],
            unplacedComments: true,
            functionComment: 'Reads the password'
        })
        expect(annotationOptions(functionAnnotations(undefined, 0x11e9, 0x12b0), 0)).toBe(undefined)
        //a function comment alone lists nothing
        expect(
            annotationOptions({ locals: [], comments: [], functionComment: 'Only this' }, 0)
        ).toEqual({ functionComment: 'Only this' })
    })

    it('leave out an id of a shape the decompiler refuses, rather than failing the function', () => {
        for (const id of [
            'stack:-0x98',
            'register:0x0:4@+0x8e',
            'register:0x10:8@-0x1',
            'join(register:0x10:8+register:0x0:8):16@+0x19b',
            'hash:0x3f276f9932@+0x27c'
        ])
            expect(isDecompilerVariableId(id), id).toBe(true)
        for (const id of ['', 'iVar1', 'stack:98', 'hash:0x1', 'register:0x0:4@0x8e'])
            expect(isDecompilerVariableId(id), id).toBe(false)
        expect(
            annotationOptions(
                {
                    locals: [
                        { id: 'iVar1', name: 'result' },
                        { id: 'stack:-0x10', name: 'canary' }
                    ],
                    comments: []
                },
                0
            )
        ).toEqual({ locals: [{ id: 'stack:-0x10', name: 'canary' }] })
    })
})
