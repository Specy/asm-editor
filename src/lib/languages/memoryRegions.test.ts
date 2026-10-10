import { describe, expect, it } from 'vitest'
import {
    memoryLayoutFromItems,
    mergeMemoryRegions,
    memoryHover,
    readOnlyMemoryAt,
    regionChunkStart,
    regionsAt,
    resolveMemoryAddress,
    textSegmentsReadOnly
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
    it('reads text segments as unsigned read only ranges and finds overlaps', () => {
        const ranges = textSegmentsReadOnly(
            Int32Array.of(0x00400000, 0x10000000, 0x80000000 | 0, 0x90000000 | 0)
        )
        expect(ranges.map(({ start, end }) => [start, end])).toEqual([
            [0x00400000n, 0x10000000n],
            [0x80000000n, 0x90000000n]
        ])
        expect(readOnlyMemoryAt(ranges, 0x003ffffcn, 4n)).toBeUndefined()
        expect(readOnlyMemoryAt(ranges, 0x003ffffcn, 5n)).toBe(ranges[0])
        expect(readOnlyMemoryAt(ranges, 0x0ffffffcn, 4n)).toBe(ranges[0])
        expect(readOnlyMemoryAt(ranges, 0x10000000n, 16n)).toBeUndefined()
        expect(readOnlyMemoryAt(ranges, 0x80000180n, 1n)).toBe(ranges[1])
    })
})

describe('region chunks', () => {
    const layout = memoryLayoutFromItems(
        [
            { start: 0x1000n, length: 16n, kind: 'data', section: '.data' },
            { start: 0x1010n, length: 8n, kind: 'reserved', section: '.data' },
            { start: 0x2000n, length: 8n, kind: 'code', section: '.text' }
        ],
        [
            { name: 'first', address: 0x1004n, fromLibrary: false },
            { name: 'alias', address: 0x1004n, fromLibrary: false },
            { name: 'second', address: 0x100cn, fromLibrary: true },
            { name: 'buffer', address: 0x1014n, fromLibrary: false }
        ]
    )
    const [data, reserved, text] = mergeMemoryRegions(layout, undefined, undefined, [])

    it('starts a chunk at each label, and before the first at the region start', () => {
        const chunk = (address: bigint) => regionChunkStart(data, layout.dataLabels, address)
        expect([0x1000n, 0x1003n, 0x1004n, 0x100bn, 0x100cn, 0x100fn].map(chunk)).toEqual([
            0x1000n,
            0x1000n,
            0x1004n,
            0x1004n,
            0x100cn,
            0x100cn
        ])
    })
    it('keeps labels of one run out of the neighbouring run of the same section', () => {
        expect(regionChunkStart(reserved, layout.dataLabels, 0x1010n)).toBe(0x1010n)
        expect(regionChunkStart(reserved, layout.dataLabels, 0x1017n)).toBe(0x1014n)
        expect(regionChunkStart(data, layout.dataLabels, 0x100fn)).toBe(0x100cn)
    })
    it('leaves the regions without data labels in one piece', () => {
        expect(regionChunkStart(text, layout.dataLabels, 0x2004n)).toBe(0x2000n)
        const heap = {
            id: 'heap',
            name: 'Heap',
            kind: 'heap' as const,
            start: 0x3000n,
            end: 0x4000n
        }
        expect(regionChunkStart(heap, layout.dataLabels, 0x3800n)).toBe(0x3000n)
    })
})
