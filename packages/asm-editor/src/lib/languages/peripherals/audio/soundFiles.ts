/**
 * What a File holds as far as the **Audio** Peripheral is concerned, read from its headers alone
 * ([the design record](../../../../../../../docs/design/audio.md#easy68ks-files-and-answers)). Whether
 * a File is playable is decided here and never by the browser, so a Testcase, which decodes nothing,
 * answers exactly as an interactive run does, and the length the standard player is busy for comes
 * from the same place in both.
 *
 * Playable means what every browser decodes: a RIFF/WAVE of integer PCM at 8, 16, 24 or 32 bits or
 * of 32-bit float, plain or in the extensible header, and a Standard MIDI File. Anything else is
 * unplayable, named so the Log can say what it was.
 */

export type SoundFileInfo =
    | { kind: 'wav'; lengthMs: number }
    | { kind: 'midi'; lengthMs: number }
    | { kind: 'unplayable'; format: string }

const WAVE_FORMAT_PCM = 0x0001
const WAVE_FORMAT_IEEE_FLOAT = 0x0003
const WAVE_FORMAT_EXTENSIBLE = 0xfffe

/** A few formats a WAV can hold that browsers do not decode, named for the Log. */
const WAVE_FORMAT_NAMES: Record<number, string> = {
    0x0002: 'Microsoft ADPCM',
    0x0006: 'A-law',
    0x0007: 'μ-law',
    0x0011: 'IMA ADPCM',
    0x0031: 'GSM 6.10',
    0x0050: 'MPEG',
    0x0055: 'MP3'
}

/** The default MIDI tempo, 120 quarter notes a minute, in microseconds a quarter note. */
const DEFAULT_TEMPO = 500_000

export function inspectSoundFile(bytes: Uint8Array): SoundFileInfo {
    if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'WAVE')) return inspectWav(bytes)
    if (startsWith(bytes, 0, 'MThd')) return inspectMidi(bytes)
    if (startsWith(bytes, 0, 'ID3') || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)) {
        return { kind: 'unplayable', format: 'an MP3 file' }
    }
    if (startsWith(bytes, 0, 'OggS')) return { kind: 'unplayable', format: 'an Ogg file' }
    if (startsWith(bytes, 0, 'RIFF') && startsWith(bytes, 8, 'DMSG')) {
        return { kind: 'unplayable', format: 'a DirectMusic segment' }
    }
    return { kind: 'unplayable', format: 'neither a WAV nor a MIDI File' }
}

function inspectWav(bytes: Uint8Array): SoundFileInfo {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    let format: { tag: number; byteRate: number; bits: number } | null = null
    let dataBytes: number | null = null
    let offset = 12
    while (offset + 8 <= bytes.length) {
        const size = view.getUint32(offset + 4, true)
        const body = offset + 8
        if (startsWith(bytes, offset, 'fmt ') && size >= 16 && body + 16 <= bytes.length) {
            let tag = view.getUint16(body, true)
            const channels = view.getUint16(body + 2, true)
            const sampleRate = view.getUint32(body + 4, true)
            const blockAlign = view.getUint16(body + 12, true)
            const bits = view.getUint16(body + 14, true)
            //the extensible header keeps the real format in the first two bytes of its sub-format GUID
            if (tag === WAVE_FORMAT_EXTENSIBLE && size >= 40 && body + 26 <= bytes.length) {
                tag = view.getUint16(body + 24, true)
            }
            if (channels === 0 || sampleRate === 0 || blockAlign === 0) {
                return { kind: 'unplayable', format: 'a WAV with an invalid format header' }
            }
            format = { tag, byteRate: sampleRate * blockAlign, bits }
        } else if (startsWith(bytes, offset, 'data')) {
            //a truncated File claims more than it holds: what is there is what plays
            dataBytes = Math.min(size, bytes.length - body)
        }
        offset = body + size + (size % 2)
    }
    if (format === null) return { kind: 'unplayable', format: 'a WAV without a format header' }
    const playable =
        (format.tag === WAVE_FORMAT_PCM && [8, 16, 24, 32].includes(format.bits)) ||
        (format.tag === WAVE_FORMAT_IEEE_FLOAT && format.bits === 32)
    if (!playable) {
        const kind =
            format.tag === WAVE_FORMAT_PCM || format.tag === WAVE_FORMAT_IEEE_FLOAT
                ? `of ${format.bits}-bit ${format.tag === WAVE_FORMAT_PCM ? 'PCM' : 'float'} samples`
                : WAVE_FORMAT_NAMES[format.tag] !== undefined
                  ? `in the ${WAVE_FORMAT_NAMES[format.tag]} format`
                  : `in format 0x${format.tag.toString(16).padStart(4, '0')}`
        return { kind: 'unplayable', format: `a WAV ${kind}` }
    }
    if (dataBytes === null) return { kind: 'unplayable', format: 'a WAV without sound data' }
    return { kind: 'wav', lengthMs: (dataBytes / format.byteRate) * 1000 }
}

function inspectMidi(bytes: Uint8Array): SoundFileInfo {
    const damaged: SoundFileInfo = { kind: 'unplayable', format: 'a damaged MIDI File' }
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    if (bytes.length < 14 || view.getUint32(4) < 6) return damaged
    const trackCount = view.getUint16(10)
    const division = view.getUint16(12)
    if (trackCount === 0 || division === 0) return damaged
    //tempo changes from every track, by tick, and the tick the last event of any track lands on
    const tempos: [tick: number, microseconds: number][] = []
    let endTick = 0
    let offset = 8 + view.getUint32(4)
    for (let found = 0; found < trackCount;) {
        if (offset + 8 > bytes.length) return damaged
        const size = view.getUint32(offset + 4)
        const end = offset + 8 + size
        if (end > bytes.length) return damaged
        if (startsWith(bytes, offset, 'MTrk')) {
            const last = readTrack(bytes, offset + 8, end, tempos)
            if (last === null) return damaged
            endTick = Math.max(endTick, last)
            found++
        }
        offset = end
    }
    return { kind: 'midi', lengthMs: ticksToMs(endTick, division, tempos) }
}

/** Walks one track's events, collecting its tempo changes; null when the track is malformed. */
function readTrack(
    bytes: Uint8Array,
    start: number,
    end: number,
    tempos: [number, number][]
): number | null {
    let offset = start
    let tick = 0
    let status = 0
    const quantity = (): number | null => {
        let value = 0
        for (let i = 0; i < 4; i++) {
            if (offset >= end) return null
            const byte = bytes[offset++]
            value = (value << 7) | (byte & 0x7f)
            if ((byte & 0x80) === 0) return value
        }
        return null
    }
    while (offset < end) {
        const delta = quantity()
        if (delta === null) return null
        tick += delta
        if (offset >= end) return null
        let byte = bytes[offset]
        if (byte & 0x80) {
            offset++
        } else if (status === 0) {
            return null
        } else {
            byte = status //running status: the byte read is the first data byte
        }
        if (byte === 0xff) {
            const type = bytes[offset++]
            const length = quantity()
            if (length === null || offset + length > end) return null
            if (type === 0x51 && length === 3) {
                tempos.push([
                    tick,
                    (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2]
                ])
            }
            offset += length
            if (type === 0x2f) return tick
        } else if (byte === 0xf0 || byte === 0xf7) {
            const length = quantity()
            if (length === null || offset + length > end) return null
            offset += length
        } else if (byte >= 0x80 && byte < 0xf0) {
            status = byte
            offset += (byte & 0xf0) === 0xc0 || (byte & 0xf0) === 0xd0 ? 1 : 2
        } else {
            return null
        }
    }
    return offset === end ? tick : null
}

function ticksToMs(endTick: number, division: number, tempos: [number, number][]): number {
    if (division & 0x8000) {
        //SMPTE: frames a second in the high byte, two's complement, and ticks a frame in the low
        const framesPerSecond = -((division >> 8) - 256)
        return (endTick / (framesPerSecond * (division & 0xff))) * 1000
    }
    tempos.sort((a, b) => a[0] - b[0])
    let ms = 0
    let tick = 0
    let tempo = DEFAULT_TEMPO
    for (const [at, microseconds] of tempos) {
        if (at >= endTick) break
        ms += ((at - tick) * tempo) / division / 1000
        tick = at
        tempo = microseconds
    }
    return ms + ((endTick - tick) * tempo) / division / 1000
}

function startsWith(bytes: Uint8Array, offset: number, text: string): boolean {
    if (offset + text.length > bytes.length) return false
    for (let i = 0; i < text.length; i++) {
        if (bytes[offset + i] !== text.charCodeAt(i)) return false
    }
    return true
}
