import { describe, expect, it } from 'vite-plus/test'
import { inspectSoundFile } from './soundFiles'
import { makeMidi, makeWav } from './soundFixtures'

describe('WAV Files', () => {
    it.each([8, 16, 24, 32])('plays %i-bit PCM', (bits) => {
        expect(inspectSoundFile(makeWav({ bits, lengthMs: 250 }))).toEqual({
            kind: 'wav',
            lengthMs: 250
        })
    })

    it('plays 32-bit float, and an extensible header holding PCM', () => {
        expect(inspectSoundFile(makeWav({ format: 3, bits: 32 })).kind).toBe('wav')
        expect(inspectSoundFile(makeWav({ format: 0xfffe, subFormat: 1, bits: 16 })).kind).toBe(
            'wav'
        )
    })

    it('takes its length from the data chunk over the byte rate', () => {
        const stereo = makeWav({ channels: 2, sampleRate: 22050, lengthMs: 1000 })
        expect(inspectSoundFile(stereo)).toEqual({ kind: 'wav', lengthMs: 1000 })
    })

    it('plays what a truncated File holds', () => {
        const whole = makeWav({ sampleRate: 8000, lengthMs: 1000 })
        const half = whole.slice(0, 44 + 8000)
        expect(inspectSoundFile(half)).toEqual({ kind: 'wav', lengthMs: 500 })
    })

    it('names the formats a browser cannot decode', () => {
        expect(inspectSoundFile(makeWav({ format: 0x11, bits: 4 }))).toEqual({
            kind: 'unplayable',
            format: 'a WAV in the IMA ADPCM format'
        })
        expect(inspectSoundFile(makeWav({ format: 3, bits: 64 }))).toEqual({
            kind: 'unplayable',
            format: 'a WAV of 64-bit float samples'
        })
        expect(inspectSoundFile(makeWav({ format: 0x1234 }))).toEqual({
            kind: 'unplayable',
            format: 'a WAV in format 0x1234'
        })
    })

    it('refuses a WAV with no sound data', () => {
        expect(inspectSoundFile(makeWav({ noData: true })).kind).toBe('unplayable')
    })
})

describe('MIDI Files', () => {
    it('reads the length at the default tempo, 120 quarter notes a minute', () => {
        expect(inspectSoundFile(makeMidi(4))).toEqual({ kind: 'midi', lengthMs: 2000 })
    })

    it('follows a tempo change', () => {
        expect(inspectSoundFile(makeMidi(4, 1_000_000))).toEqual({ kind: 'midi', lengthMs: 4000 })
    })

    it('calls a File whose track runs past its end damaged', () => {
        const midi = makeMidi(2)
        expect(inspectSoundFile(midi.slice(0, midi.length - 3))).toEqual({
            kind: 'unplayable',
            format: 'a damaged MIDI File'
        })
    })
})

describe('other Files', () => {
    it('names an MP3 and anything else', () => {
        expect(inspectSoundFile(new Uint8Array([0x49, 0x44, 0x33, 4, 0]))).toEqual({
            kind: 'unplayable',
            format: 'an MP3 file'
        })
        expect(inspectSoundFile(new TextEncoder().encode('hello'))).toEqual({
            kind: 'unplayable',
            format: 'neither a WAV nor a MIDI File'
        })
    })
})
