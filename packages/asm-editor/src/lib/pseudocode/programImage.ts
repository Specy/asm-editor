import type { ProgramData, ProgramImage, ProgramPointer, ProgramRegion } from '@specy/decompiler'
import type { ElfAnalysis } from '#lib/listing/decoder.ts'
import type { Listing, ListingLabel } from '#lib/listing/listing.ts'
import { printableSymbolName } from '#lib/listing/names.ts'

/**
 * What the decompiler is told about an Executable: its memory and every name its Listing gives,
 * so the Pseudocode names what the Listing names, invented names included
 * ([file-views-plan.md](../../../../../docs/design/file-views-plan.md), decision 7), and the
 * package invents none of its own.
 */

const PT_LOAD = 1
const PF_X = 1
const PF_W = 2
const R_X86_64_GLOB_DAT = 6
const R_X86_64_JUMP_SLOT = 7
/** Dynamic symbols a GOT slot holds the address of an object for, not a function's. */
const OBJECT_TYPES = new Set(['object', 'tls', 'common'])
const POINTER_SIZE = 8
/**
 * How many zero bytes a segment gets past its file bytes at most. A program may reserve gigabytes
 * of `.bss`; the decompiler reads writable memory for nothing, so the rest is left unmapped.
 */
export const ZERO_FILL_LIMIT = 16 * 1024 * 1024

export type ProgramImageInput = {
    /** The Executable's bytes, its Byte edits applied (`fileBytes`): the Listing's bytes. */
    bytes: Uint8Array
    listing: Listing
    /** The ELF analysis of those bytes (`executableAnalysis`). */
    analysis: Pick<ElfAnalysis, 'programHeaders' | 'relocations' | 'dynamicSymbols'>
    /** C declarations of the library functions it calls: `@specy/decompiler/prototypes/glibc`. */
    prototypes: string
}

/** A PLT stub's label names the function it jumps to, which the prototypes bind by: `strcmp`. */
export function stubFunctionName(name: string): string {
    return name.endsWith('@plt') ? name.slice(0, -'@plt'.length) : name
}

/**
 * The decompiler's program image of an Executable, at the addresses its Listing shows (its
 * link-time addresses plus `listing.base`), so the Pseudocode prints the addresses the Listing
 * does:
 *
 * - its memory: every `PT_LOAD` segment with the file's bytes, zeros up to its size in memory
 *   (at most {@link ZERO_FILL_LIMIT} of them), read-only unless `PF_W`, executable when `PF_X`;
 *   overlapping segments, which do not load, keep the first;
 * - its functions: the Listing's, by the names operands use, a PLT stub's by the function it
 *   jumps to (`strcmp@plt` as `strcmp`, IRELATIVE ones in a static binary too);
 * - its data: every data and string label at its address, a named object with its size, a
 *   string with its length; and its strings, the Listing's named ones;
 * - its pointers: each GOT slot of a function the dynamic linker fills (a `GLOB_DAT` or
 *   `JUMP_SLOT` relocation of a symbol that is no object), so a call through
 *   `__libc_start_main@got` reads as a call of `__libc_start_main`. An IRELATIVE slot stays data:
 *   only its own stub calls through it, and what it holds is chosen when the program starts.
 */
export function programImage(input: ProgramImageInput): ProgramImage {
    const { bytes, listing, analysis } = input
    const base = listing.base
    return {
        regions: loadRegions(bytes, analysis, base),
        functions: listing.functions.map((fn) => ({
            address: fn.address + base,
            name: stubFunctionName(fn.name)
        })),
        data: dataNames(listing, base),
        strings: stringRanges(listing, base),
        pointers: functionSlots(listing, analysis, base),
        prototypes: input.prototypes
    }
}

function loadRegions(
    bytes: Uint8Array,
    analysis: ProgramImageInput['analysis'],
    base: number
): ProgramRegion[] {
    const loads = analysis.programHeaders
        .filter((header) => header.type === PT_LOAD && header.memorySize > 0n)
        .map((header) => ({ header, address: Number(header.address) + base }))
        .filter(({ header, address }) => Number.isSafeInteger(address + Number(header.memorySize)))
        .sort((a, b) => a.address - b.address)
    const regions: ProgramRegion[] = []
    let end = 0
    for (const { header, address } of loads) {
        const memorySize = Number(header.memorySize)
        if (address < end) continue
        const fileSize = Math.max(
            0,
            Math.min(header.fileSize, memorySize, bytes.length - header.offset)
        )
        const region = new Uint8Array(Math.min(memorySize, fileSize + ZERO_FILL_LIMIT))
        region.set(bytes.subarray(header.offset, header.offset + fileSize))
        regions.push({
            address,
            bytes: region,
            readOnly: !(header.flags & PF_W),
            executable: !!(header.flags & PF_X)
        })
        end = address + memorySize
    }
    return regions
}

/**
 * The name operands use at each address the labels name: the last of its labels, since the
 * Listing writes the aliases first. Block labels are inside functions, which have names already.
 */
function primaryLabels(listing: Listing): Map<number, ListingLabel> {
    const primary = new Map<number, ListingLabel>()
    for (const label of listing.labels)
        if (label.kind !== 'block') primary.set(label.address, label)
    return primary
}

/** `[start, end)` pairs as a map from start to length. */
function pairLengths(pairs: Float64Array | undefined): Map<number, number> {
    const lengths = new Map<number, number>()
    if (pairs)
        for (let i = 0; i < pairs.length; i += 2) lengths.set(pairs[i], pairs[i + 1] - pairs[i])
    return lengths
}

function dataNames(listing: Listing, base: number): ProgramData[] {
    const objects = pairLengths(listing.holders?.objects)
    const strings = pairLengths(listing.holders?.strings)
    const data: ProgramData[] = []
    for (const label of primaryLabels(listing).values()) {
        if (label.kind !== 'data' && label.kind !== 'string') continue
        const size =
            label.origin === 'got'
                ? POINTER_SIZE
                : (objects.get(label.address) ?? strings.get(label.address))
        data.push({
            address: label.address + base,
            name: label.name,
            ...(size ? { size } : {})
        })
    }
    return data
}

function stringRanges(listing: Listing, base: number) {
    return [...pairLengths(listing.holders?.strings)].map(([address, length]) => ({
        address: address + base,
        length
    }))
}

function functionSlots(
    listing: Listing,
    analysis: ProgramImageInput['analysis'],
    base: number
): ProgramPointer[] {
    // The first relocation of an address, as the Listing reads them.
    const relocations = new Map<number, ProgramImageInput['analysis']['relocations'][number]>()
    for (const relocation of analysis.relocations) {
        const address = Number(relocation.address)
        if (!relocations.has(address)) relocations.set(address, relocation)
    }
    const objects = new Set(
        analysis.dynamicSymbols
            .filter((symbol) => OBJECT_TYPES.has(symbol.type))
            .map((symbol) => symbol.name)
    )
    const pointers: ProgramPointer[] = []
    for (const label of primaryLabels(listing).values()) {
        if (label.origin !== 'got') continue
        const relocation = relocations.get(label.address)
        if (!relocation?.symbol || objects.has(relocation.symbol)) continue
        if (relocation.type !== R_X86_64_GLOB_DAT && relocation.type !== R_X86_64_JUMP_SLOT)
            continue
        pointers.push({
            address: label.address + base,
            name: printableSymbolName(relocation.symbol)
        })
    }
    return pointers
}
