import type {
    DataLabel,
    DeviceRegion,
    HeapBounds,
    MemoryLayout,
    MemoryLayoutItem,
    MemoryRegion,
    ReadOnlyMemory
} from './commonLanguageFeatures.svelte'

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
    regions.push(
        ...devices.map((device, index) => ({
            ...device,
            id: `device:${index}:${device.name}`,
            kind: 'device' as const
        }))
    )
    return regions
}

export function regionsAt(regions: readonly MemoryRegion[], address: bigint): MemoryRegion[] {
    return regions
        .filter((region) => address >= region.start && address < region.end)
        .sort((a, b) => Number(b.kind === 'device') - Number(a.kind === 'device'))
}

export function regionLabels(region: MemoryRegion, labels: readonly DataLabel[]): DataLabel[] {
    return labels.filter(
        (label) =>
            label.section === region.section &&
            label.address >= region.start &&
            label.address < region.end
    )
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

const regionColors = {
    code: '#508ff5',
    data: '#38ad68',
    reserved: '#d99b30',
    heap: '#ab78e6',
    stack: '#30b4bd',
    device: '#e75b75'
} as const
export function memoryRegionColor(kind: MemoryRegion['kind']): string {
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
    if (!built) throw new Error('Build to use labels')
    const match = /^(.*?)(?:\+((?:0x[0-9a-f]+)|[0-9]+))?$/i.exec(text)!
    const address = lookup(match[1])
    if (address === undefined) throw new Error(`Unknown label: ${match[1]}`)
    return address + (match[2] ? BigInt(match[2]) : 0n)
}
