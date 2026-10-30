import type {
    ArgumentsArea,
    DataLabel,
    DeviceRegion,
    HeapBounds,
    MemoryLayout,
    MemoryLayoutItem,
    MemoryRegion,
    ReadOnlyMemory
} from './commonLanguageFeatures.svelte'
import { PREVIEW_BYTES, textPreview } from './compiledMemoryNames'

/**
 * The read only memory of a MARS or RARS Core, from its `getTextSegments` start and end pairs: a
 * text segment holds statements rather than bytes, so it reads as their encodings but cannot be
 * written by the host.
 */
export function textSegmentsReadOnly(segments: ArrayLike<number>): ReadOnlyMemory[] {
    const ranges: ReadOnlyMemory[] = []
    for (let i = 0; i + 1 < segments.length; i += 2)
        ranges.push({
            start: BigInt(segments[i] >>> 0),
            end: BigInt(segments[i + 1] >>> 0),
            reason: "The text segment holds assembled instructions, which can't be poked"
        })
    return ranges
}

/** The first read only range that `length` bytes from `address` overlap. */
export function readOnlyMemoryAt(
    ranges: readonly ReadOnlyMemory[],
    address: bigint,
    length: bigint
): ReadOnlyMemory | undefined {
    return ranges.find((range) => address < range.end && address + length > range.start)
}

/** Merge Core items without bridging holes created by org or a section change. */
export function memoryLayoutFromItems(
    items: readonly MemoryLayoutItem[],
    labels: readonly DataLabel[]
): MemoryLayout {
    const sections: MemoryLayout['sections'] = []
    for (const item of [...items].sort((a, b) =>
        a.start < b.start ? -1 : a.start > b.start ? 1 : 0
    )) {
        if (item.length <= 0n) continue
        let section = sections.find((section) => section.name === item.section)
        if (!section) {
            section = { name: item.section, runs: [] }
            sections.push(section)
        }
        const last = section.runs.at(-1)
        const gap = last ? item.start - (last.start + last.length) : 0n
        if (last && last.kind === item.kind && gap >= 0n && gap < (item.alignment ?? 1n))
            last.length = item.start + item.length - last.start
        else section.runs.push({ start: item.start, length: item.length, kind: item.kind })
    }
    const dataLabels = labels
        .flatMap((label) => {
            const section = sections.find(
                (section) =>
                    (!label.section || section.name === label.section) &&
                    section.runs.some(
                        (run) =>
                            run.kind !== 'code' &&
                            label.address >= run.start &&
                            label.address < run.start + run.length
                    )
            )
            return section ? [{ ...label, section: section.name }] : []
        })
        .sort((a, b) =>
            a.address < b.address ? -1 : a.address > b.address ? 1 : a.name.localeCompare(b.name)
        )
    return { sections, dataLabels }
}

/**
 * Where a MARS or RARS Core stored the program's argv, from its `getProgramArgumentsLayout`: the
 * range, argc, the array's address and each string's, as unsigned 32-bit values. Nothing when the
 * Core stored none.
 */
export function argvArgumentsArea(
    layout: ArrayLike<number> | undefined
): ArgumentsArea | undefined {
    if (!layout || layout.length < 4) return undefined
    const address = (index: number) => BigInt(layout[index] >>> 0)
    const strings = Array.from({ length: layout.length - 4 }, (_, i) => ({
        name: `argv[${i}]`,
        address: address(4 + i),
        text: true
    }))
    return {
        name: 'Arguments',
        start: address(0),
        end: address(1),
        parts: [{ name: 'argv', address: address(3) }, ...strings]
    }
}

/**
 * The layout with a program's Arguments added: their region, and each part as a data label of it,
 * a string's with the start of its text as its preview, read from memory as it is now, which is
 * as the Core stored it when this is read at the program's start.
 */
export function withArgumentsArea(
    layout: MemoryLayout,
    area: ArgumentsArea,
    read: (address: bigint, length: bigint) => Uint8Array
): MemoryLayout {
    const parts = area.parts
        .filter((part) => part.address >= area.start && part.address < area.end)
        .sort((a, b) => (a.address < b.address ? -1 : a.address > b.address ? 1 : 0))
    const labels: DataLabel[] = parts.map((part, index) => {
        const label: DataLabel = {
            name: part.name,
            address: part.address,
            section: area.name,
            fromLibrary: false
        }
        if (part.text) {
            const end = parts[index + 1]?.address ?? area.end
            const length =
                end - part.address < PREVIEW_BYTES ? end - part.address : BigInt(PREVIEW_BYTES)
            try {
                label.preview = textPreview(read(part.address, length))
            } catch {
                /* unreadable text has no preview; its name still says what it is */
            }
        }
        return label
    })
    return {
        ...layout,
        arguments: { name: area.name, start: area.start, end: area.end },
        dataLabels: [...layout.dataLabels, ...labels].sort((a, b) =>
            a.address < b.address ? -1 : a.address > b.address ? 1 : a.name.localeCompare(b.name)
        )
    }
}

export function mergeMemoryRegions(
    layout: MemoryLayout,
    heap: HeapBounds | undefined,
    stack: HeapBounds | undefined,
    devices: readonly DeviceRegion[]
): MemoryRegion[] {
    const regions: MemoryRegion[] = layout.sections.flatMap((section) =>
        section.runs.map((run, index) => ({
            id: `${section.name}:${index}`,
            name: section.name,
            section: section.name,
            start: run.start,
            end: run.start + run.length,
            kind: run.kind
        }))
    )
    //what the machine gives a meaning, named by itself: the vectors' names are labels of its section.
    //A kind can have several, two `memory rom` lines or a vector table that wraps round the top of
    //memory, and each after the first of its kind is numbered, so that every id stays unique
    const machineKinds = new Map<string, number>()
    for (const region of layout.machineRegions ?? []) {
        const count = (machineKinds.get(region.kind) ?? 0) + 1
        machineKinds.set(region.kind, count)
        const id = count === 1 ? `machine:${region.kind}` : `machine:${region.kind}:${count}`
        regions.push({ ...region, id, section: region.name })
    }
    if (heap) regions.push({ ...heap, id: 'heap', name: 'Heap', kind: 'heap' })
    if (stack)
        regions.push({
            start: stack.start,
            end: stack.end > stack.start ? stack.end : stack.start,
            destination: stack.start,
            id: 'stack',
            name: 'Stack',
            kind: 'stack'
        })
    // after the stack, which takes the outline where a program popping past its start meets them
    if (layout.arguments)
        regions.push({
            ...layout.arguments,
            id: 'arguments',
            section: layout.arguments.name,
            kind: 'arguments'
        })
    regions.push(
        ...devices.map((device, index) => ({
            ...device,
            id: `device:${index}:${device.name}`,
            kind: 'device' as const
        }))
    )
    return regions
}

/**
 * Which region draws its outline where several overlap, the first of them: a device, then the
 * exception vectors, whose labels cut them into one chunk per vector, then a range of the memory
 * map, and then what the program placed. The hover names every one of them either way.
 */
function overlapRank(kind: MemoryRegion['kind']): number {
    if (kind === 'device') return 0
    if (kind === 'vectors') return 1
    if (kind === 'rom' || kind === 'readOnly' || kind === 'protected' || kind === 'invalid')
        return 2
    return 3
}

export function regionsAt(regions: readonly MemoryRegion[], address: bigint): MemoryRegion[] {
    return regions
        .filter((region) => address >= region.start && address < region.end)
        .sort((a, b) => overlapRank(a.kind) - overlapRank(b.kind))
}

export function regionLabels(region: MemoryRegion, labels: readonly DataLabel[]): DataLabel[] {
    return labels.filter(
        (label) =>
            label.section === region.section &&
            label.address >= region.start &&
            label.address < region.end
    )
}

/**
 * Where the chunk holding `address` starts: the nearest data label at or below it inside the
 * region, or the region's own start before its first label. A chunk is the part of a region one
 * label names, so the memory view can draw each variable's bytes apart. Only the program's data
 * and reserved runs, its Arguments and the 68000's exception vectors have labels, so every other
 * region is one chunk.
 */
export function regionChunkStart(
    region: MemoryRegion,
    labels: readonly DataLabel[],
    address: bigint
): bigint {
    if (
        region.kind !== 'data' &&
        region.kind !== 'reserved' &&
        region.kind !== 'arguments' &&
        region.kind !== 'vectors'
    )
        return region.start
    let start = region.start
    for (const label of regionLabels(region, labels))
        if (label.address <= address && label.address > start) start = label.address
    return start
}

export function memoryHover(
    regions: readonly MemoryRegion[],
    labels: readonly DataLabel[],
    address: bigint
): string {
    return regionsAt(regions, address)
        .map((region) => {
            const label =
                region.kind === 'device'
                    ? undefined
                    : regionLabels(region, labels)
                          .filter((label) => label.address <= address)
                          .at(-1)
            if (!label) return region.name
            const offset = address - label.address
            const display = label.displayName ?? label.name
            return `${region.name} · ${display}${offset ? `+${offset}` : ''}${display !== label.name ? ` (${label.name})` : ''}${label.fromLibrary ? ' (library)' : ''}`
        })
        .join(' · ')
}

/**
 * What the regions at `address` mean to the program, for those the machine defines, one line
 * each: why a ROM ignores the program's writes, what a vector holds. Empty elsewhere.
 */
export function memoryReasons(regions: readonly MemoryRegion[], address: bigint): string[] {
    return regionsAt(regions, address).flatMap((region) => (region.reason ? [region.reason] : []))
}

const regionColors = {
    code: '#508ff5',
    data: '#38ad68',
    reserved: '#d99b30',
    heap: '#ab78e6',
    stack: '#30b4bd',
    arguments: '#d462b6',
    device: '#e75b75',
    //what the machine defines: the 68000's exception vectors, and EASy68K's memory map
    vectors: '#ec8a2e',
    rom: '#8d99ae',
    readOnly: '#b0a33b',
    protected: '#7a6ad8',
    invalid: '#b8473a',
    //an Executable's own tables in the Hex editor: its headers, symbols and strings
    metadata: '#94a3b8'
} as const
export function memoryRegionColor(kind: MemoryRegion['kind'] | 'metadata'): string {
    return `color-mix(in srgb, ${regionColors[kind]} 85%, var(--secondary-text))`
}

/** Hex keeps the existing input contract; decimal offsets make buffer+16 useful. */
export function resolveMemoryAddress(
    input: string,
    built: boolean,
    lookup: (name: string) => bigint | undefined
): bigint {
    const text = input.trim()
    if (built && !text.includes('+')) {
        const label = lookup(text)
        if (label !== undefined) return label
    }
    if (/^(?:0x)?[0-9a-f]+$/i.test(text)) return BigInt(`0x${text.replace(/^0x/i, '')}`)
    if (!built) throw new Error('Build the program first to go to a label.')
    const match = /^(.*?)(?:\+((?:0x[0-9a-f]+)|[0-9]+))?$/i.exec(text)!
    const address = lookup(match[1])
    if (address === undefined) throw new Error(`Unknown label: ${match[1]}`)
    return address + (match[2] ? BigInt(match[2]) : 0n)
}
