/**
 * Reading and writing a File's Annotations, and what a comment may be
 * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decisions 1
 * to 5).
 */
import { describe, expect, it } from 'vite-plus/test'
import {
    addressMap,
    addressOf,
    commentAt,
    fileAddress,
    functionCommentAt,
    localName,
    localsOf,
    rename,
    renameLocal,
    renamed,
    resetLocal,
    resetName,
    setComment,
    setFunctionComment
} from './annotations'
import { commentProblem, normalizeComment } from './comments'
import { functionAnnotations } from '#lib/pseudocode/pseudocodeAnnotations.ts'
import { cleanAnnotations, isFileAddress, type Annotations } from '#lib/projectFiles.ts'

describe('file addresses', () => {
    it('are written in canonical lower-case hex, and read back', () => {
        expect(fileAddress(0x401136)).toBe('0x401136')
        expect(fileAddress(0)).toBe('0x0')
        expect(fileAddress(Number.MAX_SAFE_INTEGER)).toBe('0x1fffffffffffff')
        expect(addressOf('0x401136')).toBe(0x401136)
        expect(addressOf(fileAddress(0x7fffffffe000))).toBe(0x7fffffffe000)
        for (const bad of [-1, 1.5, Number.NaN, 2 ** 53])
            expect(() => fileAddress(bad), String(bad)).toThrow(RangeError)
    })

    it('are only ever one spelling of each address', () => {
        for (const key of ['0x0', '0x1', '0xabc', '0x401136', '0x1fffffffffffff'])
            expect(isFileAddress(key), key).toBe(true)
        for (const key of [
            '0x',
            '0X1',
            '0x01',
            '0x00',
            '0xABC',
            '401136',
            '0x-1',
            ' 0x1',
            '0x1 ',
            '0x20000000000000',
            1
        ])
            expect(isFileAddress(key), String(key)).toBe(false)
        expect(() => addressOf('0x01')).toThrow(RangeError)
    })
})

describe('comments', () => {
    it('are kept with `\\n` line breaks, spaces for tabs and no blank ends', () => {
        expect(normalizeComment('  the password  ')).toBe('  the password')
        expect(normalizeComment('\r\n\nfirst\r\nsecond\rthird\u2028fourth\n\n')).toBe(
            'first\nsecond\nthird\nfourth'
        )
        expect(normalizeComment('a\tb')).toBe('a    b')
        //the person's own breaks stay, blank lines between paragraphs too
        expect(normalizeComment('one\n\n  two')).toBe('one\n\n  two')
        expect(normalizeComment(' \n\t\n ')).toBe('')
    })

    it('hold at most 4,000 characters on 40 lines, and no control character', () => {
        expect(commentProblem('')).toBeUndefined()
        expect(commentProblem('x'.repeat(4000))).toBeUndefined()
        expect(commentProblem('x'.repeat(4001))).toBe(
            'Comments can be up to 4,000 characters long. This one has 4,001.'
        )
        expect(commentProblem(Array(40).fill('line').join('\n'))).toBeUndefined()
        expect(commentProblem(Array(41).fill('line').join('\n'))).toBe(
            'Comments can be up to 40 lines long. This one has 41.'
        )
        for (const control of ['\u0000', '\t', '\r', '\u001b', '\u007f', '\u0085', '\u2028'])
            expect(commentProblem(`a${control}b`), JSON.stringify(control)).toBe(
                'This comment has a hidden control character. Remove it to save.'
            )
        //what normalizing leaves is always one
        expect(commentProblem(normalizeComment('a\tb\r\nc\u2028d'))).toBeUndefined()
        expect(commentProblem('"hunter2" ; the */ password \u00e9 \u{1f600}')).toBeUndefined()
    })
})

describe('reading and writing Annotations', () => {
    it('renames a label and resets it, leaving no record when nothing is left', () => {
        const named = rename(undefined, 0x1139, 'check')
        expect(named).toEqual({ names: { '0x1139': 'check' } })
        expect(renamed(named, 0x1139)).toBe('check')
        expect(renamed(named, 0x113a)).toBeUndefined()
        expect(renamed(undefined, 0x1139)).toBeUndefined()
        const two = rename(named, 0x1200, 'validate')
        expect(rename(two, 0x1139, 'verify')?.names).toEqual({
            '0x1139': 'verify',
            '0x1200': 'validate'
        })
        expect(resetName(two, 0x1139)).toEqual({ names: { '0x1200': 'validate' } })
        expect(resetName(named, 0x1139)).toBeUndefined()
        expect(resetName(undefined, 0x1139)).toBeUndefined()
    })

    it('sets a comment as it is kept, and deletes it when left empty', () => {
        const commented = setComment(undefined, 0x1150, '  the password\r\n')
        expect(commentAt(commented, 0x1150)).toBe('  the password')
        expect(setComment(commented, 0x1150, ' \n ')).toBeUndefined()
        const both = setFunctionComment(commented, 0x1139, 'Checks the flag.')
        expect(functionCommentAt(both, 0x1139)).toBe('Checks the flag.')
        //a line comment and a function comment at one address are kept apart
        expect(commentAt(both, 0x1139)).toBeUndefined()
        expect(setFunctionComment(both, 0x1139, '')).toEqual(commented)
    })

    it("names a function's variables by their ids, apart from every other function's", () => {
        const one = renameLocal(undefined, 0x1139, 'stack:-0x98', 'password')
        const two = renameLocal(one, 0x1139, 'register:0x0:4@+0x8e', 'result')
        const other = renameLocal(two, 0x1200, 'stack:-0x98', 'buffer')
        expect(localsOf(other, 0x1139)).toEqual({
            'stack:-0x98': 'password',
            'register:0x0:4@+0x8e': 'result'
        })
        expect(localName(other, 0x1200, 'stack:-0x98')).toBe('buffer')
        expect(localName(other, 0x1200, 'register:0x0:4@+0x8e')).toBeUndefined()
        expect(localsOf(other, 0x1300)).toEqual({})
        expect(localsOf(undefined, 0x1300)).toEqual({})
        //an id is opaque: one named like a key of Object's is a name like any other
        const odd = renameLocal(undefined, 0x1139, '__proto__', 'odd')
        expect(localName(odd, 0x1139, '__proto__')).toBe('odd')
        expect(localName(odd, 0x1139, 'toString')).toBeUndefined()
        //resetting the last of a function's names drops the function, then the record
        const reset = resetLocal(
            resetLocal(two, 0x1139, 'stack:-0x98'),
            0x1139,
            'register:0x0:4@+0x8e'
        )
        expect(reset).toBeUndefined()
        expect(resetLocal(other, 0x1200, 'stack:-0x98')).toEqual(two)
    })

    it('writes new frozen records and never changes the one it is given', () => {
        const before = rename(setComment(undefined, 0x1150, 'here'), 0x1139, 'check')!
        const copy = structuredClone(before)
        const after = renameLocal(
            setComment(rename(before, 0x1139, 'other'), 0x1150, ''),
            0x1139,
            'stack:-0x8',
            'x'
        )
        expect(before).toEqual(copy)
        expect(Object.isFrozen(after)).toBe(true)
        expect(Object.isFrozen(after?.names)).toBe(true)
        expect(Object.isFrozen(after?.locals)).toBe(true)
        expect(Object.isFrozen(after?.locals?.['0x1139'])).toBe(true)
        expect(after).toEqual({
            names: { '0x1139': 'other' },
            locals: { '0x1139': { 'stack:-0x8': 'x' } }
        })
    })

    it('gives a Listing each kind by address, in address order', () => {
        const annotations = rename(rename(undefined, 0x1200, 'b'), 0x1139, 'a')
        expect([...addressMap(annotations?.names)]).toEqual([
            [0x1139, 'a'],
            [0x1200, 'b']
        ])
        expect(addressMap(undefined).size).toBe(0)
    })

    it("gives a decompilation its function's names, comments and function comment", () => {
        let annotations: Annotations | undefined
        annotations = setComment(annotations, 0x1150, 'compares')
        annotations = setComment(annotations, 0x1139, 'first')
        annotations = setComment(annotations, 0x1200, 'next function')
        annotations = setComment(annotations, 0x1100, 'before')
        annotations = setFunctionComment(annotations, 0x1139, 'Checks the flag.')
        annotations = setFunctionComment(annotations, 0x1200, 'Another.')
        annotations = renameLocal(annotations, 0x1139, 'stack:-0x98', 'password')
        annotations = renameLocal(annotations, 0x1139, 'hash:0x3f27@+0x6c', 'copy')
        annotations = renameLocal(annotations, 0x1200, 'stack:-0x8', 'other')
        expect(functionAnnotations(annotations, 0x1139, 0x1200)).toEqual({
            locals: [
                { id: 'hash:0x3f27@+0x6c', name: 'copy' },
                { id: 'stack:-0x98', name: 'password' }
            ],
            comments: [
                { address: 0x1139, text: 'first' },
                { address: 0x1150, text: 'compares' }
            ],
            functionComment: 'Checks the flag.'
        })
        expect(functionAnnotations(undefined, 0x1139, 0x1200)).toEqual({ locals: [], comments: [] })
    })

    it('makes records a saved Project keeps as they are', () => {
        let annotations: Annotations | undefined
        annotations = rename(annotations, 0x1200, 'validate')
        annotations = rename(annotations, 0x1139, 'check')
        annotations = setComment(annotations, 0x1150, 'compares\nthe password')
        annotations = renameLocal(annotations, 0x1139, 'stack:-0x98', 'password')
        expect(cleanAnnotations('chall', annotations)).toEqual(annotations)
    })
})
