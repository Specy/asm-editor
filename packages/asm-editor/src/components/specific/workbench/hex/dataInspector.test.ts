import { describe, expect, it } from 'vite-plus/test'
import { inspectBytes } from './dataInspector'

const values = (bytes: number[], littleEndian: boolean) =>
    Object.fromEntries(
        inspectBytes(Uint8Array.from(bytes), littleEndian).map((row) => [row.label, row.value])
    )

describe('the data inspector', () => {
    it('reads each integer width, signed and unsigned, in either byte order', () => {
        const bytes = [0xfe, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]
        expect(values(bytes, true)).toMatchObject({
            int8: '-2',
            uint8: '254',
            int16: '-2',
            uint16: '65534',
            int32: '-2',
            uint32: '4294967294',
            int64: '-2',
            uint64: '18446744073709551614'
        })
        expect(values(bytes, false)).toMatchObject({
            int16: '-257',
            uint16: '65279',
            uint32: '4278190079'
        })
    })

    it('reads single and double precision', () => {
        expect(values([0x00, 0x00, 0x80, 0x3f, 0, 0, 0xf0, 0x3f], true)).toMatchObject({
            float32: '1',
            float64: '1.000000236555934'
        })
        expect(values([0x3f, 0xf0, 0, 0, 0, 0, 0, 0], false)).toMatchObject({ float64: '1' })
        expect(values([0xcd, 0xcc, 0xcc, 0x3d], true).float32).toBe('0.1')
    })

    it('has no value for a reading longer than the bytes left', () => {
        const near = values([0x41, 0x42, 0x43], true)
        expect(near).toMatchObject({ int8: '65', uint16: '16961' })
        expect(near.int32).toBeUndefined()
        expect(near.float64).toBeUndefined()
    })
})
