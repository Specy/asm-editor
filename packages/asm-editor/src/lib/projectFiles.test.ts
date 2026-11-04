/**
 * What a change to a Project's Files costs: the Files it leaves are records this module checked
 * already, kept with their byte lengths, so a change costs what the changed File does, not what
 * the Project holds ([ADR 0076](../../../../docs/adr/0076-a-project-holds-64-mib-of-files.md)).
 */
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import {
    bytesFile,
    cleanFiles,
    encodeBase64,
    fileByteLength,
    fileBytes,
    fileText,
    formatMiB,
    normalizeBuildInput,
    overwriteBytes,
    projectFileFromBytes,
    storedFilesSize,
    textFile,
    withAnnotations,
    ANNOTATIONS_BYTE_LIMIT,
    ANNOTATIONS_LIMIT_TEXT,
    ANNOTATIONS_SAVE_MESSAGE,
    FILE_BYTE_LIMIT,
    FILE_COUNT_LIMIT,
    FILE_COUNT_TEXT,
    FILE_LIMIT_MESSAGE,
    ProjectFormatError
} from './projectFiles'

const encoder = new TextEncoder()

afterEach(() => vi.restoreAllMocks())

describe('the Project limit', () => {
    it('is 64 MiB, which every message that states it says', () => {
        expect(FILE_BYTE_LIMIT).toBe(64 * 1024 * 1024)
        expect(formatMiB(FILE_BYTE_LIMIT)).toBe('64 MiB')
        expect(formatMiB(32 * 1024 * 1024)).toBe('32 MiB')
        expect(FILE_LIMIT_MESSAGE).toBe('Project exceeds the 64 MiB file limit')
        //the other limits' messages state them as their constants do
        expect(FILE_COUNT_TEXT).toBe(FILE_COUNT_LIMIT.toLocaleString('en-US'))
        expect(ANNOTATIONS_LIMIT_TEXT).toBe(`${ANNOTATIONS_BYTE_LIMIT / 1024} KiB`)
        expect(ANNOTATIONS_SAVE_MESSAGE).toContain(`(at most ${ANNOTATIONS_LIMIT_TEXT})`)
        const many = Object.fromEntries(
            Array.from({ length: FILE_COUNT_LIMIT + 1 }, (_, index) => [`f${index}`, textFile('')])
        )
        expect(() => cleanFiles(many)).toThrow(`Project exceeds the ${FILE_COUNT_TEXT}-file limit`)
    })

    it('takes a Project of more than 16 MiB, and refuses one past 64 MiB', () => {
        const part = bytesFile(new Uint8Array(16 * 1024 * 1024))
        expect(storedFilesSize(cleanFiles({ a: part, b: part, c: part, d: part }))).toBe(
            FILE_BYTE_LIMIT
        )
        expect(() =>
            cleanFiles({ a: part, b: part, c: part, d: part, e: textFile('one byte more') })
        ).toThrow(FILE_LIMIT_MESSAGE)
    }, 30_000)
})

describe('checked File records', () => {
    const raw = {
        'main.s': { encoding: 'plain', content: 'li a0, 1\n# é 😀\n' },
        'blob.bin': { encoding: 'base64', content: encodeBase64(Uint8Array.of(0xff, 0, 1)) }
    }

    it('returns a map it returned as it is', () => {
        const clean = cleanFiles(raw)
        expect(cleanFiles(clean)).toBe(clean)
        expect(normalizeBuildInput({ files: clean, entry: 'main.s' }).files).toBe(clean)
    })

    it('keeps a record it made wherever it is put, without decoding it again', () => {
        const clean = cleanFiles(raw)
        const atob = vi.spyOn(globalThis, 'atob')
        const next = cleanFiles({ ...clean, 'other/blob.bin': clean['blob.bin'] })
        expect(atob).not.toHaveBeenCalled()
        expect(next['other/blob.bin']).toBe(clean['blob.bin'])
        expect(next['main.s']).toBe(clean['main.s'])
        expect(storedFilesSize(next)).toBe(encoder.encode(raw['main.s'].content).length + 6)
    })

    it('checks a record it did not make, however like one it looks', () => {
        const lookalike = Object.freeze({ encoding: 'plain' as const, content: 'bad \ud800' })
        expect(() => cleanFiles({ 'a.s': lookalike })).toThrow(ProjectFormatError)
        expect(() => cleanFiles({ ...cleanFiles(raw), 'a.s': lookalike })).toThrow(
            ProjectFormatError
        )
    })

    it('counts the bytes of every record, text and binary, as UTF-8 and bytes', () => {
        const text = 'a é € 😀 \u0000 end'
        for (const file of [
            textFile(text),
            bytesFile(encoder.encode(text)),
            projectFileFromBytes(encoder.encode(text), 'base64'),
            cleanFiles({ x: { encoding: 'plain', content: text } }).x,
            //one this module did not make is counted from its content
            { encoding: 'plain' as const, content: text }
        ])
            expect(fileByteLength(file)).toBe(encoder.encode(text).length)
        expect(fileByteLength(textFile('x'.repeat(100_000) + 'é'))).toBe(100_002)
    })

    it('keeps a changed File checked when its change comes from a checked one', () => {
        const clean = cleanFiles(raw)
        const overwritten = overwriteBytes(clean['blob.bin'], [
            { offset: 1, bytes: Uint8Array.of(7) }
        ])!.file
        const annotated = withAnnotations('blob.bin', overwritten, {
            names: { '0x0': 'start' }
        })
        const atob = vi.spyOn(globalThis, 'atob')
        cleanFiles({ a: overwritten, b: annotated })
        expect(atob).not.toHaveBeenCalled()
        expect(fileByteLength(annotated)).toBe(3)
    })
})

describe('text typed into the editor', () => {
    it('is stored as text without being encoded, as the bytes it was would be', () => {
        const text = 'loop: j loop\n# ünïcode 😀\n'
        const encode = vi.spyOn(TextEncoder.prototype, 'encode')
        const file = textFile(text)
        expect(encode).not.toHaveBeenCalled()
        encode.mockRestore()
        expect(file).toEqual(bytesFile(encoder.encode(text)))
        expect(Object.isFrozen(file)).toBe(true)
        expect(fileText(file)).toBe(text)
        expect([...fileBytes(file)]).toEqual([...encoder.encode(text)])
    })

    it('refuses an unpaired surrogate, which no UTF-8 holds', () => {
        expect(() => textFile('half \ud83d of a pair')).toThrow('unpaired surrogate')
    })

    it('stores text that starts like a BMP as bytes, as bytesFile does', () => {
        //`BM`, then a BITMAPINFOHEADER's size, 40, little-endian at offset 14
        const header = Uint8Array.from({ length: 30 }, (_, index) =>
            index === 0
                ? 0x42
                : index === 1
                  ? 0x4d
                  : index === 14
                    ? 40
                    : index < 18 && index > 14
                      ? 0
                      : 0x20
        )
        const text = new TextDecoder().decode(header)
        expect(textFile(text)).toEqual(bytesFile(header))
        expect(textFile(text).encoding).toBe('base64')
    })
})
