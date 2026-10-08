import { describe, expect, it } from 'vitest'
import {
    memoryLayoutFromItems,
    mergeMemoryRegions,
    memoryHover,
    regionsAt,
    resolveMemoryAddress
} from './memoryRegions'

describe('memory regions', () => {
    it('joins alignment padding, keeps kind changes and org holes, and excludes code labels', () => {
        const layout = memoryLayoutFromItems(
            [
                { start: 0x1003n, length: 2n, kind: 'data', section: '0', alignment: 2n },
                { start: 0x1000n, length: 2n, kind: 'data', section: '0' },
                { start: 0x1005n, length: 3n, kind: 'reserved', section: '0' },
                { start: 0x1020n, length: 4n, kind: 'code', section: '0' }
            ],
            [
                { name: 'buffer', address: 0x1003n, fromLibrary: false },
                { name: 'start', address: 0x1020n, fromLibrary: false },
                { name: 'hole', address: 0x1010n, fromLibrary: false }
            ]
        )
        expect(layout.sections[0].runs).toEqual([
            { start: 0x1000n, length: 5n, kind: 'data' },
            { start: 0x1005n, length: 3n, kind: 'reserved' },
            { start: 0x1020n, length: 4n, kind: 'code' }
        ])
        expect(layout.dataLabels.map((label) => label.name)).toEqual(['buffer'])
    })
    it('keeps device overlaps, empty moving regions, and lossless x86 addresses', () => {
        const layout = memoryLayoutFromItems(
            [{ start: 0x500000000000n, length: 32n, kind: 'data', section: '.data' }],
            [
                {
                    name: '_ZN4Game5scoreE',
                    displayName: 'Game::score',
                    address: 0x500000000000n,
                    fromLibrary: true
                }
            ]
        )
        const regions = mergeMemoryRegions(
            layout,
            { start: 0x88000000n, end: 0x88000000n },
            { start: 0x4ffffffffed0n, end: 0x4ffffffffed0n },
            [{ name: 'Bitmap', start: 0x500000000000n, end: 0x500000000010n }]
        )
        expect(regionsAt(regions, 0x500000000003n).map((region) => region.kind)).toEqual([
            'device',
            'data'
        ])
        expect(memoryHover(regions, layout.dataLabels, 0x500000000003n)).toBe(
            'Bitmap · .data · Game::score+3 (_ZN4Game5scoreE) (library)'
        )
        expect(regions.find((region) => region.kind === 'stack')?.destination).toBe(0x4ffffffffed0n)
        expect(regionsAt(regions, 0x88000000n)).toEqual([])
    })
    it('resolves labels, decimal and hex offsets, and reports missing Builds and names', () => {
        const lookup = (name: string) => (name === 'buffer' ? 0x1000n : undefined)
        expect(resolveMemoryAddress('buffer+16', true, lookup)).toBe(0x1010n)
        expect(resolveMemoryAddress('buffer+0x20', true, lookup)).toBe(0x1020n)
        expect(resolveMemoryAddress('0xDEAD', false, lookup)).toBe(0xdeadn)
        expect(() => resolveMemoryAddress('buffer', false, lookup)).toThrow('Build')
        expect(() => resolveMemoryAddress('missing', true, lookup)).toThrow('Unknown label')
    })
})
