import { afterEach, describe, expect, it, vi } from 'vitest'
import {
    GENERATOR_SEED_LIMIT,
    RandomSource,
    SCRIPTED_RANDOM_SEED,
    hostRandomSeed
} from './RandomSource'

/**
 * Saved Testcases record what a scripted run's random services produce, so the fixed seed, the
 * derivations and the first outputs below are part of the Testcase format
 * ([ADR 0037](../../../../docs/adr/0037-testcases-run-on-a-seeded-random-source.md)). A change
 * that breaks one of these breaks every saved random Testcase: it is a breaking change, never a
 * test to update.
 */

function hex(bytes: Uint8Array): string {
    return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join(' ')
}

afterEach(() => {
    vi.restoreAllMocks()
})

describe('the seeded source of a scripted run', () => {
    it('starts from the fixed seed, the text "Testcase"', () => {
        expect(SCRIPTED_RANDOM_SEED).toBe(0x5465737463617365n)
        expect(SCRIPTED_RANDOM_SEED.toString(16)).toBe(
            Buffer.from('Testcase', 'ascii').toString('hex')
        )
    })

    it('gives every generator the seed it always gives it', () => {
        const random = new RandomSource({ mode: 'seeded' })
        expect(random.seedFor(0)).toBe(0xc4e8badd8e2e)
        expect(random.seedFor(1)).toBe(0x9089e35a7501)
        expect(random.seedFor(2)).toBe(0x721acbdb8f50)
        //MARS numbers its generators with a signed 32-bit register
        expect(random.seedFor(-1)).toBe(0xcb4110462fa6)
        expect(random.seedFor(2 ** 31 - 1)).toBe(0xe51395bea810)
        expect(random.seedFor(-(2 ** 31))).toBe(0x6499e9a005f7)
    })

    it('gives the byte stream it always gives', () => {
        const random = new RandomSource({ mode: 'seeded' })
        expect(hex(random.bytes(24))).toBe(
            '10 43 8d c6 a6 15 00 80 94 cf 13 bc d1 18 6b 68 53 c8 66 55 a8 ad 61 91'
        )
        expect(random.position).toBe(24)
    })

    it('gives a new seeded source, and a reset one, the same numbers again', () => {
        const first = new RandomSource({ mode: 'seeded' })
        const second = new RandomSource({ mode: 'seeded' })
        const bytes = first.bytes(40)
        expect(second.bytes(40)).toEqual(bytes)
        first.reset()
        expect(first.position).toBe(0)
        expect(first.bytes(40)).toEqual(bytes)
        expect(first.seedFor(7)).toBe(second.seedFor(7))
    })
})

describe('the derivation', () => {
    it('is SplitMix64: generator n starts from the high 48 bits of its n-th output', () => {
        //the published SplitMix64 outputs from the state 0: e220a8397b1dcdaf, 6e789e6aa1b965f4,
        //06c45d188009454f, f88bb8a8724c81ec
        const random = new RandomSource({ hostSeed: () => 0n })
        expect(random.seedFor(1)).toBe(0xe220a8397b1d)
        expect(random.seedFor(2)).toBe(0x6e789e6aa1b9)
        expect(random.seedFor(3)).toBe(0x06c45d188009)
        expect(random.seedFor(4)).toBe(0xf88bb8a8724c)
    })

    it('reads the byte stream from the word at 2^63, least significant byte first', () => {
        //for the seed 0 that word is mix(2^63 · γ), which is mix(2^63) since γ is odd, and so is
        //generator 0's word for the seed 2^63
        const stream = new RandomSource({ hostSeed: () => 0n }).bytes(8)
        const word = new DataView(stream.buffer).getBigUint64(0, true)
        expect(Number(word >> 16n)).toBe(new RandomSource({ hostSeed: () => 1n << 63n }).seedFor(0))
    })

    it('continues the stream across reads, whatever their sizes', () => {
        const whole = new RandomSource({ mode: 'seeded' }).bytes(37)
        const pieces = new RandomSource({ mode: 'seeded' })
        const read = [pieces.bytes(3), pieces.bytes(0), pieces.bytes(13), pieces.bytes(21)]
        expect(new Uint8Array(read.flatMap((part) => [...part]))).toEqual(whole)
    })

    it('goes back to a position read earlier, for Undo', () => {
        const random = new RandomSource({ mode: 'seeded' })
        random.bytes(5)
        const at = random.position
        const next = random.bytes(11)
        random.bytes(30)
        random.seek(at)
        expect(random.bytes(11)).toEqual(next)
        expect(random.position).toBe(16)
    })

    it('keeps every seed within what java.util.Random takes', () => {
        const random = new RandomSource({ hostSeed: () => 0xffffffffffffffffn })
        for (const generator of [0, 1, -1, 12345, -98765, 2 ** 31 - 1, -(2 ** 31)]) {
            const seed = random.seedFor(generator)
            expect(Number.isInteger(seed)).toBe(true)
            expect(seed).toBeGreaterThanOrEqual(0)
            expect(seed).toBeLessThan(GENERATOR_SEED_LIMIT)
        }
    })

    it('refuses a generator or a length that is not a whole number', () => {
        const random = new RandomSource({ mode: 'seeded' })
        expect(() => random.seedFor(1.5)).toThrow(RangeError)
        expect(() => random.bytes(-1)).toThrow(RangeError)
        expect(() => random.seek(-3)).toThrow(RangeError)
    })
})

describe('the host source of an interactive run', () => {
    it('is the default, and seeds from the host’s randomness', () => {
        const getRandomValues = vi.spyOn(globalThis.crypto, 'getRandomValues')
        const random = new RandomSource()
        expect(random.mode).toBe('host')
        expect(random.isSeeded).toBe(false)
        expect(getRandomValues).toHaveBeenCalledTimes(1)
        expect(typeof hostRandomSeed()).toBe('bigint')
    })

    it('gives a generator the same seed for the whole run, so Undo can draw it again', () => {
        const random = new RandomSource({ hostSeed: () => 0x123456789abcdefn })
        expect(random.seedFor(3)).toBe(random.seedFor(3))
        expect(random.seedFor(3)).not.toBe(new RandomSource({ mode: 'seeded' }).seedFor(3))
    })

    it('draws a new seed for every run', () => {
        let draws = 0
        const random = new RandomSource({ hostSeed: () => BigInt(++draws) })
        const first = random.seedFor(0)
        random.bytes(8)
        random.reset()
        expect(draws).toBe(2)
        expect(random.position).toBe(0)
        expect(random.seedFor(0)).not.toBe(first)
    })
})
