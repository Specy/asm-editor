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
        ['BMP', bytes('BM', [0x36, 0, 0, 0]), 'image', 'image/bmp'],
        ['ICO', bytes([0, 0, 1, 0, 1, 0]), 'image', 'image/x-icon'],
        ['CUR', bytes([0, 0, 2, 0, 1, 0]), 'image', 'image/x-icon'],
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
        expect(fileKind(byteFile(head), 'MIPS')).toEqual({ preview, mime })
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
        ['random bytes', bytes([0xde, 0xad, 0xbe, 0xef, 0])]
    ])('leaves %s as bytes', (_name, head) => {
        expect(previewSignature(head)).toBeUndefined()
        expect(fileKind(byteFile(head), 'X86')).toBe('bytes')
    })

    it('reads the bytes as edited, not as stored', () => {
        const file = {
            ...byteFile(bytes('XPDF-1.7')),
            edits: [{ offset: 0, remove: 1, insert: 'JQ==' }]
        }
        expect(fileKind(file, 'RISC-V')).toEqual({ preview: 'pdf', mime: 'application/pdf' })
    })
})

describe('Files that are not previewed', () => {
    //relative to the package, where the tests run
    const crackme = byteFile(
        new Uint8Array(readFileSync('../x86/blink-js/tests/fixtures/elf/crackme'))
    )

    it('makes a supported ELF an Executable in an x86 Project only', () => {
        expect(fileKind(crackme, 'X86')).toBe('executable')
        for (const language of ['MIPS', 'RISC-V', 'RISC-V-64', 'M68K', 'Z80'] as const)
            expect(fileKind(crackme, language)).toBe('bytes')
        //an ELF the editor cannot run, a 32-bit one, is bytes in x86 too
        const thirtyTwo = { ...crackme, edits: [{ offset: 4, remove: 1, insert: 'AQ==' }] }
        expect(fileKind(thirtyTwo, 'X86')).toBe('bytes')
    })

    it('makes a text File text, whatever its first bytes say', () => {
        expect(fileKind({ encoding: 'plain', content: '%PDF-1.7 but text' }, 'X86')).toBe('text')
        expect(fileKind({ encoding: 'plain', content: 'GIF89a' }, 'MIPS')).toBe('text')
        expect(fileKind(bytesFile(new TextEncoder().encode('BM text')), 'MIPS')).toBe('text')
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

    it('opens an Executable on its Listing, with the Hex editor beside it', () => {
        expect(defaultFileView('executable')).toBe('listing')
        expect(fileViewsOf('executable')).toContain('hex')
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
