import { byteSliceToNum } from '#cmp/specific/project/memory/memoryTabUtils.ts'
import {
    decodeDouble,
    decodeSingle,
    formatFloat32,
    formatFloat64
} from '#lib/languages/registerFormats.ts'
import { unsignedBigIntToSigned } from '#lib/utils.ts'

/**
 * The Hex editor's data inspector ([file-views.md](../../../../../../../docs/design/file-views.md),
 * decision 9): the bytes at the caret read as each integer width, signed and unsigned, and as a
 * single and a double, in the byte order chosen. A reading that needs more bytes than the File has
 * left has no value.
 */

export type InspectorRow = Readonly<{
    label: string
    /** What it reads as, in words, for the row's title. */
    description: string
    value: string | undefined
}>

type Reading = {
    label: string
    description: string
    bytes: number
    read: (bits: bigint) => string
}

const integer = (bytes: number, signed: boolean): Reading => ({
    label: `${signed ? '' : 'u'}int${bytes * 8}`,
    description: `${signed ? 'Signed' : 'Unsigned'} ${bytes * 8}-bit integer`,
    bytes,
    read: (bits) => (signed ? unsignedBigIntToSigned(bits, bytes) : bits).toString()
})

const READINGS: readonly Reading[] = [
    integer(1, true),
    integer(1, false),
    integer(2, true),
    integer(2, false),
    integer(4, true),
    integer(4, false),
    integer(8, true),
    integer(8, false),
    {
        label: 'float32',
        description: 'Single precision floating point',
        bytes: 4,
        read: (bits) => formatFloat32(decodeSingle(bits))
    },
    {
        label: 'float64',
        description: 'Double precision floating point',
        bytes: 8,
        read: (bits) => formatFloat64(decodeDouble(bits))
    }
]

/** The longest reading, which is how many bytes the inspector needs from the caret. */
export const INSPECTED_BYTES = 8

/** Each reading of the bytes from the start of `bytes`, the caret's. */
export function inspectBytes(bytes: Uint8Array, littleEndian: boolean): InspectorRow[] {
    return READINGS.map((reading) => ({
        label: reading.label,
        description: reading.description,
        value:
            bytes.length >= reading.bytes
                ? reading.read(
                      byteSliceToNum(
                          bytes.subarray(0, reading.bytes),
                          littleEndian ? 'little' : 'big'
                      )
                  )
                : undefined
    }))
}
