import type { ElfAnalysis, ElfSymbol } from './decoder'
import type { ListingNameOrigin } from './listing'
import { printableSymbolName } from './names'

/**
 * What the Listing reads from an ELF before decoding anything: the ranges it lists (sections, or
 * the program's load segments when it has no usable section headers), the names its symbol tables
 * give, and its relocations.
 */

const SHT_PROGBITS = 1
const SHT_RELA = 4
const SHT_NOBITS = 8
const SHT_INIT_ARRAY = 14
const SHT_FINI_ARRAY = 15
const SHT_PREINIT_ARRAY = 16
const SHT_RELR = 19
const SHF_ALLOC = 2n
const SHF_EXECINSTR = 4n
const SHF_TLS = 0x400n
const PT_LOAD = 1
const PF_X = 1
const PF_W = 2
const PF_R = 4

export const R_X86_64_64 = 1
export const R_X86_64_GLOB_DAT = 6
export const R_X86_64_JUMP_SLOT = 7
export const R_X86_64_RELATIVE = 8
export const R_X86_64_IRELATIVE = 37

/** A range of the address space the Listing shows, under one `section` line. */
export type Region = {
    name: string
    /** The `section` line, with a comment naming a load segment when it stands in for sections. */
    title: string
    /** Link-time start and size in memory. */
    address: number
    size: number
    /** Where its first byte is in the file, and how many of its bytes the file holds (the rest is zero). */
    offset: number
    fileSize: number
    code: boolean
    /** Whether to look for strings in it: not in code, nor in tables the linker writes. */
    strings: boolean
    /** `.init_array`, `.fini_array` and `.preinit_array` hold the addresses of functions. */
    functionPointers: boolean
    /** For PLT sections: how far apart their stubs are. */
    entrySize: number
}

export type SymbolName = {
    name: string
    origin: ListingNameOrigin
    /** Rank among the names of one address, lower first: see {@link namePreference}. */
    rank: number[]
    /** For an object symbol, how many bytes it covers. */
    size: number
    object: boolean
}

export type Relocation = { address: number; type: number; symbol: string; addend: number }

export type ElfModel = {
    analysis: ElfAnalysis
    bytes: Uint8Array
    /** Sorted by address, never overlapping. */
    regions: Region[]
    /** Whether {@link regions} come from load segments because the section headers are unusable. */
    fromSegments: boolean
    /** Every name the symbol tables give an address in a region, best first. */
    symbolNames: Map<number, SymbolName[]>
    /** By the address they patch; the first relocation of an address wins. */
    relocations: Map<number, Relocation>
}

function toNumber(value: bigint): number {
    return value <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(value) : Number.NaN
}

const USER_SPACE_END = 0x800000000000

function sectionRegions(analysis: ElfAnalysis, bytes: Uint8Array): Region[] {
    const loads = analysis.programHeaders.filter((header) => header.type === PT_LOAD)
    const inLoad = (
        address: number,
        size: number,
        offset: number,
        nobits: boolean,
        code: boolean
    ) =>
        !loads.length ||
        loads.some((load) => {
            const start = toNumber(load.address)
            if (code && !(load.flags & PF_X)) return false
            if (nobits)
                return address >= start && address + size <= start + toNumber(load.memorySize)
            return (
                address >= start &&
                address + size <= start + load.fileSize &&
                offset - load.offset === address - start
            )
        })
    const regions: Region[] = []
    const candidates = [...analysis.sections]
        .filter((section) => section.flags & SHF_ALLOC && section.size > 0)
        .filter((section) => !(section.flags & SHF_TLS && section.type === SHT_NOBITS))
        .sort((a, b) =>
            a.address < b.address ? -1 : a.address > b.address ? 1 : a.index - b.index
        )
    for (const section of candidates) {
        const address = toNumber(section.address)
        const nobits = section.type === SHT_NOBITS
        const code = !nobits && !!(section.flags & SHF_EXECINSTR)
        if (!(address + section.size <= USER_SPACE_END)) continue
        if (!nobits && section.offset + section.size > bytes.length) continue
        if (!inLoad(address, section.size, section.offset, nobits, code)) continue
        const previous = regions.at(-1)
        if (previous && address < previous.address + previous.size) continue
        regions.push({
            name: section.name,
            title: `section ${section.name.replace(/[^\w$#@~.?]/g, '_') || `.section${section.index}`}`,
            address,
            size: section.size,
            offset: nobits ? -1 : section.offset,
            fileSize: nobits ? 0 : section.size,
            code,
            strings:
                section.type === SHT_PROGBITS &&
                !code &&
                !section.name.startsWith('.eh_frame') &&
                section.name !== '.gcc_except_table',
            functionPointers:
                section.type === SHT_INIT_ARRAY ||
                section.type === SHT_FINI_ARRAY ||
                section.type === SHT_PREINIT_ARRAY,
            entrySize: section.entrySize
        })
    }
    return regions
}

function segmentRegions(analysis: ElfAnalysis, bytes: Uint8Array, hex: (n: number) => string) {
    const regions: Region[] = []
    analysis.programHeaders.forEach((header, index) => {
        if (header.type !== PT_LOAD) return
        const address = toNumber(header.address)
        const size = toNumber(header.memorySize)
        if (!(size > 0 && address + size <= USER_SPACE_END)) return
        const fileSize = Math.min(header.fileSize, size, Math.max(0, bytes.length - header.offset))
        const flags = `${header.flags & PF_R ? 'r' : '-'}${header.flags & PF_W ? 'w' : '-'}${header.flags & PF_X ? 'x' : '-'}`
        regions.push({
            name: `load.${index}`,
            title: `section load.${index} ; program header ${index}: PT_LOAD ${flags}, ${hex(address)} to ${hex(address + size)}`,
            address,
            size,
            offset: header.offset,
            fileSize,
            code: !!(header.flags & PF_X),
            strings: !(header.flags & PF_X),
            functionPointers: false,
            entrySize: 0
        })
    })
    // Overlapping segments are not loadable; keep the first of each overlap.
    return regions
        .sort((a, b) => a.address - b.address)
        .filter((region, i, sorted) => {
            const previous = sorted[i - 1]
            return !previous || region.address >= previous.address + previous.size
        })
}

/**
 * Lower sorts first: a name with fewer leading underscores (`puts` before `_IO_puts`), then a
 * global before a weak before a local one, a typed one before a bare label, the shorter, and then
 * code-unit order, so the choice never depends on the tables' order or a locale.
 */
function namePreference(symbol: ElfSymbol, name: string): number[] {
    const binding = { global: 0, unique: 0, weak: 1, local: 2, other: 3 }[symbol.binding]
    const type = symbol.type === 'notype' ? 1 : 0
    return [/^_*/.exec(name)![0].length, binding, type, name.length]
}

function compareRanks(a: SymbolName, b: SymbolName): number {
    for (let i = 0; i < a.rank.length; ++i)
        if (a.rank[i] !== b.rank[i]) return a.rank[i] - b.rank[i]
    return a.name < b.name ? -1 : a.name > b.name ? 1 : 0
}

/** RELR packs relative relocations as addresses and bitmaps of the 63 words after one. */
function readRelr(view: DataView, offset: number, size: number, into: number[]) {
    let where = 0
    for (let at = offset; at + 8 <= offset + size; at += 8) {
        const low = view.getUint32(at, true)
        const high = view.getUint32(at + 4, true)
        if (!(low & 1)) {
            where = high * 0x100000000 + low
            into.push(where)
            where += 8
            continue
        }
        for (let bit = 1; bit < 64; ++bit) {
            const set = bit < 32 ? (low >>> bit) & 1 : (high >>> (bit - 32)) & 1
            if (set) into.push(where + (bit - 1) * 8)
        }
        where += 63 * 8
    }
}

/** Reads what the Listing needs from an ELF the Core's analyser has parsed. */
export function readElfModel(
    analysis: ElfAnalysis,
    bytes: Uint8Array,
    hex: (n: number) => string
): ElfModel {
    let regions = sectionRegions(analysis, bytes)
    const fromSegments = !regions.some((region) => region.code)
    if (fromSegments) regions = segmentRegions(analysis, bytes, hex)
    const regionOf = (address: number) => {
        let low = 0
        let high = regions.length - 1
        while (low <= high) {
            const middle = (low + high) >> 1
            const region = regions[middle]
            if (region.address > address) high = middle - 1
            else if (region.address + region.size <= address) low = middle + 1
            else return region
        }
        return undefined
    }

    const symbolNames = new Map<number, SymbolName[]>()
    const addSymbol = (symbol: ElfSymbol, origin: ListingNameOrigin) => {
        if (!symbol.name || symbol.name.startsWith('.L')) return
        if (!['function', 'ifunc', 'object', 'notype'].includes(symbol.type)) return
        // Undefined, absolute and common symbols name no address of the file.
        if (symbol.sectionIndex === 0 || symbol.sectionIndex >= 0xff00) return
        const address = toNumber(symbol.value)
        if (!regionOf(address)) return
        const name = printableSymbolName(symbol.name)
        const names = symbolNames.get(address) ?? []
        if (names.some((existing) => existing.name === name)) return
        names.push({
            name,
            origin,
            rank: namePreference(symbol, name),
            size: symbol.type === 'object' ? toNumber(symbol.size) || 0 : 0,
            object: symbol.type === 'object'
        })
        symbolNames.set(address, names)
    }
    for (const symbol of analysis.symbols) addSymbol(symbol, 'symbol')
    for (const symbol of analysis.dynamicSymbols) addSymbol(symbol, 'dynamic')
    for (const names of symbolNames.values()) names.sort(compareRanks)

    const relocations = new Map<number, Relocation>()
    const addRelocation = (relocation: Relocation) => {
        if (!relocations.has(relocation.address)) relocations.set(relocation.address, relocation)
    }
    for (const relocation of analysis.relocations)
        addRelocation({
            address: toNumber(relocation.address),
            type: relocation.type,
            symbol: relocation.symbol,
            addend: toNumber(BigInt.asUintN(64, relocation.addend))
        })
    // The analyser reads only the relocation tables tied to `.dynsym`: a static binary's
    // `.rela.plt` (its ifunc slots) and RELR-packed relative relocations are read here.
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    const dynsym = analysis.sections.find((section) => section.type === 11)
    for (const section of analysis.sections) {
        if (section.offset + section.size > bytes.length) continue
        if (
            section.type === SHT_RELA &&
            section.entrySize === 24 &&
            section.link !== dynsym?.index
        ) {
            const names = analysis.sections[section.link]?.type === 2 ? analysis.symbols : []
            for (let at = section.offset; at + 24 <= section.offset + section.size; at += 24) {
                const index = view.getUint32(at + 12, true)
                addRelocation({
                    address: toNumber(view.getBigUint64(at, true)),
                    type: view.getUint32(at + 8, true),
                    symbol: names[index]?.name ?? '',
                    addend: toNumber(view.getBigUint64(at + 16, true))
                })
            }
        }
        if (section.type === SHT_RELR && section.entrySize === 8) {
            const slots: number[] = []
            readRelr(view, section.offset, section.size, slots)
            for (const address of slots) {
                const region = regionOf(address)
                if (!region || address + 8 > region.address + region.fileSize) continue
                const value = view.getBigUint64(region.offset + address - region.address, true)
                addRelocation({
                    address,
                    type: R_X86_64_RELATIVE,
                    symbol: '',
                    addend: toNumber(value)
                })
            }
        }
    }
    return { analysis, bytes, regions, fromSegments, symbolNames, relocations }
}

/** The region holding a link-time address, by binary search over the sorted regions. */
export function findRegion(regions: Region[], address: number): Region | undefined {
    let low = 0
    let high = regions.length - 1
    while (low <= high) {
        const middle = (low + high) >> 1
        const region = regions[middle]
        if (region.address > address) high = middle - 1
        else if (region.address + region.size <= address) low = middle + 1
        else return region
    }
    return undefined
}

/** The 8 bytes the file holds at a link-time address, when they fit a double exactly. */
export function readPointer(model: ElfModel, address: number): number | undefined {
    const region = findRegion(model.regions, address)
    if (!region || address + 8 > region.address + region.fileSize) return undefined
    const at = region.offset + address - region.address
    const view = new DataView(model.bytes.buffer, model.bytes.byteOffset + at, 8)
    const value = toNumber(view.getBigUint64(0, true))
    return Number.isNaN(value) ? undefined : value
}

/**
 * What a pointer-sized slot holds once the program is loaded, as a link-time address: a relative
 * relocation's addend, or else the bytes the file holds there.
 */
export function slotValue(model: ElfModel, address: number): number | undefined {
    const relocation = model.relocations.get(address)
    if (
        relocation &&
        (relocation.type === R_X86_64_RELATIVE || relocation.type === R_X86_64_IRELATIVE)
    )
        return relocation.addend
    return readPointer(model, address)
}
