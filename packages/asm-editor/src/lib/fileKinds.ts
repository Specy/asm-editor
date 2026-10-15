import type { AvailableLanguages } from './Project.svelte'
import { executableKind } from './executables'
import { fileHead, type ProjectFile } from './projectFiles'

/**
 * What a File is, from its bytes and never its name, since forensics files often carry a wrong
 * extension or none ([file-views.md](../../../../docs/design/file-views.md), decisions 1 and 14):
 * text, an **Executable**, a kind the browser can **Preview**, or bytes for the Hex editor.
 */

/** A kind of File the browser shows itself, and the type it is handed as. */
export type FilePreview = Readonly<{ preview: 'image' | 'pdf' | 'audio' | 'video'; mime: string }>
export type ProjectFileKind = 'text' | 'executable' | FilePreview | 'bytes'

/**
 * How much of a File recognition reads: enough for an ISO media file's `ftyp` box with its brands,
 * and for an MP3 without a tag, the next frame header after the first.
 */
const HEAD_LENGTH = 4096

const ascii = (bytes: Uint8Array, offset: number, text: string) =>
    bytes.length >= offset + text.length &&
    Array.from(text).every((character, index) => bytes[offset + index] === character.charCodeAt(0))
const startsWith = (bytes: Uint8Array, ...values: number[]) =>
    bytes.length >= values.length && values.every((value, index) => bytes[index] === value)

const image = (mime: string): FilePreview => ({ preview: 'image', mime })
const audio = (mime: string): FilePreview => ({ preview: 'audio', mime })

/** Layer III bit rates in kbit/s, by bit-rate index: MPEG-1's, then MPEG-2 and 2.5's. */
const MP3_BIT_RATES = [
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320],
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160]
]
const MP3_SAMPLE_RATES = [44100, 48000, 32000]

/**
 * The length of the MPEG-1, 2 or 2.5 Layer III frame whose header is at `offset`, or undefined
 * when there is none: the frame sync, a version, bit rate and sample rate that are not reserved,
 * and Layer III, which is what MP3 is.
 */
function mp3FrameLength(bytes: Uint8Array, offset: number) {
    if (bytes.length < offset + 4) return undefined
    const [sync, header, rates] = [bytes[offset], bytes[offset + 1], bytes[offset + 2]]
    if (sync !== 0xff || (header & 0xe0) !== 0xe0) return undefined
    const version = (header >> 3) & 3
    const layer = (header >> 1) & 3
    const bitRateIndex = rates >> 4
    const sampleRateIndex = (rates >> 2) & 3
    if (version === 1 || layer !== 1 || bitRateIndex === 0 || bitRateIndex === 15) return undefined
    if (sampleRateIndex === 3) return undefined
    const mpeg1 = version === 3
    const bitRate = MP3_BIT_RATES[mpeg1 ? 0 : 1][bitRateIndex] * 1000
    const sampleRate = MP3_SAMPLE_RATES[sampleRateIndex] / (mpeg1 ? 1 : version === 2 ? 2 : 4)
    const padding = (rates >> 1) & 1
    return Math.floor(((mpeg1 ? 144 : 72) * bitRate) / sampleRate) + padding
}

/**
 * An MP3 without an ID3 tag, as the MIME Sniffing standard matches one: a Layer III frame header
 * and another where that frame ends, which rules out most bytes that merely start with `FF`.
 */
function mp3WithoutTag(bytes: Uint8Array) {
    const length = mp3FrameLength(bytes, 0)
    return length !== undefined && mp3FrameLength(bytes, length) !== undefined
}

/**
 * The brands of an ISO base media file (MP4, MOV, AVIF, HEIF): the major brand and the compatible
 * ones its `ftyp` box lists, as far as the box lies within `bytes`.
 */
function isoBrands(bytes: Uint8Array): string[] | undefined {
    if (!ascii(bytes, 4, 'ftyp') || bytes.length < 12) return undefined
    const size = ((bytes[0] << 24) | (bytes[1] << 16) | (bytes[2] << 8) | bytes[3]) >>> 0
    const end = Math.min(bytes.length, size)
    const brand = (offset: number) => String.fromCharCode(...bytes.subarray(offset, offset + 4))
    const brands = [brand(8)]
    for (let offset = 16; offset + 4 <= end; offset += 4) brands.push(brand(offset))
    return brands
}

/** HEIF images, which only Safari shows: bytes elsewhere, so they open in the Hex editor. */
const HEIF_BRANDS = ['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1']
const MPEG4_AUDIO_BRANDS = ['M4A ', 'M4B ', 'M4P ']

/**
 * The previewable kind whose signature `bytes` start with, by the MIME Sniffing standard's
 * patterns where it has them; the type is always the one whose signature matched, so a File is
 * never handed to the browser as something it is not.
 */
export function previewSignature(bytes: Uint8Array): FilePreview | undefined {
    if (startsWith(bytes, 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return image('image/png')
    if (startsWith(bytes, 0xff, 0xd8, 0xff)) return image('image/jpeg')
    if (ascii(bytes, 0, 'GIF87a') || ascii(bytes, 0, 'GIF89a')) return image('image/gif')
    if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WEBP')) return image('image/webp')
    if (ascii(bytes, 0, 'BM')) return image('image/bmp')
    //an ISO media file's box size can read as an icon's header, so its `ftyp` comes first
    const brands = isoBrands(bytes)
    if (brands) {
        if (brands.includes('avif') || brands.includes('avis')) return image('image/avif')
        if (HEIF_BRANDS.includes(brands[0])) return undefined
        if (MPEG4_AUDIO_BRANDS.includes(brands[0])) return audio('audio/mp4')
        return { preview: 'video', mime: brands[0] === 'qt  ' ? 'video/quicktime' : 'video/mp4' }
    }
    if (startsWith(bytes, 0, 0, 1, 0) || startsWith(bytes, 0, 0, 2, 0)) return image('image/x-icon')
    if (
        startsWith(bytes, 0xff, 0x0a) ||
        startsWith(bytes, 0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a)
    )
        return image('image/jxl')
    if (ascii(bytes, 0, '%PDF-')) return { preview: 'pdf', mime: 'application/pdf' }
    if (ascii(bytes, 0, 'ID3') || mp3WithoutTag(bytes)) return audio('audio/mpeg')
    if (ascii(bytes, 0, 'OggS') && bytes[4] === 0) return audio('audio/ogg')
    if (ascii(bytes, 0, 'RIFF') && ascii(bytes, 8, 'WAVE')) return audio('audio/wav')
    if (ascii(bytes, 0, 'fLaC')) return audio('audio/flac')
    if (startsWith(bytes, 0x1a, 0x45, 0xdf, 0xa3)) return { preview: 'video', mime: 'video/webm' }
    return undefined
}

/**
 * What a File is, from its bytes with their Byte edits. An ELF is an Executable only where a Build
 * can run it, in an x86 Project, as `executableKind` decides; anywhere else it is bytes.
 */
export function fileKind(file: ProjectFile, language: AvailableLanguages): ProjectFileKind {
    if (language === 'X86' && executableKind(file) === 'supported') return 'executable'
    if (file.encoding === 'plain') return 'text'
    let head: Uint8Array
    try {
        head = fileHead(file, HEAD_LENGTH)
    } catch {
        return 'bytes'
    }
    return previewSignature(head) ?? 'bytes'
}

export function isPreviewKind(kind: ProjectFileKind | undefined): kind is FilePreview {
    return typeof kind === 'object'
}
