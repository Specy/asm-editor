/**
 * Sound Files built byte by byte, for the tests of Audio and of the adapters that play Files.
 */

export type WavOptions = {
    /** The `fmt ` format tag: 1 PCM, 3 float, 0xFFFE extensible, anything else unplayable. */
    format?: number
    /** The real format of an extensible header. */
    subFormat?: number
    bits?: number
    channels?: number
    sampleRate?: number
    /** Length of the sound data in milliseconds. */
    lengthMs?: number
    /** Leaves the data chunk out. */
    noData?: boolean
}

export function makeWav(options: WavOptions = {}): Uint8Array {
    const format = options.format ?? 1
    const bits = options.bits ?? 16
    const channels = options.channels ?? 1
    const sampleRate = options.sampleRate ?? 8000
    const blockAlign = channels * Math.ceil(bits / 8)
    const frames = Math.round((sampleRate * (options.lengthMs ?? 500)) / 1000)
    const dataBytes = options.noData ? 0 : frames * blockAlign
    const extensible = format === 0xfffe
    const fmtSize = extensible ? 40 : 16
    const size = 12 + 8 + fmtSize + (options.noData ? 0 : 8 + dataBytes)
    const bytes = new Uint8Array(size)
    const view = new DataView(bytes.buffer)
    const text = (offset: number, value: string) =>
        [...value].forEach((c, i) => (bytes[offset + i] = c.charCodeAt(0)))
    text(0, 'RIFF')
    view.setUint32(4, size - 8, true)
    text(8, 'WAVE')
    text(12, 'fmt ')
    view.setUint32(16, fmtSize, true)
    view.setUint16(20, format, true)
    view.setUint16(22, channels, true)
    view.setUint32(24, sampleRate, true)
    view.setUint32(28, sampleRate * blockAlign, true)
    view.setUint16(32, blockAlign, true)
    view.setUint16(34, bits, true)
    if (extensible) {
        view.setUint16(36, 22, true)
        view.setUint16(44, options.subFormat ?? 1, true)
    }
    if (!options.noData) {
        const data = 20 + fmtSize
        text(data, 'data')
        view.setUint32(data + 4, dataBytes, true)
    }
    return bytes
}

/**
 * A one-track Standard MIDI File at 480 ticks a quarter note: `notes` quarter notes of middle C,
 * with an optional tempo in microseconds a quarter note (500,000, 120 a minute, by default).
 */
export function makeMidi(notes = 4, tempo?: number): Uint8Array {
    const events: number[] = []
    if (tempo !== undefined)
        events.push(0, 0xff, 0x51, 3, (tempo >> 16) & 255, (tempo >> 8) & 255, tempo & 255)
    events.push(0, 0xc0, 0)
    for (let i = 0; i < notes; i++) {
        //note-on at once, note-off a quarter note (480 ticks, 0x83 0x60) later, in running status
        events.push(0, 0x90, 60, 100, 0x83, 0x60, 60, 0)
    }
    events.push(0, 0xff, 0x2f, 0)
    const track = [...ascii('MTrk'), ...u32(events.length), ...events]
    return new Uint8Array([...ascii('MThd'), ...u32(6), 0, 0, 0, 1, 0x01, 0xe0, ...track])
}

function ascii(text: string): number[] {
    return [...text].map((c) => c.charCodeAt(0))
}

function u32(value: number): number[] {
    return [(value >>> 24) & 255, (value >>> 16) & 255, (value >>> 8) & 255, value & 255]
}
