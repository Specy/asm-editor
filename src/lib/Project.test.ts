import { describe, expect, it } from 'vitest'
import { cleanTestcases, type Testcase } from '$lib/Project.svelte'

/**
 * `cleanTestcases` runs on every project loaded from storage and on every embed URL, because a
 * testcase that has been through JSON has numbers where the checker wants bigints. It used to read
 * a `number` entry's address where the expected value belongs, so a memory expectation was checked
 * against its own address and a lecture's Exercise could not assert on one at all.
 */

function testcaseWith(part: Partial<Testcase>): Testcase {
    return {
        input: [],
        expectedOutput: '',
        startingRegisters: {},
        expectedRegisters: {},
        startingMemory: [],
        expectedMemory: [],
        ...part
    }
}

describe('cleanTestcases', () => {
    it('keeps the expected value of a number memory entry, in both starting and expected memory', () => {
        const entry = { type: 'number' as const, address: 0x1000n, bytes: 4, expected: 42n }
        const [cleaned] = cleanTestcases([
            testcaseWith({ startingMemory: [entry], expectedMemory: [entry] })
        ])
        expect(cleaned.startingMemory[0]).toEqual(entry)
        expect(cleaned.expectedMemory[0]).toEqual(entry)
    })

    it('turns the numbers JSON gave back into bigints', () => {
        const fromJson = JSON.parse(
            '{"type":"number","address":4096,"bytes":2,"expected":7}'
        ) as never
        const [cleaned] = cleanTestcases([
            testcaseWith({
                expectedMemory: [fromJson],
                expectedRegisters: { d0: 3 as unknown as bigint }
            })
        ])
        expect(cleaned.expectedMemory[0]).toEqual({
            type: 'number',
            address: 4096n,
            bytes: 2,
            expected: 7n
        })
        expect(cleaned.expectedRegisters.d0).toBe(3n)
    })

    it('leaves the chunk entries alone apart from their numbers', () => {
        const [cleaned] = cleanTestcases([
            testcaseWith({
                expectedMemory: [
                    { type: 'string-chunk', address: 0x2000n, expected: 'hello' },
                    { type: 'number-chunk', address: 0x2010n, bytes: 1, expected: [1n, 2n, 3n] }
                ]
            })
        ])
        expect(cleaned.expectedMemory[0]).toEqual({
            type: 'string-chunk',
            address: 0x2000n,
            expected: 'hello'
        })
        expect(cleaned.expectedMemory[1]).toEqual({
            type: 'number-chunk',
            address: 0x2010n,
            bytes: 1,
            expected: [1n, 2n, 3n]
        })
    })
})
