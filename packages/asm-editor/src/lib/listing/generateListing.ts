import type { DecodedInstruction, ListingDecoder } from './decoder'
import {
    findRegion,
    readElfModel,
    R_X86_64_GLOB_DAT,
    R_X86_64_IRELATIVE,
    R_X86_64_JUMP_SLOT,
    R_X86_64_RELATIVE,
    slotValue,
    type Region
} from './elfModel'
import {
    LINE_KIND,
    type Listing,
    type ListingFunction,
    type ListingLabel,
    type ListingLabelKind,
    type ListingNameOrigin,
    type ListingNameVersion
} from './listing'
import { inventName, numberedName, printableSymbolName, stringLabelBase } from './names'

export type ListingInput = {
    /** The ELF: an Executable's bytes, or a shared library's. */
    bytes: Uint8Array
    /** Named in the header: the Executable's File name, or the library's soname. */
    name: string
    /**
     * What the program's link-time addresses are shifted by at run time: where a PIE or a library
     * is loaded (the Core's loaded objects, or `0x555555554000` for a PIE before a run), 0 for a
     * program at fixed addresses. Every address the text prints is a run-time one.
     */
    base: number | bigint
    version: ListingNameVersion
    /** Called now and then with the share of the work done, from 0 to 1. */
    onProgress?: (fraction: number) => void
}

/** An input the generator cannot make a Listing of, with the reason a person can read. */
export class ListingError extends Error {}

/** A run of bytes inside code that is listed as data: an object symbol, or bytes no instruction covers. */
type CodeData = { data: true; address: number; size: number }
type CodeEntry = DecodedInstruction | CodeData
/** A stretch of code still to decode. */
type CodePiece = { data: false; address: number; size: number }

type Name = { name: string; origin: ListingNameOrigin }

/** An instruction that sets `rdi` to an address, the way `_start` passes `main`. */
const SETS_RDI = /^(?:lea|mov) (?:rdi|edi),/
const WRITES_RDI = /^(?!cmp |test |bt |push )\S+ (?:rdi|edi|di|dil)\b/

const PRINTABLE = new Uint8Array(256)
for (let byte = 0x20; byte < 0x7f; ++byte) PRINTABLE[byte] = 1
PRINTABLE[9] = PRINTABLE[10] = 1

const MIN_STRING = 4
const STRING_LINE = 64
const ZERO_RUN = 64
const COMMENT_COLUMN = 40
const COMMENT_STRING = 40

/** The index of the last value at or below `value` in an ascending array, or -1. */
function floorIndex(sorted: Float64Array, value: number): number {
    let low = 0
    let high = sorted.length - 1
    let found = -1
    while (low <= high) {
        const middle = (low + high) >> 1
        if (sorted[middle] <= value) {
            found = middle
            low = middle + 1
        } else high = middle - 1
    }
    return found
}

function hexByte(byte: number) {
    return `0x${byte < 16 ? '0' : ''}${byte.toString(16)}`
}

function cEscape(text: string): string {
    let out = ''
    for (const char of text) {
        const code = char.charCodeAt(0)
        if (char === '\n') out += '\\n'
        else if (char === '\t') out += '\\t'
        else if (char === '"' || char === '\\') out += `\\${char}`
        else if (code < 0x20 || code > 0x7e) out += `\\x${code.toString(16).padStart(2, '0')}`
        else out += char
    }
    return out
}

/**
 * Generates the Listing of an x86-64 ELF: its code decoded linearly and labelled, then its data.
 * Pure and deterministic: the same bytes, base and version give the same text, byte for byte.
 */
export function generateListing(decoder: ListingDecoder, input: ListingInput): Listing {
    const { bytes, version } = input
    const base = Number(input.base)
    const progress = input.onProgress ?? (() => undefined)
    const hex = (address: number) => `0x${(address + base).toString(16)}`

    const analysis = decoder.analyze(bytes)
    if (!analysis.isElf) throw new ListingError('not an ELF file')
    const machine = bytes.length >= 20 ? bytes[18] | (bytes[19] << 8) : 0
    if (bytes[4] !== 2 || bytes[5] !== 1 || machine !== 62)
        throw new ListingError(analysis.reason ?? 'not an x86-64 ELF file')
    const model = readElfModel(analysis, bytes, hex)
    const { regions } = model
    if (!regions.length)
        throw new ListingError(analysis.reason ?? 'an ELF file with nothing to list')
    const codeRegions = regions.filter((region) => region.code)
    const entry = Number(analysis.entry)

    // Names the file gives, by address; invented ones come later, once the starts are known.
    const used = new Map<string, number>()
    const namesAt = new Map<number, Name[]>()
    const taken = (name: string) => used.has(name)
    const claim = (address: number, name: string, origin: ListingNameOrigin) => {
        if (used.get(name) === address) return
        const unique = numberedName(name, taken)
        used.set(unique, address)
        const names = namesAt.get(address) ?? []
        names.push({ name: unique, origin })
        namesAt.set(address, names)
    }
    for (const address of [...model.symbolNames.keys()].sort((a, b) => a - b))
        for (const symbol of model.symbolNames.get(address)!)
            claim(address, symbol.name, symbol.origin)
    const symbolNamesAt = (address: number) =>
        (model.symbolNames.get(address) ?? []).map((symbol) => symbol.name)

    // Object symbols inside code are data, not instructions.
    const codeData = new Map<Region, CodeData[]>()
    for (const [address, symbols] of model.symbolNames) {
        const region = findRegion(regions, address)
        if (!region?.code) continue
        const size = Math.max(0, ...symbols.filter((symbol) => symbol.object).map((s) => s.size))
        if (!size) continue
        const end = Math.min(address + size, region.address + region.fileSize)
        if (end > address) {
            const list = codeData.get(region) ?? []
            list.push({ data: true, address, size: end - address })
            codeData.set(region, list)
        }
    }
    for (const list of codeData.values()) {
        list.sort((a, b) => a.address - b.address)
        for (let i = 1; i < list.length; ++i) {
            const previous = list[i - 1]
            if (list[i].address < previous.address + previous.size) {
                previous.size = Math.max(
                    previous.size,
                    list[i].address + list[i].size - previous.address
                )
                list.splice(i--, 1)
            }
        }
    }

    // Where decoding must start afresh: a symbol, a stub, the entry point, a function pointer.
    const anchors = new Set<number>()
    for (const address of model.symbolNames.keys()) anchors.add(address)
    anchors.add(entry)
    if (model.fromSegments) for (const stub of analysis.plt) anchors.add(Number(stub.address))
    const codePointers = new Set<number>()
    for (const relocation of model.relocations.values())
        if (relocation.type === R_X86_64_RELATIVE || relocation.type === R_X86_64_IRELATIVE)
            codePointers.add(relocation.addend)
    for (const region of regions) {
        if (!region.functionPointers) continue
        for (let at = region.address; at + 8 <= region.address + region.fileSize; at += 8) {
            const value = slotValue(model, at)
            if (value) codePointers.add(value)
        }
    }
    for (const pointer of codePointers) if (findRegion(regions, pointer)?.code) anchors.add(pointer)

    // Decoding, region by region.
    const totalCode = codeRegions.reduce((sum, region) => sum + region.fileSize, 0) || 1
    let decoded = 0
    const entries = new Map<Region, CodeEntry[]>()
    const decodeRange = (start: number, end: number, region: Region) => {
        const from = region.offset + start - region.address
        return decoder.disassemble(bytes.subarray(from, from + end - start), BigInt(start))
    }
    const decodeRegion = (region: Region) => {
        const out: CodeEntry[] = []
        const end = region.address + region.fileSize
        const regionAnchors = [...anchors]
            .filter((address) => address > region.address && address < end)
            .sort((a, b) => a - b)
        const data = codeData.get(region) ?? []
        // Code pieces between the data ranges, each decoded linearly.
        let cursor = region.address
        const pieces: (CodeData | CodePiece)[] = []
        for (const range of data) {
            if (range.address > cursor)
                pieces.push({ data: false, address: cursor, size: range.address - cursor })
            pieces.push(range)
            cursor = Math.max(cursor, range.address + range.size)
        }
        if (cursor < end) pieces.push({ data: false, address: cursor, size: end - cursor })
        for (const piece of pieces) {
            if (piece.data) {
                out.push(piece)
                continue
            }
            const start = piece.address
            const stop = start + piece.size
            const inside = regionAnchors.filter((address) => address > start && address < stop)
            const list = decodeRange(start, stop, region)
            let next = 0
            let resync = -1
            for (const instruction of list) {
                const address = Number(instruction.address)
                while (next < inside.length && inside[next] <= address) ++next
                if (next < inside.length && inside[next] < address + instruction.length) {
                    // An anchor inside this instruction: the bytes before it are listed as data,
                    // and from there each stretch between anchors is decoded on its own.
                    out.push({ data: true, address, size: inside[next] - address })
                    resync = next
                    break
                }
                out.push(instruction)
            }
            if (resync >= 0)
                for (let i = resync; i < inside.length; ++i)
                    for (const instruction of decodeRange(inside[i], inside[i + 1] ?? stop, region))
                        out.push(instruction)
        }
        decoded += region.fileSize
        progress(0.5 * (decoded / totalCode))
        return out
    }
    for (const region of codeRegions) entries.set(region, decodeRegion(region))

    // Instruction starts, for checking that an address is one.
    let starts = new Float64Array(0)
    const indexStarts = () => {
        let count = 0
        for (const list of entries.values()) count += list.length
        starts = new Float64Array(count)
        let at = 0
        for (const region of codeRegions)
            for (const item of entries.get(region)!)
                if (!('data' in item)) starts[at++] = Number(item.address)
        starts = starts.subarray(0, at)
    }
    indexStarts()
    const isStart = (address: number) => starts[floorIndex(starts, address)] === address

    // GOT slots, named after their relocation's symbol (an IRELATIVE one after the ifunc it calls).
    const slotName = (address: number): string | undefined => {
        const relocation = model.relocations.get(address)
        if (!relocation) return undefined
        if (relocation.type === R_X86_64_GLOB_DAT || relocation.type === R_X86_64_JUMP_SLOT)
            return relocation.symbol || undefined
        if (relocation.type === R_X86_64_IRELATIVE) return symbolNamesAt(relocation.addend)[0]
        return undefined
    }
    // PLT stubs, which the Core names after the slot each one jumps through: `name@plt`, and
    // `name@plt_resolver` for the lazy stubs `.plt` holds beside `.plt.sec`. Without section
    // headers it finds them by their shape in the executable segments.
    const stubs = new Map<number, string>()
    for (const stub of analysis.plt) {
        const address = Number(stub.address)
        if (isStart(address)) stubs.set(address, printableSymbolName(stub.name))
    }
    const instructionsFrom = (address: number, count: number): DecodedInstruction[] => {
        const region = findRegion(codeRegions, address)
        const list = region && entries.get(region)
        if (!list) return []
        let low = 0
        let high = list.length - 1
        while (low < high) {
            const middle = (low + high) >> 1
            if (Number(list[middle].address) < address) low = middle + 1
            else high = middle
        }
        const out: DecodedInstruction[] = []
        for (let i = low; i < list.length && out.length < count; ++i) {
            const item = list[i]
            if ('data' in item) break
            if (Number(item.address) >= address) out.push(item)
        }
        return out
    }
    for (const address of [...stubs.keys()].sort((a, b) => a - b))
        if (!namesAt.has(address)) claim(address, stubs.get(address)!, 'plt')
    const gotSlots = [...model.relocations.values()]
        .filter((relocation) => !findRegion(regions, relocation.address)?.code)
        .map((relocation) => [relocation.address, slotName(relocation.address)] as const)
        .filter((slot): slot is readonly [number, string] => !!slot[1])
        .sort((a, b) => a[0] - b[0])
    for (const [address, name] of gotSlots)
        if (findRegion(regions, address)) claim(address, `${name}@got`, 'got')

    // `main`: the address `_start` passes to `__libc_start_main` in `rdi`.
    const calledName = (instruction: DecodedInstruction): string[] => {
        for (const operand of instruction.operands) {
            if (operand.branchTarget !== undefined) {
                const target = Number(operand.branchTarget)
                return [
                    ...symbolNamesAt(target),
                    ...(stubs.has(target) ? [stubs.get(target)!] : [])
                ]
            }
            if (operand.memoryTarget !== undefined) {
                const name = slotName(Number(operand.memoryTarget))
                return name ? [name] : []
            }
        }
        return []
    }
    let main: number | undefined = [...model.symbolNames].find(([, names]) =>
        names.some((symbol) => symbol.name === 'main')
    )?.[0]
    if (main === undefined && entry && isStart(entry)) {
        const start = instructionsFrom(entry, 64)
        let candidate: number | undefined
        for (let i = 0; i < start.length; ++i) {
            const instruction = start[i]
            if (instruction.isCall) {
                const names = calledName(instruction)
                const startMain = names.some(
                    (name) => name.replace(/@plt$/, '') === '__libc_start_main'
                )
                // A stripped static binary names nothing; glibc's `_start` is still the one
                // call that never returns, so `hlt` follows it.
                const halts = !names.length && start[i + 1]?.mnemonic === 'hlt'
                if ((startMain || halts) && candidate !== undefined) main = candidate
                break
            }
            if (instruction.isReturn || (instruction.isJump && !instruction.isConditional)) break
            if (SETS_RDI.test(instruction.text)) {
                const memory = instruction.operands.find((o) => o.memoryTarget !== undefined)
                const immediate = instruction.operands.find((o) => o.immediate !== undefined)
                if (instruction.text.startsWith('lea') && memory)
                    candidate = Number(memory.memoryTarget)
                else if (
                    instruction.text.startsWith('mov') &&
                    immediate &&
                    !instruction.text.includes('[')
                )
                    candidate = Number(immediate.immediate)
                else candidate = undefined
            } else if (WRITES_RDI.test(instruction.text)) candidate = undefined
        }
        if (main !== undefined && !findRegion(codeRegions, main)) main = undefined
    }
    if (main !== undefined && !isStart(main)) {
        // Linear decoding ran across `main`'s first byte: decode its region again from there.
        anchors.add(main)
        const region = findRegion(codeRegions, main)!
        entries.set(region, decodeRegion(region))
        indexStarts()
    }
    if (main !== undefined && !isStart(main)) main = undefined
    if (main !== undefined && !namesAt.has(main)) claim(main, 'main', 'main')
    if (entry && isStart(entry) && !namesAt.has(entry)) claim(entry, '_start', 'entry')

    // Function starts: names, stubs, entry, main, region starts, function pointers, call targets.
    const functionStarts = new Set<number>()
    for (const region of codeRegions) {
        const list = entries.get(region)!
        const first = list.find((item) => !('data' in item))
        if (first && Number(first.address) === region.address) functionStarts.add(region.address)
        for (const item of list) {
            if ('data' in item) continue
            const address = Number(item.address)
            const names = namesAt.get(address)
            if (names?.some((name) => name.origin !== 'got')) functionStarts.add(address)
            if (codePointers.has(address)) functionStarts.add(address)
            if (item.isCall)
                for (const operand of item.operands)
                    if (operand.branchTarget !== undefined) {
                        const target = Number(operand.branchTarget)
                        if (isStart(target)) functionStarts.add(target)
                    }
        }
    }
    const sortedStarts = Float64Array.from(functionStarts).sort()
    for (const address of sortedStarts)
        if (!namesAt.has(address))
            claim(address, inventName('FUN_', address, taken, version), 'invented')
    const functionEnd = new Float64Array(sortedStarts.length)
    sortedStarts.forEach((address, i) => {
        const region = findRegion(codeRegions, address)!
        const regionEnd = region.address + region.size
        functionEnd[i] =
            i + 1 < sortedStarts.length ? Math.min(sortedStarts[i + 1], regionEnd) : regionEnd
    })
    const functionAt = (address: number) => {
        const index = floorIndex(sortedStarts, address)
        return index >= 0 && address < functionEnd[index] ? index : -1
    }
    const primary = (address: number) => namesAt.get(address)![0].name

    // Blocks: jump targets inside a function, numbered in address order within it.
    const blockTargets = new Set<number>()
    for (const list of entries.values())
        for (const item of list) {
            if ('data' in item || !item.isJump) continue
            for (const operand of item.operands)
                if (operand.branchTarget !== undefined) {
                    const target = Number(operand.branchTarget)
                    if (!functionStarts.has(target) && isStart(target) && functionAt(target) >= 0)
                        blockTargets.add(target)
                }
        }
    const blockNumber = new Map<number, number>()
    {
        let currentFunction = -1
        let counter = 0
        for (const target of Float64Array.from(blockTargets).sort()) {
            const owner = functionAt(target)
            if (owner !== currentFunction) {
                currentFunction = owner
                counter = 0
            }
            blockNumber.set(target, ++counter)
        }
    }
    progress(0.55)

    // Data: strings, then labels for every address the code reaches that has none.
    const dataRegions = regions.filter((region) => !region.code)
    const strings = new Map<number, number>()
    const objectAt = new Map<number, number>()
    for (const [address, symbols] of model.symbolNames) {
        const size = Math.max(0, ...symbols.filter((symbol) => symbol.object).map((s) => s.size))
        if (size) objectAt.set(address, size)
    }
    const objectStarts = Float64Array.from(objectAt.keys()).sort()
    const containingObject = (address: number) => {
        const start = objectStarts[floorIndex(objectStarts, address)]
        return start !== undefined && address < start + objectAt.get(start)! ? start : undefined
    }
    const fileByte = (region: Region, address: number) =>
        bytes[region.offset + address - region.address]
    /** A NUL-terminated run of printable bytes starting at `address`, as its length without the NUL. */
    const stringLength = (region: Region, address: number) => {
        const end = region.address + region.fileSize
        for (let at = address; at < end; ++at) {
            const byte = fileByte(region, at)
            if (byte === 0) return at - address
            if (!PRINTABLE[byte]) return -1
        }
        return -1
    }
    for (const region of dataRegions) {
        if (!region.strings) continue
        const end = region.address + region.fileSize
        let nextObject = objectStarts.findIndex((address) => address >= region.address)
        if (nextObject < 0) nextObject = objectStarts.length
        let objectStart = -1
        let objectEnd = -1
        let runStart = -1
        for (let at = region.address; at < end; ++at) {
            if (objectStarts[nextObject] === at) {
                objectStart = at
                objectEnd = at + objectAt.get(at)!
                ++nextObject
            }
            if (namesAt.has(at)) runStart = -1
            // Inside an object, only a string that starts at the object's own start counts.
            if (at > objectStart && at < objectEnd && runStart !== objectStart) {
                runStart = -1
                continue
            }
            const byte = fileByte(region, at)
            if (byte === 0) {
                if (runStart >= 0 && at - runStart >= MIN_STRING)
                    strings.set(runStart, at + 1 - runStart)
                runStart = -1
            } else if (!PRINTABLE[byte]) runStart = -1
            else if (runStart < 0) runStart = at
        }
    }
    const stringStarts = () => Float64Array.from(strings.keys()).sort()
    let sortedStrings = stringStarts()
    const containingString = (address: number) => {
        const start = sortedStrings[floorIndex(sortedStrings, address)]
        return start !== undefined && address < start + strings.get(start)! ? start : undefined
    }
    const referenced = new Set<number>()
    for (const list of entries.values())
        for (const item of list) {
            if ('data' in item) continue
            for (const operand of item.operands)
                if (operand.memoryTarget !== undefined) referenced.add(Number(operand.memoryTarget))
        }
    const dataLabels: number[] = []
    // A referenced address that starts a shorter string than the scan looks for (`"\n"`) is a
    // string too; one inside a string or an object is named from the string's or object's label.
    let referencedStringEnd = -1
    for (const target of Float64Array.from(referenced).sort()) {
        const region = findRegion(dataRegions, target)
        if (!region || namesAt.has(target) || target < referencedStringEnd) continue
        const object = containingObject(target)
        if (object !== undefined && object !== target) continue
        const string = containingString(target)
        if (string !== undefined) {
            // A string the code reaches only part way in starts there: the bytes before it were
            // printable by chance (`@@atexit handler`).
            if (!referenced.has(string) && !namesAt.has(string)) {
                const end = string + strings.get(string)!
                strings.delete(string)
                strings.set(target, end - target)
                sortedStrings[sortedStrings.indexOf(string)] = target
            }
            continue
        }
        if (region.strings && target < region.address + region.fileSize) {
            const length = stringLength(region, target)
            if (length > 0) {
                strings.set(target, length + 1)
                referencedStringEnd = target + length + 1
                continue
            }
        }
        dataLabels.push(target)
    }
    sortedStrings = stringStarts()
    const stringTexts = new Map<number, string>()
    const stringText = (address: number) => {
        let text = stringTexts.get(address)
        if (text === undefined) {
            const region = findRegion(regions, address)!
            const from = region.offset + address - region.address
            text = ''
            for (let at = from; at < from + strings.get(address)! - 1; ++at)
                text += String.fromCharCode(bytes[at])
            stringTexts.set(address, text)
        }
        return text
    }
    for (const address of sortedStrings) {
        if (namesAt.has(address)) continue
        const label = stringLabelBase(stringText(address))
        if (label) claim(address, label, 'string')
        else dataLabels.push(address)
    }
    dataLabels.sort((a, b) => a - b)
    for (const address of dataLabels)
        if (!namesAt.has(address))
            claim(address, inventName('DAT_', address, taken, version), 'invented')
    progress(0.6)

    // How an operand names an address, from inside a given function.
    const blockName = (target: number, from: number) => {
        const owner = functionAt(target)
        const local = `.LAB_${blockNumber.get(target)}`
        return owner === from ? local : `${primary(sortedStarts[owner])}${local}`
    }
    const offsetName = (name: string, offset: number) =>
        offset ? `${name}+0x${offset.toString(16)}` : name
    const addressName = (target: number, from: number): string | undefined => {
        if (namesAt.has(target)) return primary(target)
        if (blockNumber.has(target)) return blockName(target, from)
        const object = containingObject(target)
        if (object !== undefined && namesAt.has(object))
            return offsetName(primary(object), target - object)
        const string = containingString(target)
        if (string !== undefined && namesAt.has(string))
            return offsetName(primary(string), target - string)
        const owner = findRegion(codeRegions, target) ? functionAt(target) : -1
        if (owner >= 0)
            return offsetName(primary(sortedStarts[owner]), target - sortedStarts[owner])
        return undefined
    }
    const stringComment = (target: number) => {
        const string = containingString(target)
        if (string === undefined) return undefined
        const text = stringText(string).slice(target - string)
        const shown = text.length > COMMENT_STRING ? `${text.slice(0, COMMENT_STRING)}...` : text
        return `"${cEscape(shown)}"`
    }
    const absolute = !analysis.pie
    const relocatable = analysis.type === 3
    const instructionLine = (instruction: DecodedInstruction, from: number) => {
        let text = instruction.text
        const comments: string[] = []
        const edits: [number, number, string][] = []
        for (const operand of instruction.operands) {
            if (operand.textStart === undefined || operand.textEnd === undefined) {
                if (absolute && operand.immediate !== undefined) {
                    const value = Number(operand.immediate)
                    if (namesAt.has(value) && !blockNumber.has(value)) {
                        const string = strings.has(value) ? stringComment(value) : undefined
                        comments.push(string ? `${primary(value)} ${string}` : primary(value))
                    }
                }
                continue
            }
            if (operand.branchTarget !== undefined) {
                const target = Number(operand.branchTarget)
                edits.push([
                    operand.textStart,
                    operand.textEnd,
                    addressName(target, from) ?? hex(target)
                ])
            } else if (operand.memoryTarget !== undefined) {
                const target = Number(operand.memoryTarget)
                edits.push([
                    operand.textStart,
                    operand.textEnd,
                    `[rel ${addressName(target, from) ?? hex(target)}]`
                ])
                const string = stringComment(target)
                if (string) comments.push(string)
            }
        }
        edits.sort((a, b) => b[0] - a[0])
        for (const [start, end, replacement] of edits)
            text = text.slice(0, start) + replacement + text.slice(end)
        if (absolute && text.includes('[0x')) {
            const match = /(?<![:\w])\[0x([\da-f]+)\]/.exec(text)
            const value = match ? parseInt(match[1], 16) : Number.NaN
            if (namesAt.has(value) && !blockNumber.has(value)) comments.push(primary(value))
        }
        text = `    ${text}`
        if (comments.length) text = `${text.padEnd(COMMENT_COLUMN - 1)} ; ${comments.join(', ')}`
        return text
    }

    // The text and its line table.
    const text: string[] = []
    const kinds: number[] = []
    const lineAddresses: number[] = []
    const lineSizes: number[] = []
    const lineOffsets: number[] = []
    const labels: ListingLabel[] = []
    const functions: ListingFunction[] = []
    const regionLines: [Region, number, number][] = []
    const emit = (kind: number, line: string, address = -1, size = 0, offset = -1) => {
        text.push(line)
        kinds.push(kind)
        lineAddresses.push(address)
        lineSizes.push(size)
        lineOffsets.push(offset)
    }
    const label = (
        name: string,
        fullName: string,
        kind: ListingLabelKind,
        origin: ListingNameOrigin,
        address: number
    ) => labels.push({ name, fullName, kind, origin, address, line: text.length })

    for (const line of header()) emit(LINE_KIND.comment, line)
    // Where data must start a new line: a label, a string, the end of an object.
    const boundaries = Float64Array.from(
        new Set([
            ...namesAt.keys(),
            ...strings.keys(),
            ...[...objectAt].map(([address, size]) => address + size)
        ])
    ).sort()

    const regionTitle = (region: Region) => {
        emit(LINE_KIND.blank, '')
        emit(LINE_KIND.section, region.title, region.address)
    }
    let emitted = 0
    const totalEntries = [...entries.values()].reduce((sum, list) => sum + list.length, 0) || 1
    for (const region of codeRegions) {
        regionTitle(region)
        const first = text.length
        let owner = -1
        let open: ListingFunction | undefined
        for (const item of entries.get(region)!) {
            const address = Number(item.address)
            if (functionStarts.has(address)) {
                owner = functionAt(address)
                if (open) open.endLine = text.length
                emit(LINE_KIND.blank, '')
                open = {
                    name: primary(address),
                    address,
                    end: functionEnd[owner],
                    line: text.length,
                    endLine: text.length
                }
                functions.push(open)
            }
            if ('data' in item) {
                emitData(region, item.address, item.address + item.size, false)
                continue
            }
            // Aliases first: a `.LAB_n` below belongs, as in NASM, to the label just above it,
            // which is the name operands use.
            const [primaryName, ...aliases] = namesAt.get(address) ?? []
            for (const { name, origin } of primaryName ? [...aliases, primaryName] : []) {
                if (name === primaryName.name && open?.address === address) open.line = text.length
                label(name, name, 'function', origin, address)
                emit(LINE_KIND.label, `${name}:`, address)
            }
            const block = blockNumber.get(address)
            if (block !== undefined) {
                label(`.LAB_${block}`, blockName(address, -2), 'block', 'block', address)
                emit(LINE_KIND.label, `.LAB_${block}:`, address)
            }
            emit(
                LINE_KIND.instruction,
                instructionLine(item, owner),
                address,
                item.length,
                region.offset + address - region.address
            )
            if (++emitted % 8192 === 0) progress(0.6 + 0.35 * (emitted / totalEntries))
        }
        if (region.fileSize < region.size)
            emitData(region, region.address + region.fileSize, region.address + region.size, false)
        if (open) open.endLine = text.length
        regionLines.push([region, first, text.length])
    }
    for (const region of dataRegions) {
        regionTitle(region)
        const first = text.length
        emitData(region, region.address, region.address + region.size, true)
        regionLines.push([region, first, text.length])
    }

    /**
     * Lists `[start, end)` of a region as data, a line per string, pointer, zero run or 16 bytes,
     * starting a new line at every label. In a data section a label goes on its first line
     * (`s_Hi: db "Hi", 0`), as NASM programs write data; inside code, on a line of its own.
     */
    function emitData(region: Region, start: number, end: number, inline: boolean) {
        const fileEnd = region.address + region.fileSize
        let next = 0
        let high = boundaries.length
        while (next < high) {
            const middle = (next + high) >> 1
            if (boundaries[middle] <= start) next = middle + 1
            else high = middle
        }
        let at = start
        while (at < end) {
            while (next < boundaries.length && boundaries[next] <= at) ++next
            const limit = next < boundaries.length ? Math.min(boundaries[next], end) : end
            let prefix = ''
            // Aliases first, then the name operands use, on the data itself when inline.
            const [first, ...aliases] = namesAt.get(at) ?? []
            const names = first ? [...aliases, first] : []
            const kind: ListingLabelKind = strings.has(at) ? 'string' : 'data'
            names.forEach(({ name, origin }, i) => {
                label(name, name, kind, origin, at)
                if (inline && i === names.length - 1) prefix = `${name}: `
                else emit(LINE_KIND.label, `${name}:`, at)
            })
            const linePrefix = prefix || '    '
            if (at >= fileEnd) {
                const size = limit - at
                emit(LINE_KIND.data, `${linePrefix}resb ${size}`, at, size)
                at = limit
                continue
            }
            const offset = region.offset + at - region.address
            const stringSize = strings.get(at)
            if (stringSize !== undefined && at + stringSize <= Math.min(limit, fileEnd)) {
                let lineStart = at
                let first = true
                while (lineStart < at + stringSize) {
                    let lineEnd = lineStart
                    while (lineEnd < at + stringSize && lineEnd - lineStart < STRING_LINE) {
                        const byte = fileByte(region, lineEnd++)
                        if (byte === 10) break
                    }
                    if (lineEnd === at + stringSize - 1) lineEnd++
                    emit(
                        LINE_KIND.data,
                        `${first ? linePrefix : '    '}db ${stringOperands(region, lineStart, lineEnd)}`,
                        lineStart,
                        lineEnd - lineStart,
                        region.offset + lineStart - region.address
                    )
                    first = false
                    lineStart = lineEnd
                }
                at += stringSize
                continue
            }
            const stop = Math.min(limit, fileEnd)
            const pointer = at % 8 === 0 && at + 8 <= stop ? pointerAt(at) : undefined
            if (pointer !== undefined) {
                emit(LINE_KIND.data, `${linePrefix}dq ${pointer}`, at, 8, offset)
                at += 8
                continue
            }
            let zeros = at
            while (zeros < stop && fileByte(region, zeros) === 0 && !model.relocations.has(zeros))
                ++zeros
            if (zeros - at >= ZERO_RUN) {
                emit(
                    LINE_KIND.data,
                    `${linePrefix}times ${zeros - at} db 0`,
                    at,
                    zeros - at,
                    offset
                )
                at = zeros
                continue
            }
            let lineEnd = Math.min(stop, (Math.floor(at / 16) + 1) * 16)
            for (
                let slot = Math.ceil((at + 1) / 8) * 8;
                slot + 8 <= stop && slot < lineEnd;
                slot += 8
            ) {
                if (pointerAt(slot) !== undefined) {
                    lineEnd = slot
                    break
                }
            }
            const values: string[] = []
            for (let byte = at; byte < lineEnd; ++byte) values.push(hexByte(fileByte(region, byte)))
            emit(LINE_KIND.data, `${linePrefix}db ${values.join(', ')}`, at, lineEnd - at, offset)
            at = lineEnd
        }
    }

    /**
     * What an 8-byte slot holds when it is a pointer: a label, or for a relocated slot without one,
     * the address or value it gets. In a position-independent file only a slot the dynamic linker
     * relocates is a pointer, since small numbers there look just like its link-time addresses; at
     * fixed addresses a value that equals a label's address is taken for one too.
     */
    function pointerAt(address: number): string | undefined {
        const relocation = model.relocations.get(address)
        if (!relocation && relocatable) return undefined
        const value = slotValue(model, address)
        if (value !== undefined && value !== 0 && namesAt.has(value) && !blockNumber.has(value))
            return primary(value)
        if (!relocation) return undefined
        if (relocation.type === R_X86_64_RELATIVE || relocation.type === R_X86_64_IRELATIVE)
            return value === undefined ? undefined : hex(value)
        return value === undefined ? undefined : value ? `0x${value.toString(16)}` : '0'
    }

    function stringOperands(region: Region, start: number, end: number) {
        const parts: string[] = []
        let quoted = ''
        for (let at = start; at < end; ++at) {
            const byte = fileByte(region, at)
            if (byte >= 0x20 && byte < 0x7f && byte !== 0x22) quoted += String.fromCharCode(byte)
            else {
                if (quoted) parts.push(`"${quoted}"`)
                quoted = ''
                parts.push(String(byte))
            }
        }
        if (quoted) parts.push(`"${quoted}"`)
        return parts.join(', ')
    }

    function header(): string[] {
        const lines = [`; ${input.name.replace(/[\r\n]/g, ' ')}`]
        const kind = analysis.soname
            ? `shared library ${analysis.soname}`
            : analysis.pie
              ? 'position-independent executable (PIE)'
              : 'executable at fixed addresses (not PIE)'
        lines.push(`; ELF64 x86-64 ${kind}${base ? `, loaded at ${hex(0)}` : ''}`)
        if (analysis.interpreter || analysis.needed.length) {
            const parts = []
            if (analysis.interpreter) parts.push(`interpreter ${analysis.interpreter}`)
            if (analysis.needed.length) parts.push(`needs ${analysis.needed.join(', ')}`)
            lines.push(`; Dynamically linked: ${parts.join('; ')}`)
        } else lines.push('; Statically linked: no dynamic linker, no shared libraries')
        lines.push(
            analysis.stripped
                ? `; Stripped: no symbol table; other names come from dynamic symbols, relocations and invented words (${version})`
                : `; Not stripped: names come from its symbol table, with invented words (${version}) for the rest`
        )
        if (model.fromSegments)
            lines.push('; No usable section headers: code and data are listed by load segment')
        if (entry)
            lines.push(
                `; Entry point: ${hex(entry)}${namesAt.has(entry) ? ` (${primary(entry)})` : ''}`
            )
        if (main !== undefined && namesAt.get(main)?.[0].origin === 'main')
            lines.push(`; main: ${hex(main)}, the address _start passes to __libc_start_main`)
        lines.push(
            '; Generated from the file, read-only and never saved: nothing builds from this Listing.'
        )
        return lines
    }

    // Lines covering bytes, in address order: each region's lines already are.
    regionLines.sort((a, b) => a[0].address - b[0].address)
    const byAddress: number[] = []
    for (const [, first, last] of regionLines)
        for (let line = first; line < last; ++line) if (lineSizes[line] > 0) byAddress.push(line)
    progress(1)
    return {
        version,
        base,
        text: text.join('\n') + '\n',
        lines: {
            kinds: Uint8Array.from(kinds),
            addresses: Float64Array.from(lineAddresses),
            sizes: Float64Array.from(lineSizes),
            offsets: Float64Array.from(lineOffsets),
            byAddress: Int32Array.from(byAddress)
        },
        labels,
        functions,
        entry,
        main
    }
}
