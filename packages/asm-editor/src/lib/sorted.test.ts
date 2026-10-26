import { describe, expect, it } from 'vite-plus/test'
import { partitionPoint } from '#lib/sorted.ts'

describe('partitionPoint', () => {
    const sorted = [1, 3, 3, 3, 7]
    const below = (value: number) => partitionPoint(sorted.length, (i) => sorted[i] < value)
    const atOrBelow = (value: number) => partitionPoint(sorted.length, (i) => sorted[i] <= value)

    it('finds the first index at or above a value, and the first above it', () => {
        expect([0, 1, 2, 3, 4, 7, 8].map(below)).toEqual([0, 0, 1, 1, 4, 4, 5])
        expect([0, 1, 2, 3, 4, 7, 8].map(atOrBelow)).toEqual([0, 1, 1, 4, 4, 5, 5])
    })

    it('is 0 for an empty range', () => {
        expect(partitionPoint(0, () => true)).toBe(0)
    })
})
