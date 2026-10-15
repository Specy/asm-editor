/**
 * Byte edits kept apart from a File's original bytes
 * ([ADR 0047](../../../../docs/adr/0047-byte-edits-are-kept-apart-from-the-original-bytes.md)):
 * applied by every reader, saved beside the original, and part of every content comparison.
 */
import { describe, expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import {
    applyByteEdits,
    buildSourcesEqual,
    cleanFiles,
    encodeBase64,
    fileByteLength,
    fileBytes,
    fileHead,
    fileText,
    mergeOverwrites,
    originalBytes,
    overwritesOnly,
    ProjectFormatError,
    sameFileContent,
    FILE_BYTE_LIMIT,
    type ByteEdit,
    type ProjectFile
} from './projectFiles'
import { fileFingerprint } from './sourceCompilation/fingerprints'
import { executableAnalysis, executableKind, startsWithElfMagic } from './executables'
import { ListingDocuments } from './listing/listingDocuments.svelte'
import type { Listing } from './listing/listing'
import { makeProject, projectContentEquals } from './Project.svelte'

const bytes = (...values: number[]) => Uint8Array.from(values)
const edit = (offset: number, ...values: number[]): ByteEdit => ({
    offset,
    remove: values.length,
    insert: encodeBase64(bytes(...values))
})
const byteFile = (values: Uint8Array, edits?: ByteEdit[]): ProjectFile => ({
    encoding: 'base64',
    content: encodeBase64(values),
    ...(edits ? { edits } : {})
})

function formatError(operation: () => unknown) {
    try {
        operation()
    } catch (error) {
        return error instanceof ProjectFormatError ? error.message : error
    }
    return undefined
}

describe('applying Byte edits', () => {
    it('overwrites in order, a later edit winning, and leaves the original alone', () => {
        const original = bytes(0, 1, 2, 3, 4, 5)
        const edited = applyByteEdits(original, [edit(1, 9, 9), edit(2, 7), edit(5, 8)])
        expect([...edited]).toEqual([0, 9, 7, 3, 4, 8])
        expect([...original]).toEqual([0, 1, 2, 3, 4, 5])
    })

    it('applies an insertion and a deletion, which the format can express', () => {
        const original = bytes(0, 1, 2, 3)
        const inserted = applyByteEdits(original, [
            { offset: 1, remove: 0, insert: encodeBase64(bytes(7, 7)) }
        ])
        expect([...inserted]).toEqual([0, 7, 7, 1, 2, 3])
        //each edit's offset is into the bytes the edits before it left
        const both = applyByteEdits(original, [
            { offset: 1, remove: 0, insert: encodeBase64(bytes(7, 7)) },
            { offset: 3, remove: 2, insert: '' }
        ])
        expect([...both]).toEqual([0, 7, 7, 3])
    })

    it('refuses an edit past the end', () => {
        expect(formatError(() => applyByteEdits(bytes(1, 2), [edit(1, 5, 5)]))).toBe(
            'A Byte edit is past the end of its File'
        )
    })
})

describe('merging overwrites', () => {
    it('folds overlapping and touching edits into sorted runs that read the same', () => {
        const edits = [edit(6, 1), edit(2, 2, 2, 2), edit(3, 5), edit(5, 4), edit(10, 3)]
        const merged = mergeOverwrites(edits)
        expect(merged).toEqual([edit(2, 2, 5, 2, 4, 1), edit(10, 3)])
        const original = new Uint8Array(12)
        expect(applyByteEdits(original, merged)).toEqual(applyByteEdits(original, edits))
    })

    it('keeps a single edit and refuses anything but overwrites', () => {
        expect(mergeOverwrites([edit(4, 1, 2)])).toEqual([edit(4, 1, 2)])
        expect(mergeOverwrites([])).toEqual([])
        expect(formatError(() => mergeOverwrites([{ offset: 0, remove: 1, insert: '' }]))).toBe(
            'Only overwriting Byte edits can be merged'
        )
    })
})

describe('a File with Byte edits', () => {
    const file = byteFile(bytes(0xff, 0, 1, 2), [edit(1, 0x41, 0x42)])

    it('reads as its edited bytes, while its original stays readable', () => {
        expect([...fileBytes(file)]).toEqual([0xff, 0x41, 0x42, 2])
        expect([...originalBytes(file)]).toEqual([0xff, 0, 1, 2])
        expect([...fileHead(file, 2)]).toEqual([0xff, 0x41])
        expect([...fileHead(file, 64)]).toEqual([0xff, 0x41, 0x42, 2])
    })

    it('has no text, even when its edited bytes are valid UTF-8', () => {
        const ascii = byteFile(bytes(0xff, 0x41), [edit(0, 0x48)])
        expect(new TextDecoder().decode(fileBytes(ascii))).toBe('HA')
        expect(formatError(() => fileText(ascii))).toBe('File is not readable UTF-8 text')
        //without edits a byte File's text is still read as before
        expect(fileText(byteFile(bytes(0x48, 0x41)))).toBe('HA')
    })

    it('is saved with its edits, and an empty list is dropped', () => {
        const clean = cleanFiles({ 'blob.bin': file, 'raw.bin': byteFile(bytes(1), []) })
        expect(clean['blob.bin']).toEqual(file)
        expect(Object.isFrozen(clean['blob.bin'].edits)).toBe(true)
        expect(clean['raw.bin']).not.toHaveProperty('edits')
    })

    it.each([
        [[{ offset: 3, remove: 2, insert: encodeBase64(bytes(1, 2)) }], 'past the end'],
        [[{ offset: 5, remove: 0, insert: encodeBase64(bytes(1)) }], 'past the end'],
        //each edit is in range of the length the ones before it leave
        [
            [
                { offset: 0, remove: 2, insert: '' },
                { offset: 2, remove: 1, insert: encodeBase64(bytes(1)) }
            ],
            'past the end'
        ],
        [[{ offset: -1, remove: 1, insert: encodeBase64(bytes(1)) }], 'Invalid Byte edit'],
        [[{ offset: 0.5, remove: 1, insert: encodeBase64(bytes(1)) }], 'Invalid Byte edit'],
        [[{ offset: 0, remove: -1, insert: encodeBase64(bytes(1)) }], 'Invalid Byte edit'],
        [[{ offset: 0, remove: 0, insert: '' }], 'An empty Byte edit'],
        [[{ offset: 0, remove: 1, insert: 'AQ' }], 'Noncanonical'],
        [[{ offset: 0, remove: 1, insert: 'AQ==', note: 'x' }], 'Invalid Byte edit'],
        ['not a list', 'Invalid Byte edits']
    ])('is refused when its edits are malformed (%#)', (edits, message) => {
        const raw = { 'blob.bin': { encoding: 'base64', content: 'AAAAAA==', edits } }
        expect(String(formatError(() => cleanFiles(raw)))).toContain(message)
    })

    it('is read with an insertion and a deletion, which a later version may save', () => {
        //"hunter2" made "ter42?": two insertions, an overwrite of a byte the second put past the
        //original's end, and a deletion
        const original = new TextEncoder().encode('hunter2')
        const edits: ByteEdit[] = [
            { offset: 6, remove: 0, insert: encodeBase64(bytes(0x34)) },
            { offset: 8, remove: 0, insert: encodeBase64(bytes(0x21)) },
            { offset: 8, remove: 1, insert: encodeBase64(bytes(0x3f)) },
            { offset: 0, remove: 3, insert: '' }
        ]
        const project = makeProject({
            language: 'MIPS',
            entry: 'main.s',
            files: {
                'main.s': { encoding: 'plain', content: 'nop' },
                secret: byteFile(original, edits)
            }
        })
        const file = project.files.secret
        expect(file.edits).toEqual(edits)
        expect(new TextDecoder().decode(fileBytes(file))).toBe('ter42?')
        expect(new TextDecoder().decode(fileHead(file, 4))).toBe('ter4')
        expect(fileByteLength(file)).toBe(6)
        expect(overwritesOnly(file)).toBe(false)
        expect(overwritesOnly(byteFile(original, [edit(0, 0x48)]))).toBe(true)
        //what is stored counts: the original, and the bytes the edits put in
        expect(() => cleanFiles({ secret: file })).not.toThrow()
    })

    it('counts an insertion by the bytes it puts in, a deletion by none', () => {
        const half = new Uint8Array(FILE_BYTE_LIMIT / 2)
        const inserting = byteFile(half, [
            { offset: 0, remove: 0, insert: encodeBase64(new Uint8Array(FILE_BYTE_LIMIT / 2)) }
        ])
        expect(() => cleanFiles({ a: inserting })).not.toThrow()
        expect(formatError(() => cleanFiles({ a: inserting, b: byteFile(bytes(1)) }))).toBe(
            'Project exceeds the 16 MiB file limit'
        )
        const deleting = byteFile(half, [{ offset: 0, remove: FILE_BYTE_LIMIT / 2, insert: '' }])
        expect(fileByteLength(deleting)).toBe(0)
        expect(() => cleanFiles({ a: deleting, b: byteFile(half) })).not.toThrow()
    })

    it('is refused when a text File carries edits', () => {
        const raw = { 'main.s': { encoding: 'plain', content: 'nop', edits: [edit(0, 0x4e)] } }
        expect(formatError(() => cleanFiles(raw))).toBe(
            'Only a File stored as bytes has Byte edits: main.s'
        )
    })

    it('counts its original and its edits toward the 16 MiB of Files', () => {
        const half = new Uint8Array(FILE_BYTE_LIMIT / 2)
        const whole = byteFile(half, [
            { offset: 0, remove: 8, insert: encodeBase64(new Uint8Array(8)) }
        ])
        expect(() => cleanFiles({ a: whole })).not.toThrow()
        expect(formatError(() => cleanFiles({ a: whole, b: byteFile(half) }))).toBe(
            'Project exceeds the 16 MiB file limit'
        )
    })
})

describe('comparing Files with Byte edits', () => {
    const original = byteFile(bytes(1, 2, 3))
    const edited = byteFile(bytes(1, 2, 3), [edit(0, 9)])

    it('tells an edited File from its original', () => {
        expect(sameFileContent(original, { ...original })).toBe(true)
        expect(sameFileContent(original, edited)).toBe(false)
        expect(sameFileContent(edited, byteFile(bytes(1, 2, 3), [edit(0, 8)]))).toBe(false)
        expect(sameFileContent(undefined, undefined)).toBe(true)
        expect(sameFileContent(original, undefined)).toBe(false)
    })

    it('changes Build sources, fingerprints and the Project when an edit does', () => {
        const sources = (file: ProjectFile) => ({ entry: 'blob', files: { blob: file } })
        expect(buildSourcesEqual(sources(original), sources({ ...original }))).toBe(true)
        expect(buildSourcesEqual(sources(original), sources(edited))).toBe(false)
        expect(fileFingerprint(edited)).not.toBe(fileFingerprint(original))
        expect(fileFingerprint(edited)).toBe(fileFingerprint({ ...edited }))
        //a File without edits keeps the fingerprint saved Compilation records hold
        expect(fileFingerprint(original)).toBe(
            fileFingerprint({ encoding: 'base64', content: original.content })
        )
        const before = makeProject({ language: 'X86', files: { blob: original } }).toObject()
        const after = makeProject({ language: 'X86', files: { blob: edited } }).toObject()
        expect(projectContentEquals(before, after)).toBe(false)
    })
})

describe('an Executable with Byte edits', () => {
    //relative to the package, where the tests run
    const crackme = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
    const executable = byteFile(crackme)

    it('is recognised from its edited bytes', () => {
        expect(startsWithElfMagic(executable)).toBe(true)
        expect(executableKind(executable)).toBe('supported')
        const broken = byteFile(crackme, [edit(1, 0x46)])
        expect(startsWithElfMagic(broken)).toBe(false)
        expect(executableKind(broken)).toBe('none')
        //a text File that starts with the magic is still read the same way
        expect(startsWithElfMagic({ encoding: 'plain', content: '\x7fELF' })).toBe(true)
    })

    it('is analysed again when an edit changes it', () => {
        const analysis = executableAnalysis(executable)
        expect(executableAnalysis({ ...executable })).toBe(analysis)
        //EI_CLASS 1 is a 32-bit ELF, which the editor cannot run
        const thirtyTwo = byteFile(crackme, [edit(4, 1)])
        expect(executableAnalysis(thirtyTwo)).not.toBe(analysis)
        expect(executableKind(thirtyTwo)).not.toBe('supported')
        //one version of a content is kept: undoing the edit analyses the original again
        expect(executableAnalysis(executable)).toEqual(analysis)
    })

    it('opens a Listing document of its own for each version of its bytes', () => {
        const orders: Uint8Array[] = []
        const documents = new ListingDocuments((order) => {
            orders.push(order.bytes)
            return new Promise<Listing>(() => {})
        })
        const first = documents.openExecutable('crackme', executable)!
        expect(documents.openExecutable('crackme', { ...executable })).toBe(first)
        //the first letter of the password `main` compares with, "hunter2"
        const edited = byteFile(crackme, [edit(0x2017, 0x58)])
        const second = documents.openExecutable('crackme', edited)!
        expect(second).not.toBe(first)
        expect(orders).toHaveLength(2)
        expect(orders[1][0x2017]).toBe(0x58)
        expect(orders[0][0x2017]).toBe(0x68)
    })
})
