import { describe, expect, it } from 'vite-plus/test'
import {
    argvArgumentsArea,
    memoryLayoutFromItems,
    memoryRegionColor,
    mergeMemoryRegions,
    memoryHover,
    memoryReasons,
    readOnlyMemoryAt,
    regionChunkStart,
    regionLabels,
    regionsAt,
    resolveMemoryAddress,
    textSegmentsReadOnly,
    withArgumentsArea
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
            { start: 0x404000n, end: 0x404000n },
            { start: 0x7fffffffed00n, end: 0x7fffffffed00n },
            [{ name: 'Bitmap', start: 0x500000000000n, end: 0x500000000010n }]
        )
        expect(regionsAt(regions, 0x500000000003n).map((region) => region.kind)).toEqual([
            'device',
            'data'
        ])
        expect(memoryHover(regions, layout.dataLabels, 0x500000000003n)).toBe(
            'Bitmap · .data · Game::score+3 (_ZN4Game5scoreE) (library)'
        )
        expect(regions.find((region) => region.kind === 'stack')?.destination).toBe(0x7fffffffed00n)
        expect(regionsAt(regions, 0x404000n)).toEqual([])
    })
    it('resolves labels, decimal and hex offsets, and reports missing Builds and names', () => {
        const lookup = (name: string) => (name === 'buffer' ? 0x1000n : undefined)
        expect(resolveMemoryAddress('buffer+16', true, lookup)).toBe(0x1010n)
        expect(resolveMemoryAddress('buffer+0x20', true, lookup)).toBe(0x1020n)
        expect(resolveMemoryAddress('0xDEAD', false, lookup)).toBe(0xdeadn)
        expect(() => resolveMemoryAddress('buffer', false, lookup)).toThrow('Build')
        expect(() => resolveMemoryAddress('missing', true, lookup)).toThrow('Unknown label')
    })
    it('resolves C++ names whose operators hold a +, with an offset after them', () => {
        const names: Record<string, bigint> = {
            'std::string::operator+=': 0x2000n,
            'std::string::operator+=(char const*)': 0x2100n,
            'operator new(unsigned long)': 0x3000n
        }
        const lookup = (name: string) => names[name]
        expect(resolveMemoryAddress('std::string::operator+=', true, lookup)).toBe(0x2000n)
        expect(resolveMemoryAddress('std::string::operator+=+16', true, lookup)).toBe(0x2010n)
        expect(
            resolveMemoryAddress(' std::string::operator+=(char const*)+0x8 ', true, lookup)
        ).toBe(0x2108n)
        expect(resolveMemoryAddress('operator new(unsigned long)', true, lookup)).toBe(0x3000n)
        expect(() => resolveMemoryAddress('std::string::operator+', true, lookup)).toThrow(
            'Unknown label: std::string::operator+'
        )
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

describe('the Arguments region', () => {
    //MARS's layout of ./main hello "two words": the array, a zero byte, then the three strings
    const memory = new Uint8Array(0x28)
    const base = 0x7fffffd4n
    new TextEncoder().encodeInto('./main\0hello\0two words\0', memory.subarray(0x11))
    const read = (address: bigint, length: bigint) => {
        const offset = Number(address - base)
        if (offset < 0 || offset + Number(length) > memory.length) throw new Error('unmapped')
        return memory.slice(offset, offset + Number(length))
    }
    const facts = Int32Array.of(
        0x7fffffd4,
        0x7ffffffc,
        3,
        0x7fffffd4,
        0x7fffffe5,
        0x7fffffec,
        0x7ffffff2
    )
    const data = memoryLayoutFromItems(
        [{ start: 0x10010000n, length: 8n, kind: 'data', section: '.data' }],
        [{ name: 'buffer', address: 0x10010000n, fromLibrary: false }]
    )

    it('reads a MARS or RARS argv layout, and nothing when none was stored', () => {
        expect(argvArgumentsArea(facts)).toEqual({
            name: 'Arguments',
            start: 0x7fffffd4n,
            end: 0x7ffffffcn,
            parts: [
                { name: 'argv', address: 0x7fffffd4n },
                { name: 'argv[0]', address: 0x7fffffe5n, text: true },
                { name: 'argv[1]', address: 0x7fffffecn, text: true },
                { name: 'argv[2]', address: 0x7ffffff2n, text: true }
            ]
        })
        expect(argvArgumentsArea(new Int32Array(0))).toBeUndefined()
        expect(argvArgumentsArea(undefined)).toBeUndefined()
        //unsigned, as the Cores give every address
        expect(
            argvArgumentsArea(
                Int32Array.of(0x80000000 | 0, 0x80000010 | 0, 1, 0x80000000 | 0, 0x80000008 | 0)
            )?.end
        ).toBe(0x80000010n)
    })

    it('labels each part in its own region, with previews of the strings, among the data labels', () => {
        const layout = withArgumentsArea(data, argvArgumentsArea(facts)!, read)
        expect(layout.arguments).toEqual({
            name: 'Arguments',
            start: 0x7fffffd4n,
            end: 0x7ffffffcn
        })
        expect(
            layout.dataLabels.map((label) => [label.name, label.section, label.preview])
        ).toEqual([
            ['buffer', '.data', undefined],
            ['argv', 'Arguments', undefined],
            ['argv[0]', 'Arguments', './main'],
            ['argv[1]', 'Arguments', 'hello'],
            ['argv[2]', 'Arguments', 'two words']
        ])
        expect(layout.dataLabels.every((label) => !label.fromLibrary)).toBe(true)
        expect(data.arguments, 'the layout it was given is left alone').toBeUndefined()
    })

    it('leaves out parts outside the range and previews of what cannot be read', () => {
        const layout = withArgumentsArea(
            data,
            {
                name: 'Arguments',
                start: 0x7fffffd4n,
                end: 0x7ffffffcn,
                parts: [
                    { name: 'argv[0]', address: 0x7fffffe5n, text: true },
                    { name: 'outside', address: 0x7ffffffcn },
                    { name: 'unreadable', address: 0x7ffffff8n, text: true }
                ]
            },
            (address, length) => {
                if (address === 0x7ffffff8n) throw new Error('unmapped')
                return read(address, length)
            }
        )
        expect(layout.dataLabels.map((label) => [label.name, label.preview])).toEqual([
            ['buffer', undefined],
            ['argv[0]', './main'],
            ['unreadable', undefined]
        ])
    })

    it('is a region above the stack, chunked by its labels and named in the hover', () => {
        const layout = withArgumentsArea(data, argvArgumentsArea(facts)!, read)
        const regions = mergeMemoryRegions(
            layout,
            undefined,
            { start: 0x7fffeff0n, end: 0x7fffeffcn },
            []
        )
        const region = regions.find((region) => region.kind === 'arguments')!
        expect(region).toEqual({
            id: 'arguments',
            name: 'Arguments',
            section: 'Arguments',
            kind: 'arguments',
            start: 0x7fffffd4n,
            end: 0x7ffffffcn
        })
        expect(regions.map((region) => region.kind)).toEqual(['data', 'stack', 'arguments'])
        expect(memoryHover(regions, layout.dataLabels, 0x7fffffeen)).toBe('Arguments · argv[1]+2')
        expect(memoryHover(regions, layout.dataLabels, 0x7fffffe4n)).toBe('Arguments · argv+16')
        expect(memoryHover(regions, layout.dataLabels, 0x7fffeffcn)).toBe('')
        expect(
            [0x7fffffd4n, 0x7fffffe4n, 0x7fffffe5n, 0x7fffffebn, 0x7ffffffbn].map((address) =>
                regionChunkStart(region, layout.dataLabels, address)
            )
        ).toEqual([0x7fffffd4n, 0x7fffffd4n, 0x7fffffe5n, 0x7fffffe5n, 0x7ffffff2n])
        //a program popping past its start raises the stack's top into them: the stack is on top
        const raised = mergeMemoryRegions(
            layout,
            undefined,
            { start: 0x7fffffd8n, end: 0x7fffffe0n },
            []
        )
        expect(regionsAt(raised, 0x7fffffdcn).map((region) => region.kind)).toEqual([
            'stack',
            'arguments'
        ])
        expect(memoryHover(raised, layout.dataLabels, 0x7fffffdcn)).toBe(
            'Stack · Arguments · argv+8'
        )
    })

    it('has a colour of its own', () => {
        const kinds = ['code', 'data', 'reserved', 'heap', 'stack', 'device'] as const
        const colour = memoryRegionColor('arguments')
        expect(kinds.map(memoryRegionColor)).not.toContain(colour)
        expect(colour).toMatch(/^color-mix\(in srgb, #[0-9a-f]{6} 85%, var\(--secondary-text\)\)$/)
    })
})

/**
 * What the machine itself gives a meaning ([m68k-machine.md](../../../../../docs/design/m68k-machine.md),
 * decision 31): the 68000's exception vectors, named one label per vector, and the ranges of an
 * M68K program's memory map, each with what it does to the program.
 */
describe('regions the machine defines', () => {
    const vectorLabel = (name: string, address: bigint) => ({
        name,
        address,
        section: 'Exception vectors',
        fromLibrary: false
    })
    const layout = {
        ...memoryLayoutFromItems(
            [
                //a program that writes its own reset vectors, then its code over a ROM range
                { start: 0n, length: 8n, kind: 'data', section: 'Section 0' },
                { start: 0x1000n, length: 4n, kind: 'code', section: 'Section 1' }
            ],
            [{ name: 'reset', address: 0n, fromLibrary: false }]
        ),
        machineRegions: [
            {
                kind: 'vectors' as const,
                name: 'Exception vectors',
                start: 0n,
                end: 0x400n,
                reason: 'Each long word is a handler’s address.'
            },
            {
                kind: 'rom' as const,
                name: 'ROM',
                start: 0x1000n,
                end: 0x1100n,
                reason: 'The program’s writes here are ignored.'
            }
        ]
    }
    layout.dataLabels.push(
        vectorLabel('Reset SSP', 0n),
        vectorLabel('Reset PC', 4n),
        vectorLabel('Bus error', 8n)
    )
    const regions = mergeMemoryRegions(layout, undefined, undefined, [])

    it('lists each after the program’s own runs, in a section of its own name', () => {
        expect(regions.map((region) => [region.id, region.kind, region.section])).toEqual([
            ['Section 0:0', 'data', 'Section 0'],
            ['Section 1:0', 'code', 'Section 1'],
            ['machine:vectors', 'vectors', 'Exception vectors'],
            ['machine:rom', 'rom', 'ROM']
        ])
        const vectors = regions.find((region) => region.kind === 'vectors')!
        expect(regionLabels(vectors, layout.dataLabels).map((label) => label.name)).toEqual([
            'Reset SSP',
            'Reset PC',
            'Bus error'
        ])
    })

    it('outlines the vectors and the map over what the program placed, and names them all', () => {
        expect(regionsAt(regions, 4n).map((region) => region.kind)).toEqual(['vectors', 'data'])
        expect(regionsAt(regions, 0x1000n).map((region) => region.kind)).toEqual(['rom', 'code'])
        expect(memoryHover(regions, layout.dataLabels, 6n)).toBe(
            'Exception vectors · Reset PC+2 · Section 0 · reset+6'
        )
        expect(memoryHover(regions, layout.dataLabels, 0x1002n)).toBe('ROM · Section 1')
    })

    it('cuts the vectors into one chunk per vector, and leaves the map’s ranges whole', () => {
        const vectors = regions.find((region) => region.kind === 'vectors')!
        expect(regionChunkStart(vectors, layout.dataLabels, 6n)).toBe(4n)
        expect(regionChunkStart(vectors, layout.dataLabels, 0x200n)).toBe(8n)
        const rom = regions.find((region) => region.kind === 'rom')!
        expect(regionChunkStart(rom, layout.dataLabels, 0x1080n)).toBe(0x1000n)
    })

    it('says what each means to the program, and nothing where the machine defines nothing', () => {
        expect(memoryReasons(regions, 0x1002n)).toEqual(['The program’s writes here are ignored.'])
        expect(memoryReasons(regions, 4n)).toEqual(['Each long word is a handler’s address.'])
        expect(memoryReasons(regions, 0x2000n)).toEqual([])
    })

    it('gives each kind a colour no other kind has', () => {
        const kinds = [
            ...['code', 'data', 'reserved', 'heap', 'stack', 'arguments', 'device'],
            ...['vectors', 'rom', 'readOnly', 'protected', 'invalid']
        ] as const
        const colours = kinds.map(memoryRegionColor)
        expect(new Set(colours).size).toBe(kinds.length)
    })
})
