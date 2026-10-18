/**
 * Recognising a File by its first bytes, never its name
 * ([file-views.md](../../../../docs/design/file-views.md), decisions 1, 14 and 16), and the views
 * each kind offers.
 */
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vite-plus/test'
import { fileKind, previewSignature } from './fileKinds'
import { defaultFileView, fileViewsOf, isFileView, resolveFileView } from './fileViews'
import { bytesFile, encodeBase64, type ProjectFile } from './projectFiles'

const ascii = (text: string) => Array.from(text, (character) => character.charCodeAt(0))
const bytes = (...parts: (number | string | number[])[]) =>
    Uint8Array.from(
        parts.flatMap((part) => (typeof part === 'string' ? ascii(part) : part)) as number[]
    )
const byteFile = (values: Uint8Array): ProjectFile => ({
    encoding: 'base64',
    content: encodeBase64(values)
})
/** An ISO media file's first box, `ftyp`, with its major brand and compatible ones. */
const ftyp = (major: string, ...compatible: string[]) => {
    const size = 16 + 4 * compatible.length
    return bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compatible)
}
const le = (value: number, size: 2 | 4) =>
    Array.from({ length: size }, (_, index) => (value >>> (8 * index)) & 0xff)
/**
 * A BMP's file header and the start of a DIB header of `size` bytes, 2×2 at 24 bits per pixel,
 * as Windows writes one: `BITMAPCOREHEADER` (12), `BITMAPINFOHEADER` (40), `BITMAPV5HEADER` (124).
 */
function bmp(size: number) {
    const header = bytes('BM', le(14 + size + 16, 4), [0, 0, 0, 0], le(14 + size, 4), le(size, 4))
    const dib =
        size === 12
            ? [...le(2, 2), ...le(2, 2), ...le(1, 2), ...le(24, 2)]
            : [...le(2, 4), ...le(2, 4), ...le(1, 2), ...le(24, 2), ...new Array(size - 16).fill(0)]
    return bytes([...header], dib)
}
/** An icon (type 1) or a cursor (type 2) holding one 16×16 image, its directory entry complete. */
function icon(type: 1 | 2, reserved = 0, count = 1) {
    return bytes(
        [0, 0, type, 0],
        le(count, 2),
        [16, 16, 0, reserved],
        le(1, 2),
        le(32, 2),
        le(1128, 4),
        le(22, 4)
    )
}
/** Two MPEG-1 Layer III frame headers, 128 kbit/s at 44.1 kHz, 417 bytes apart. */
function mp3Frames() {
    const frames = new Uint8Array(417 + 4)
    frames.set([0xff, 0xfb, 0x90, 0x64])
    frames.set([0xff, 0xfb, 0x90, 0x64], 417)
    return frames
}

describe('the signature table', () => {
    it.each([
        ['PNG', bytes([0x89], 'PNG', [0x0d, 0x0a, 0x1a, 0x0a, 0, 0]), 'image', 'image/png'],
        ['JPEG', bytes([0xff, 0xd8, 0xff, 0xe0]), 'image', 'image/jpeg'],
        ['GIF87a', bytes('GIF87a', [1, 0]), 'image', 'image/gif'],
        ['GIF89a', bytes('GIF89a', [1, 0]), 'image', 'image/gif'],
        ['WebP', bytes('RIFF', [0x24, 0, 0, 0], 'WEBPVP8 '), 'image', 'image/webp'],
        ['BMP with a BITMAPCOREHEADER', bmp(12), 'image', 'image/bmp'],
        ['BMP with a BITMAPINFOHEADER', bmp(40), 'image', 'image/bmp'],
        ['BMP with a BITMAPV5HEADER', bmp(124), 'image', 'image/bmp'],
        ['ICO', icon(1), 'image', 'image/x-icon'],
        ['CUR', icon(2), 'image', 'image/x-icon'],
        ['AVIF', ftyp('avif', 'mif1', 'miaf'), 'image', 'image/avif'],
        ['AVIF in a HEIF box', ftyp('mif1', 'avif'), 'image', 'image/avif'],
        ['AVIF sequence', ftyp('avis', 'msf1'), 'image', 'image/avif'],
        ['JPEG XL codestream', bytes([0xff, 0x0a, 0xfa]), 'image', 'image/jxl'],
        [
            'JPEG XL container',
            bytes([0, 0, 0, 0x0c], 'JXL ', [0x0d, 0x0a, 0x87, 0x0a]),
            'image',
            'image/jxl'
        ],
        ['PDF', bytes('%PDF-1.7\n'), 'pdf', 'application/pdf'],
        ['MP3 with a tag', bytes('ID3', [4, 0, 0]), 'audio', 'audio/mpeg'],
        ['MP3 without a tag', mp3Frames(), 'audio', 'audio/mpeg'],
        ['Ogg', bytes('OggS', [0, 2]), 'audio', 'audio/ogg'],
        ['WAV', bytes('RIFF', [0x24, 0, 0, 0], 'WAVEfmt '), 'audio', 'audio/wav'],
        ['FLAC', bytes('fLaC', [0, 0, 0, 0x22]), 'audio', 'audio/flac'],
        ['M4A', ftyp('M4A ', 'isom'), 'audio', 'audio/mp4'],
        ['MP4', ftyp('isom', 'iso2', 'mp41'), 'video', 'video/mp4'],
        ['MOV', ftyp('qt  '), 'video', 'video/quicktime'],
        ['WebM', bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f]), 'video', 'video/webm']
    ])('recognises %s', (_name, head, preview, mime) => {
        expect(previewSignature(head)).toEqual({ preview, mime })
        //by its bytes alone, whatever the File is called
        expect(fileKind(byteFile(head), 'MIPS', 'notes.md')).toEqual({ preview, mime })
    })

    it.each([
        ['an empty File', bytes()],
        ['a truncated PNG', bytes([0x89], 'PNG', [0x0d, 0x0a])],
        ['a truncated GIF', bytes('GIF8')],
        ['a RIFF of another kind', bytes('RIFF', [0x24, 0, 0, 0], 'AVI ')],
        ['RIFF alone', bytes('RIFF')],
        ['a PDF signature past the start', bytes(' %PDF-1.7')],
        ['an MPEG frame sync without a second frame', bytes([0xff, 0xfb, 0x90, 0x64, 0, 0])],
        ['UTF-16 text', bytes([0xff, 0xfe], 'h', [0], 'i', [0])],
        ['a HEIC image, which only Safari shows', ftyp('heic', 'mif1', 'heic')],
        ['an ftyp box cut short', bytes([0, 0, 0, 0x18], 'ftyp', 'is')],
        ['random bytes', bytes([0xde, 0xad, 0xbe, 0xef, 0])],
        ['BM and no DIB header', bytes('BM', [0x36, 0, 0, 0])],
        ['BM and a DIB header cut short', bmp(40).slice(0, 25)],
        ['BM and a DIB header of no known size', bmp(40).fill(41, 14, 15)],
        ['BM and text', new TextEncoder().encode('BMP is a format Windows uses, and so on')],
        ['an icon header alone', bytes([0, 0, 1, 0, 1, 0])],
        ['an icon cut short', icon(1).slice(0, 21)],
        ['an icon with no image', icon(1, 0, 0)],
        ['a cursor whose directory entry is not reserved', icon(2, 0xff)],
        ['a zero word, a 1 and zeros', bytes([0, 0, 1, 0], new Array(28).fill(0))]
    ])('leaves %s as bytes', (_name, head) => {
        expect(previewSignature(head)).toBeUndefined()
        expect(fileKind(byteFile(head), 'X86', 'a.png')).toBe('bytes')
    })

    it('reads the bytes as edited, not as stored', () => {
        const file = {
            ...byteFile(bytes('XPDF-1.7')),
            edits: [{ offset: 0, remove: 1, insert: 'JQ==' }]
        }
        expect(fileKind(file, 'RISC-V', 'paper')).toEqual({
            preview: 'pdf',
            mime: 'application/pdf'
        })
    })
})

describe('Files that are not previewed', () => {
    //relative to the package, where the tests run
    const crackme = byteFile(
        new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
    )

    it('makes a supported ELF an Executable in an x86 Project only', () => {
        expect(fileKind(crackme, 'X86', 'crackme')).toBe('executable')
        for (const language of ['MIPS', 'RISC-V', 'RISC-V-64', 'M68K', 'Z80'] as const)
            expect(fileKind(crackme, language, 'crackme')).toBe('bytes')
        //an ELF the editor cannot run, a 32-bit one, is bytes in x86 too
        const thirtyTwo = { ...crackme, edits: [{ offset: 4, remove: 1, insert: 'AQ==' }] }
        expect(fileKind(thirtyTwo, 'X86', 'crackme')).toBe('bytes')
    })

    it('makes a text File text, whatever its first bytes say', () => {
        expect(fileKind({ encoding: 'plain', content: 'GIF89a' }, 'MIPS', 'a.gif')).toBe('text')
        expect(fileKind(bytesFile(new TextEncoder().encode('BM text')), 'MIPS', 'a.bmp')).toBe(
            'text'
        )
        expect(
            fileKind({ encoding: 'plain', content: '<svg xmlns="x"></svg>' }, 'X86', 'a.svg')
        ).toBe('text')
        expect(fileKind({ encoding: 'plain', content: ' %PDF-1.7' }, 'X86', 'a.pdf')).toBe('text')
    })

    it('makes a text File named as Markdown Markdown, and only a text File', () => {
        const notes = { encoding: 'plain', content: '# Notes\n' } as const
        for (const path of ['README.md', 'docs/Notes.MARKDOWN'])
            expect(fileKind(notes, 'X86', path)).toBe('markdown')
        for (const path of ['README', 'README.md.asm', 'notes.mdx', '.md'])
            expect(fileKind(notes, 'X86', path)).toBe('text')
        //bytes are what their bytes say, whatever the name
        expect(fileKind(byteFile(bytes([0xde, 0xad, 0xbe, 0xef])), 'MIPS', 'a.md')).toBe('bytes')
    })

    it('makes a PDF written in ASCII alone, which is stored as text, a PDF', () => {
        const pdf = bytesFile(new TextEncoder().encode('%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF\n'))
        expect(pdf.encoding).toBe('plain')
        for (const language of ['X86', 'MIPS'] as const)
            expect(fileKind(pdf, language, 'paper.md')).toEqual({
                preview: 'pdf',
                mime: 'application/pdf'
            })
    })
})

describe('the views of each kind', () => {
    it('opens text as text, bytes in the Hex editor, a Preview kind as its Preview', () => {
        expect(fileViewsOf('text')).toEqual(['text'])
        expect(fileViewsOf('bytes')).toEqual(['hex'])
        expect(fileViewsOf({ preview: 'image', mime: 'image/png' })).toEqual(['preview', 'hex'])
        expect(defaultFileView(undefined)).toBe('text')
        expect(defaultFileView({ preview: 'pdf', mime: 'application/pdf' })).toBe('preview')
    })

    it('opens an Executable in the Hex editor, offering its Listing and its Pseudocode', () => {
        expect(defaultFileView('executable')).toBe('hex')
        //the order the view switch offers them: Hex · Disassemble · Decompile
        expect(fileViewsOf('executable')).toEqual(['hex', 'listing', 'pseudocode'])
    })

    it('opens Markdown as its text, offering its Preview and its bytes', () => {
        //the order the view switch offers them: Text · Preview · Hex
        expect(fileViewsOf('markdown')).toEqual(['text', 'preview', 'hex'])
        expect(resolveFileView('markdown', 'preview')).toBe('preview')
        expect(resolveFileView('markdown', 'listing')).toBe('text')
    })

    it('takes the first view asked for that the kind offers, else its default', () => {
        const image = { preview: 'image', mime: 'image/png' } as const
        expect(resolveFileView(image, 'hex')).toBe('hex')
        expect(resolveFileView(image, 'listing', 'hex')).toBe('hex')
        expect(resolveFileView(image, undefined, undefined)).toBe('preview')
        expect(resolveFileView('text', 'hex')).toBe('text')
        expect(resolveFileView('bytes', 'preview')).toBe('hex')
        expect(isFileView('pseudocode')).toBe(true)
        expect(isFileView('binary')).toBe(false)
    })
})
