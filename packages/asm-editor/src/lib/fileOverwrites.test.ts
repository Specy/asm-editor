/**
 * A File holds its current bytes
 * ([ADR 0063](../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)):
 * the Hex and Pixel editors overwrite them in place, and the Byte edits a Project saved before
 * that ([ADR 0047](../../../../docs/adr/0047-byte-edits-are-kept-apart-from-the-original-bytes.md))
 * are applied once, as it is read.
 */
import { describe, expect, it } from 'vite-plus/test'
import { readFileSync } from 'node:fs'
import {
    applyByteEdits,
    buildSourcesEqual,
    cleanFiles,
    decodeBase64,
    encodeBase64,
    fileByteLength,
    fileBytes,
    fileHead,
    overwriteBytes,
    ProjectFormatError,
    sameFileContent,
    storedFilesSize,
    FILE_BYTE_LIMIT,
    type ByteEdit,
    type ByteRun,
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
const byteFile = (values: Uint8Array): ProjectFile => ({
    encoding: 'base64',
    content: encodeBase64(values)
})
/** A File as a Project saved before ADR 0063 could keep it, its edits beside its original. */
const legacyFile = (values: Uint8Array, edits: ByteEdit[]) => ({ ...byteFile(values), edits })
const run = (offset: number, ...values: number[]): ByteRun => ({ offset, bytes: bytes(...values) })
/** `file` with `runs` written over it. */
const overwritten = (file: ProjectFile, ...runs: ByteRun[]) => overwriteBytes(file, runs)!.file

function formatError(operation: () => unknown) {
    try {
        operation()
    } catch (error) {
        return error instanceof ProjectFormatError ? error.message : error
    }
    return undefined
}

describe('Byte edits a Project saved before', () => {
    it('apply in order, a later edit winning, and leave the original alone', () => {
        const original = bytes(0, 1, 2, 3, 4, 5)
        const edited = applyByteEdits(original, [edit(1, 9, 9), edit(2, 7), edit(5, 8)])
        expect([...edited]).toEqual([0, 9, 7, 3, 4, 8])
        expect([...original]).toEqual([0, 1, 2, 3, 4, 5])
    })

    it('apply an insertion and a deletion, which the format can express', () => {
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
        expect(formatError(() => applyByteEdits(bytes(1, 2), [edit(1, 5, 5)]))).toBe(
            'A Byte edit is past the end of its File'
        )
    })

    it('are applied as the File is read, which then holds the bytes they leave', () => {
        const annotations = { comments: { '0x1': 'the key' } }
        const clean = cleanFiles({
            'blob.bin': { ...legacyFile(bytes(0xff, 0, 1, 2), [edit(1, 0x41, 0x42)]), annotations },
            'raw.bin': legacyFile(bytes(1), [])
        })
        expect(clean['blob.bin']).toEqual({
            encoding: 'base64',
            content: encodeBase64(bytes(0xff, 0x41, 0x42, 2)),
            annotations
        })
        expect(clean['raw.bin']).toEqual(byteFile(bytes(1)))
        //what was saved after Edit steps, which this editor no longer reads, is dropped
        const stepped = { ...byteFile(bytes(1)), history: { steps: [] } }
        expect(cleanFiles({ a: stepped }).a).toEqual(byteFile(bytes(1)))
    })

    it('are read with an insertion and a deletion', () => {
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
                secret: legacyFile(original, edits) as ProjectFile
            }
        })
        const file = project.files.secret
        expect(file).toEqual(byteFile(new TextEncoder().encode('ter42?')))
        expect(fileByteLength(file)).toBe(6)
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
    ])('are refused when malformed (%#)', (edits, message) => {
        const raw = { 'blob.bin': { encoding: 'base64', content: 'AAAAAA==', edits } }
        expect(String(formatError(() => cleanFiles(raw)))).toContain(message)
    })

    it('are refused on a text File', () => {
        const raw = { 'main.s': { encoding: 'plain', content: 'nop', edits: [edit(0, 0x4e)] } }
        expect(formatError(() => cleanFiles(raw))).toBe(
            'Only a File stored as bytes has Byte edits: main.s'
        )
    })

    it('count the bytes they leave toward the 16 MiB, and no more than 16 MiB put in', () => {
        const half = new Uint8Array(FILE_BYTE_LIMIT / 2)
        const inserting = legacyFile(half, [
            { offset: 0, remove: 0, insert: encodeBase64(new Uint8Array(FILE_BYTE_LIMIT / 2)) }
        ])
        expect(() => cleanFiles({ a: inserting })).not.toThrow()
        expect(formatError(() => cleanFiles({ a: inserting, b: byteFile(bytes(1)) }))).toBe(
            'Project exceeds the 16 MiB file limit'
        )
        const deleting = legacyFile(half, [{ offset: 0, remove: FILE_BYTE_LIMIT / 2, insert: '' }])
        expect(cleanFiles({ a: deleting, b: byteFile(half) }).a).toEqual(byteFile(bytes()))
        //overwrites that put in more than a File holds, as no editor saved
        const piece = encodeBase64(new Uint8Array(FILE_BYTE_LIMIT / 4))
        const rewritten = legacyFile(
            new Uint8Array(FILE_BYTE_LIMIT / 4),
            Array.from({ length: 5 }, () => ({
                offset: 0,
                remove: FILE_BYTE_LIMIT / 4,
                insert: piece
            }))
        )
        expect(formatError(() => cleanFiles({ a: rewritten }))).toBe(
            'Project exceeds the 16 MiB file limit'
        )
        //each 16 MiB File takes a few hundred milliseconds alone, longer beside the whole suite
    }, 30_000)

    it('are refused when their insertions and deletions would copy the File too often', () => {
        //each deletion copies what is left: nine of a 16 MiB File copy more than the limit
        const deletions = Array.from({ length: 9 }, () => ({ offset: 0, remove: 1, insert: '' }))
        const file = legacyFile(new Uint8Array(FILE_BYTE_LIMIT), deletions)
        expect(formatError(() => cleanFiles({ big: file }))).toBe(
            'Too many Byte edits insert or delete in big'
        )
        expect(() =>
            cleanFiles({ big: legacyFile(new Uint8Array(FILE_BYTE_LIMIT), deletions.slice(0, 7)) })
        ).not.toThrow()
        //and counted over the Project, so spreading them over many Files copies no more: nine of
        //each of four 4 MiB Files, each well within the limit alone
        const quarter = () => legacyFile(new Uint8Array(FILE_BYTE_LIMIT / 4), deletions)
        expect(() => cleanFiles({ a: quarter() })).not.toThrow()
        expect(
            formatError(() =>
                cleanFiles({ a: quarter(), b: quarter(), c: quarter(), d: quarter() })
            )
        ).toBe('Too many Byte edits insert or delete in d')
    }, 30_000)
})

describe('overwriting a File', () => {
    it('writes runs in order, a later one winning, and gives back what puts it back', () => {
        const file = byteFile(bytes(0, 1, 2, 3, 4, 5, 6))
        const { file: after, restore } = overwriteBytes(file, [run(1, 9, 9), run(2, 7), run(6, 8)])!
        expect([...fileBytes(after)]).toEqual([0, 9, 7, 3, 4, 5, 8])
        //written in order, the runs that put it back restore the File exactly
        expect(overwritten(after, ...restore)).toEqual(file)
        expect(restore.map((written) => written.offset)).toEqual([6, 2, 1])
    })

    it('keeps the File’s length, encoding and Annotations', () => {
        const annotations = { names: { '0x0': 'start' } }
        const file = cleanFiles({ a: { ...byteFile(bytes(1, 2, 3, 4)), annotations } }).a
        const after = overwritten(file, run(3, 9))
        expect(after).toEqual({
            encoding: 'base64',
            content: encodeBase64(bytes(1, 2, 3, 9)),
            annotations
        })
        expect(Object.isFrozen(after)).toBe(true)
    })

    it('reads as writing over the decoded bytes would, wherever the runs fall', () => {
        let seed = 7
        const next = (limit: number) => {
            seed = (seed * 1103515245 + 12345) % 2 ** 31
            return seed % limit
        }
        for (let trial = 0; trial < 200; trial++) {
            const size = 1 + next(40)
            const original = Uint8Array.from({ length: size }, () => next(256))
            const runs = Array.from({ length: 1 + next(5) }, () => {
                const offset = next(size)
                const length = next(size - offset + 1)
                return { offset, bytes: Uint8Array.from({ length }, () => next(256)) }
            })
            const expected = original.slice()
            for (const written of runs) expected.set(written.bytes, written.offset)
            const { file, restore } = overwriteBytes(byteFile(original), runs)!
            expect(decodeBase64(file.content)).toEqual(expected)
            expect(fileBytes(overwritten(file, ...restore))).toEqual(original)
        }
    })

    it('encodes again only the base64 around the runs of a large File', () => {
        const large = new Uint8Array(1 << 20).map((_, index) => index & 0xff)
        const file = byteFile(large)
        const after = overwritten(file, run(10, 1), run(600_001, 2, 3))
        //the content outside the groups of three bytes the runs touch is as it was
        expect(after.content.slice(0, 12)).toBe(file.content.slice(0, 12))
        expect(after.content.slice(16, 800_000)).toBe(file.content.slice(16, 800_000))
        expect(after.content.slice(800_004)).toBe(file.content.slice(800_004))
        expect(fileHead(after, 12)[10]).toBe(1)
    })

    it('keeps a text File UTF-8, or refuses', () => {
        const text: ProjectFile = { encoding: 'plain', content: 'héllo' }
        const { file, restore } = overwriteBytes(text, [run(0, 0x4a)])!
        expect(file).toEqual({ encoding: 'plain', content: 'Jéllo' })
        expect(overwritten(file, ...restore)).toEqual(text)
        //half of é's two bytes
        expect(overwriteBytes(text, [run(1, 0x41)])).toBeUndefined()
    })

    it('refuses a run past the end, and changes nothing for no run', () => {
        const file = byteFile(bytes(1, 2))
        expect(formatError(() => overwriteBytes(file, [run(1, 1, 2)]))).toBe(
            'An overwrite is past the end of its File'
        )
        expect(formatError(() => overwriteBytes(file, [run(-1, 1)]))).toBe(
            'An overwrite is past the end of its File'
        )
        const { file: same, restore } = overwriteBytes(file, [run(1)])!
        expect(same.content).toBe(file.content)
        expect(restore).toEqual([])
    })

    it('counts toward the limit from stored lengths alone, as cleanFiles counts', () => {
        const files = cleanFiles({
            //one, two, three and four bytes a character: "aé€😀"
            'notes.txt': { encoding: 'plain', content: 'aé€\u{1f600}' },
            blob: byteFile(bytes(1, 2, 3, 4, 5))
        })
        expect(storedFilesSize(files)).toBe(10 + 5)
    })
})

describe('comparing overwritten Files', () => {
    const original = byteFile(bytes(1, 2, 3))
    const edited = overwritten(original, run(0, 9))

    it('tells an overwritten File from the one it was', () => {
        expect(sameFileContent(original, { ...original })).toBe(true)
        expect(sameFileContent(original, edited)).toBe(false)
        expect(sameFileContent(undefined, undefined)).toBe(true)
        expect(sameFileContent(original, undefined)).toBe(false)
        //Annotations are no part of it
        expect(sameFileContent(original, { ...original, annotations: { names: {} } })).toBe(true)
    })

    it('changes Build sources, fingerprints and the Project', () => {
        const sources = (file: ProjectFile) => ({ entry: 'blob', files: { blob: file } })
        expect(buildSourcesEqual(sources(original), sources({ ...original }))).toBe(true)
        expect(buildSourcesEqual(sources(original), sources(edited))).toBe(false)
        expect(fileFingerprint(edited)).not.toBe(fileFingerprint(original))
        expect(fileFingerprint(edited)).toBe(fileFingerprint({ ...edited }))
        const before = makeProject({ language: 'X86', files: { blob: original } }).toObject()
        const after = makeProject({ language: 'X86', files: { blob: edited } }).toObject()
        expect(projectContentEquals(before, after)).toBe(false)
    })
})

describe('an overwritten Executable', () => {
    //relative to the package, where the tests run
    const crackme = new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
    const executable = byteFile(crackme)

    it('is recognised from its bytes', () => {
        expect(startsWithElfMagic(executable)).toBe(true)
        expect(executableKind(executable)).toBe('supported')
        const broken = overwritten(executable, run(1, 0x46))
        expect(startsWithElfMagic(broken)).toBe(false)
        expect(executableKind(broken)).toBe('none')
        //a text File that starts with the magic is still read the same way
        expect(startsWithElfMagic({ encoding: 'plain', content: '\x7fELF' })).toBe(true)
    })

    it('is analysed again when an overwrite changes it', () => {
        const analysis = executableAnalysis(executable)
        expect(executableAnalysis({ ...executable })).toBe(analysis)
        //EI_CLASS 1 is a 32-bit ELF, which the editor cannot run
        const thirtyTwo = overwritten(executable, run(4, 1))
        expect(executableAnalysis(thirtyTwo)).not.toBe(analysis)
        expect(executableKind(thirtyTwo)).not.toBe('supported')
        expect(executableAnalysis(executable)).toBe(analysis)
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
        const edited = overwritten(executable, run(0x2017, 0x58))
        const second = documents.openExecutable('crackme', edited)!
        expect(second).not.toBe(first)
        expect(orders).toHaveLength(2)
        expect(orders[1][0x2017]).toBe(0x58)
        expect(orders[0][0x2017]).toBe(0x68)
    })
})
