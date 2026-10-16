import type { ElfAnalysis } from '@specy/x86/elf'

/**
 * The parts of an Executable's file the Hex editor tints, as the memory view tints **Memory
 * regions** ([file-views.md](../../../../../../../docs/design/file-views.md), decision 9): the
 * ELF header, the program and section header tables, and each section with bytes in the file,
 * read from the ELF analysis the Listing uses. Where the section headers are gone, the load
 * segments stand in for the sections, as the Listing's own sections do.
 */

/** Code, data, or the ELF's own tables and what nothing loads (symbol and string tables). */
export type FileRegionKind = 'code' | 'data' | 'metadata'

export type FileRegion = Readonly<{
    name: string
    kind: FileRegionKind
    /** Where its bytes are in the File, end exclusive. */
    start: number
    end: number
    /** Where the program has them when it runs, end exclusive; none for what is not loaded. */
    address?: Readonly<{ start: number; end: number }>
    /** What it is, beside its name: a load segment's type and permissions. */
    note?: string
}>

const SHT_NULL = 0
const SHT_NOBITS = 8
const SHF_ALLOC = 2n
const SHF_EXECINSTR = 4n
const PT_LOAD = 1
const PF_X = 1
const PF_W = 2
const PF_R = 4

/** The header's table offsets and sizes, which the analysis does not keep. */
function headerTables(bytes: Uint8Array) {
    if (bytes.length < 0x34) return undefined
    const elf64 = bytes[4] === 2
    const little = bytes[5] !== 2
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const word = (at: number) => view.getUint16(at, little)
    if (elf64 && bytes.length < 0x40) return undefined
    const offset = (at: number) =>
        elf64 ? Number(view.getBigUint64(at, little)) : view.getUint32(at, little)
    return elf64
        ? {
              headerSize: word(52),
              programHeaders: { offset: offset(32), size: word(54), count: word(56) },
              sectionHeaders: { offset: offset(40), size: word(58), count: word(60) }
          }
        : {
              headerSize: word(40),
              programHeaders: { offset: offset(28), size: word(42), count: word(44) },
              sectionHeaders: { offset: offset(32), size: word(46), count: word(48) }
          }
}

/**
 * Every tinted part of an ELF's bytes, in file order. `base` is what its addresses are shifted by
 * when it runs, the Listing's, so a hover names the addresses the Listing shows.
 */
export function elfRegions(bytes: Uint8Array, analysis: ElfAnalysis, base = 0): FileRegion[] {
    const tables = headerTables(bytes)
    if (!tables || !analysis.isElf) return []
    const regions: FileRegion[] = []
    const add = (region: FileRegion) => {
        const end = Math.min(region.end, bytes.length)
        if (region.start >= 0 && end > region.start) regions.push({ ...region, end })
    }
    const loaded = (address: bigint, size: number) => ({
        start: Number(address) + base,
        end: Number(address) + base + size
    })
    add({ name: 'ELF header', kind: 'metadata', start: 0, end: tables.headerSize || 0x40 })
    const table = (name: string, where: { offset: number; size: number; count: number }) =>
        where.offset > 0 &&
        add({
            name,
            kind: 'metadata',
            start: where.offset,
            end: where.offset + where.size * where.count
        })
    table('Program header table', tables.programHeaders)
    //with 0xff00 sections or more the header's count is 0, and section 0 holds it
    table('Section header table', {
        ...tables.sectionHeaders,
        count: tables.sectionHeaders.count || analysis.sections.length
    })
    for (const section of analysis.sections) {
        if (section.type === SHT_NULL || section.type === SHT_NOBITS || !section.size) continue
        const allocated = (section.flags & SHF_ALLOC) !== 0n
        add({
            name: section.name || `section ${section.index}`,
            kind: (section.flags & SHF_EXECINSTR) !== 0n ? 'code' : allocated ? 'data' : 'metadata',
            start: section.offset,
            end: section.offset + section.size,
            ...(allocated && section.address
                ? { address: loaded(section.address, section.size) }
                : {})
        })
    }
    if (!analysis.sections.length)
        analysis.programHeaders.forEach((header, index) => {
            if (header.type !== PT_LOAD || !header.fileSize) return
            const permissions = `${header.flags & PF_R ? 'r' : '-'}${header.flags & PF_W ? 'w' : '-'}${header.flags & PF_X ? 'x' : '-'}`
            add({
                name: `load.${index}`,
                kind: header.flags & PF_X ? 'code' : 'data',
                start: header.offset,
                end: header.offset + header.fileSize,
                address: loaded(header.address, header.fileSize),
                note: `PT_LOAD ${permissions}`
            })
        })
    return regions.sort((a, b) => a.start - b.start || b.end - a.end)
}

/**
 * The regions laid flat, for looking up a byte: where regions overlap (a load segment holds the
 * headers) the smallest one holds the byte, so the most precise name is the one shown.
 */
export type RegionSpans = Readonly<{ starts: number[]; ends: number[]; regions: FileRegion[] }>

export function regionSpans(regions: readonly FileRegion[]): RegionSpans {
    const bounds = [...new Set(regions.flatMap((region) => [region.start, region.end]))].sort(
        (a, b) => a - b
    )
    const spans: RegionSpans = { starts: [], ends: [], regions: [] }
    for (let index = 0; index + 1 < bounds.length; index++) {
        const [start, end] = [bounds[index], bounds[index + 1]]
        let holder: FileRegion | undefined
        for (const region of regions)
            if (region.start <= start && region.end >= end)
                if (!holder || region.end - region.start < holder.end - holder.start)
                    holder = region
        if (!holder) continue
        const last = spans.regions.length - 1
        if (last >= 0 && spans.regions[last] === holder && spans.ends[last] === start)
            spans.ends[last] = end
        else {
            spans.starts.push(start)
            spans.ends.push(end)
            spans.regions.push(holder)
        }
    }
    return spans
}

/** The region holding the byte at `offset`, if any. */
export function regionAt(spans: RegionSpans, offset: number): FileRegion | undefined {
    let low = 0
    let high = spans.starts.length - 1
    while (low <= high) {
        const middle = (low + high) >> 1
        if (spans.starts[middle] > offset) high = middle - 1
        else if (spans.ends[middle] <= offset) low = middle + 1
        else return spans.regions[middle]
    }
    return undefined
}

const hex = (value: number) => `0x${value.toString(16)}`
const range = (start: number, end: number) => `${hex(start)}–${hex(end - 1)}`

/** What a region's hover says: its name, then its offsets and addresses, both ends included. */
export function regionHover(region: FileRegion): string {
    return [
        region.name,
        ...(region.note ? [region.note] : []),
        `offset ${range(region.start, region.end)}`,
        ...(region.address ? [`address ${range(region.address.start, region.address.end)}`] : [])
    ].join(' · ')
}
