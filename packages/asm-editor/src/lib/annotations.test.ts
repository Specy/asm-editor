/**
 * Annotations kept on an Executable's File record, beside its bytes and Byte edits
 * ([annotations-and-search.md](../../../../docs/design/annotations-and-search.md), decisions 2, 3,
 * 5 and 20): checked and put in order as a saved Project is read, counted toward their own limit,
 * kept by everything that leaves the bytes' addresses where they were, and no part of the content.
 */
import { describe, expect, it } from 'vite-plus/test'
import lzstring from 'lz-string'
import {
    annotationsKey,
    buildSourcesEqual,
    cleanAnnotations,
    cleanFiles,
    encodeBase64,
    listingAnnotationsKey,
    ProjectFormatError,
    sameFileContent,
    storedAnnotationsSize,
    withAnnotations,
    withByteEdits,
    ANNOTATIONS_BYTE_LIMIT,
    type Annotations,
    type ProjectFile
} from './projectFiles'
import { rename, renameLocal, setComment } from './annotations/annotations'
import { fileFingerprint } from './sourceCompilation/fingerprints'
import { makeProject, projectContentEquals } from './Project.svelte'
import { createSharePayload } from './utils'
import { serializer } from './json'

const chall: ProjectFile = {
    encoding: 'base64',
    content: encodeBase64(Uint8Array.of(0x7f, 0x45, 0x4c, 0x46, 0, 1, 2, 3))
}
const annotations: Annotations = {
    names: { '0x1139': 'check', '0x4010': 'flag' },
    comments: { '0x1150': 'compares the password\nwith "hunter2"' },
    functionComments: { '0x1139': 'Checks the flag.' },
    locals: { '0x1139': { 'stack:-0x98': 'password', 'register:0x0:4@+0x8e': 'result' } }
}

function formatError(operation: () => unknown) {
    try {
        operation()
    } catch (error) {
        return error instanceof ProjectFormatError ? error.message : error
    }
    return undefined
}

describe('saved Annotations', () => {
    it('are kept on any File, frozen, without a prototype, keys in address order', () => {
        const clean = cleanFiles({
            chall: { ...chall, annotations },
            'notes.txt': { encoding: 'plain', content: 'notes', annotations: { names: {} } }
        })
        expect(clean.chall.annotations).toEqual(annotations)
        expect(Object.isFrozen(clean.chall.annotations)).toBe(true)
        expect(Object.isFrozen(clean.chall.annotations!.locals!['0x1139'])).toBe(true)
        expect(Object.getPrototypeOf(clean.chall.annotations!.names)).toBe(null)
        //empty maps are dropped, and a record left empty
        expect(clean['notes.txt']).toEqual({ encoding: 'plain', content: 'notes' })
        const unordered = cleanAnnotations('chall', {
            names: { '0x10000': 'c', '0x9': 'a', '0xff': 'b' },
            locals: { '0x20': { z: 'zed', a: 'aye' }, '0x3': { m: 'em' } }
        })
        expect(Object.keys(unordered!.names!)).toEqual(['0x9', '0xff', '0x10000'])
        expect(Object.keys(unordered!.locals!)).toEqual(['0x3', '0x20'])
        expect(Object.keys(unordered!.locals!['0x20'])).toEqual(['a', 'z'])
        expect(cleanAnnotations('chall', { locals: { '0x20': {} } })).toBeUndefined()
        expect(cleanAnnotations('chall', undefined)).toBeUndefined()
    })

    it.each([
        [[], 'Invalid annotations for chall'],
        [null, 'Invalid annotations for chall'],
        ['names', 'Invalid annotations for chall'],
        [{ labels: {} }, 'Invalid annotations for chall'],
        [{ names: [] }, 'Invalid names for chall'],
        [{ names: { '4409': 'check' } }, 'Invalid address of a name in chall: 4409'],
        [{ names: { '0x01139': 'check' } }, 'Invalid address of a name in chall: 0x01139'],
        [{ names: { '0x1A': 'check' } }, 'Invalid address of a name in chall: 0x1A'],
        [{ names: { '0x20000000000000': 'x' } }, 'Invalid address of a name'],
        [{ names: { '0x1139': 3 } }, 'Invalid name in chall at 0x1139: not text'],
        [{ names: { '0x1139': 'my main' } }, 'Invalid name in chall at 0x1139: A name holds'],
        [{ names: { '0x1139': 'rax' } }, 'rax is the name of an x86 register'],
        [{ names: { '0x1139': 'int' } }, 'int is a keyword of C'],
        [{ names: { '0x1139': 'x'.repeat(129) } }, 'at most 128 characters'],
        [{ comments: { '0x1150': '' } }, 'Invalid comment in chall at 0x1150: an empty comment'],
        [{ comments: { '0x1150': ' \n ' } }, 'an empty comment'],
        [{ comments: { '0x1150': 'a\tb' } }, 'A comment cannot hold control characters'],
        [{ comments: { '0x1150': 'x'.repeat(4001) } }, 'at most 4,000 characters'],
        [{ comments: { '0x1150': 'x\n'.repeat(40) + 'x' } }, 'at most 40 lines'],
        [{ functionComments: { '0x1139': null } }, 'Invalid function comment in chall'],
        [{ locals: { '0x1139': 'password' } }, 'Invalid local names for chall at 0x1139'],
        [{ locals: { main: { 'stack:-0x98': 'password' } } }, 'Invalid address of a function'],
        [{ locals: { '0x1139': { '': 'password' } } }, 'Invalid variable id in chall at 0x1139'],
        [{ locals: { '0x1139': { 'stack:\n': 'password' } } }, 'Invalid variable id'],
        [{ locals: { '0x1139': { ['x'.repeat(257)]: 'password' } } }, 'Invalid variable id'],
        [{ locals: { '0x1139': { 'stack:-0x98': 'iVar1' } } }, 'iVar1 reads as a name the'],
        [{ locals: { '0x1139': { 'stack:-0x98': 'local_98' } } }, 'local_98 reads as a name']
    ])('are refused when malformed (%#)', (value, message) => {
        const raw = { chall: { ...chall, annotations: value } }
        expect(String(formatError(() => cleanFiles(raw)))).toContain(message)
    })

    it('take opaque variable ids up to 256 characters, and names that clash later', () => {
        const id = `join(${'register:0x10:4+'.repeat(14)}register:0x0:8):12@+0x2a`
        expect(id.length).toBeLessThanOrEqual(256)
        const clean = cleanAnnotations('chall', {
            locals: { '0x1139': { [id]: 'pair', 'a b': 'spaced', ['x'.repeat(256)]: 'lengthy' } },
            //uniqueness depends on the Listing, which Byte edits change: checked when applied
            names: { '0x1139': 'same', '0x1200': 'same' }
        })
        expect(clean?.locals?.['0x1139'][id]).toBe('pair')
        expect(clean?.names).toEqual({ '0x1139': 'same', '0x1200': 'same' })
    })

    it("count toward the Project's 256 KiB of Annotations, keys and texts in UTF-8", () => {
        const sized = {
            names: { '0x1139': 'check' },
            comments: { '0x1150': 'caf\u00e9 \u{1f600}' }
        }
        //6 + 5, then 6 + 3 + 2 + 1 + 4
        expect(storedAnnotationsSize(cleanFiles({ chall: { ...chall, annotations: sized } }))).toBe(
            11 + 16
        )
        //each comment takes 8 + 4,000 bytes: 66 of them pass 256 KiB, together over two Files
        expect(65 * 4008).toBeLessThanOrEqual(ANNOTATIONS_BYTE_LIMIT)
        expect(66 * 4008).toBeGreaterThan(ANNOTATIONS_BYTE_LIMIT)
        const comments = (count: number) => ({
            comments: Object.fromEntries(
                Array.from({ length: count }, (_, index) => [
                    `0x${(0x100000 + index).toString(16)}`,
                    'x'.repeat(4000)
                ])
            )
        })
        const files = (second: number) => ({
            a: { ...chall, annotations: comments(33) },
            b: { ...chall, annotations: comments(second) }
        })
        expect(storedAnnotationsSize(cleanFiles(files(32)))).toBe(65 * 4008)
        expect(formatError(() => cleanFiles(files(33)))).toBe(
            'Project exceeds the 256 KiB annotation limit'
        )
    })
})

describe('a File with Annotations', () => {
    const annotated = cleanFiles({ chall: { ...chall, annotations } }).chall

    it('keeps them through a Byte edit and the Undo of one', () => {
        const edited = withByteEdits('chall', annotated, [{ offset: 1, remove: 1, insert: 'QQ==' }])
        expect(edited.annotations).toBe(annotated.annotations)
        expect(edited.edits).toHaveLength(1)
        expect(withByteEdits('chall', edited, [])).toEqual(annotated)
    })

    it('takes new ones over the same bytes and Byte edits, checked, or none', () => {
        const edited = withByteEdits('chall', chall, [{ offset: 1, remove: 1, insert: 'QQ==' }])
        const named = withAnnotations('chall', edited, rename(undefined, 0x1139, 'check'))
        expect(named).toEqual({ ...edited, annotations: { names: { '0x1139': 'check' } } })
        expect(Object.isFrozen(named)).toBe(true)
        expect(withAnnotations('chall', named, undefined)).toEqual(edited)
        expect(withAnnotations('chall', named, {})).toEqual(edited)
        expect(formatError(() => withAnnotations('chall', named, { names: { '0x1': 'if' } }))).toBe(
            'Invalid name in chall at 0x1: if is a keyword of C'
        )
    })

    it('has the same content as without them: a Build and its fingerprints ignore them', () => {
        expect(sameFileContent(chall, annotated)).toBe(true)
        expect(fileFingerprint(annotated)).toBe(fileFingerprint(chall))
        const sources = (file: ProjectFile) => ({ entry: 'chall', files: { chall: file } })
        expect(buildSourcesEqual(sources(chall), sources(annotated))).toBe(true)
    })

    it('is a change to the Project, which saving and its unsaved changes see', () => {
        const before = makeProject({ language: 'X86', files: { chall } }).toObject()
        const after = makeProject({ language: 'X86', files: { chall: annotated } }).toObject()
        expect(projectContentEquals(before, after)).toBe(false)
        expect(after.files.chall.annotations).toEqual(annotations)
        //the same Annotations made in another order are the same Project
        let reordered: Annotations | undefined = renameLocal(
            undefined,
            0x1139,
            'register:0x0:4@+0x8e',
            'result'
        )
        reordered = renameLocal(reordered, 0x1139, 'stack:-0x98', 'password')
        reordered = setComment(reordered, 0x1150, annotations.comments!['0x1150'])
        reordered = { ...reordered, functionComments: annotations.functionComments }
        reordered = rename(rename(reordered, 0x4010, 'flag'), 0x1139, 'check')
        const again = makeProject({
            language: 'X86',
            files: { chall: { ...chall, annotations: reordered } }
        }).toObject()
        expect(projectContentEquals(after, again)).toBe(true)
    })

    it('travels in a share link', () => {
        const project = makeProject({
            language: 'X86',
            entry: 'chall',
            files: { chall: annotated }
        })
        const shared = makeProject(
            serializer.parse(
                lzstring.decompressFromEncodedURIComponent(createSharePayload(project))
            )
        )
        expect(shared.files.chall.annotations).toEqual(annotations)
    })
})

describe('the keys of Annotations', () => {
    it('are empty without any, and equal exactly when the Annotations are', () => {
        expect(annotationsKey(chall)).toBe('')
        expect(annotationsKey({ annotations: {} })).toBe('')
        expect(annotationsKey({ annotations: { names: {} } })).toBe('')
        const one = { annotations: rename(rename(undefined, 0x9, 'a'), 0x10, 'b') }
        const other = { annotations: rename(rename(undefined, 0x10, 'b'), 0x9, 'a') }
        expect(annotationsKey(one)).not.toBe('')
        expect(annotationsKey(one)).toBe(annotationsKey(other))
        expect(annotationsKey(one)).not.toBe(
            annotationsKey({ annotations: rename(one.annotations, 0x9, 'c') })
        )
        //a comment and a name with the same text at the same address differ
        expect(annotationsKey({ annotations: { names: { '0x9': 'a' } } })).not.toBe(
            annotationsKey({ annotations: { comments: { '0x9': 'a' } } })
        )
    })

    it("leave a function's local names out of the Listing's", () => {
        const listed = { annotations: setComment(rename(undefined, 0x9, 'a'), 0x10, 'here') }
        const withLocal = {
            annotations: renameLocal(listed.annotations, 0x9, 'stack:-0x8', 'x')
        }
        expect(listingAnnotationsKey(withLocal)).toBe(listingAnnotationsKey(listed))
        expect(annotationsKey(withLocal)).not.toBe(annotationsKey(listed))
        expect(listingAnnotationsKey({ annotations: renameLocal(undefined, 0x9, 'id', 'x') })).toBe(
            ''
        )
        expect(
            listingAnnotationsKey({ annotations: { functionComments: { '0x9': 'f' } } })
        ).not.toBe('')
    })
})
