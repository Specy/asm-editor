import type { DecodedInstruction, ListingDecoder } from './decoder'
import {
    type ElfModel,
    findRegion,
    readElfModel,
    R_X86_64_GLOB_DAT,
    R_X86_64_IRELATIVE,
    R_X86_64_JUMP_SLOT
} from './elfModel'
import { printableSymbolName } from './names'

/**
 * Where an Executable's own code begins: its entry point, and `main`, which a Build runs to
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 11). The generator
 * names `main` by these rules, and a Build finds it by them without waiting for the whole Listing.
 */

/** An instruction that sets `rdi` to an address, the way `_start` passes `main`. */
const SETS_RDI = /^(?:lea|mov) (?:rdi|edi),/
const WRITES_RDI = /^(?!cmp |test |bt |push )\S+ (?:rdi|edi|di|dil)\b/
/** How many of `_start`'s instructions are looked at for the call that passes `main`. */
export const START_INSTRUCTIONS = 64

/** The names a symbol table gives an address, best first. */
export function symbolNamesAt(model: ElfModel, address: number): string[] {
    return (model.symbolNames.get(address) ?? []).map((symbol) => symbol.name)
}

/** A GOT slot's name, its relocation's symbol (an IRELATIVE slot's, the ifunc it calls). */
export function slotName(model: ElfModel, address: number): string | undefined {
    const relocation = model.relocations.get(address)
    if (!relocation) return undefined
    if (relocation.type === R_X86_64_GLOB_DAT || relocation.type === R_X86_64_JUMP_SLOT)
        return relocation.symbol || undefined
    if (relocation.type === R_X86_64_IRELATIVE) return symbolNamesAt(model, relocation.addend)[0]
    return undefined
}

/**
 * The names of what a call reaches: the symbols at a direct target and the PLT stub there, or
 * the slot of a call through the GOT.
 */
export function calledNames(
    model: ElfModel,
    stubs: ReadonlyMap<number, string>,
    instruction: DecodedInstruction
): string[] {
    for (const operand of instruction.operands) {
        if (operand.branchTarget !== undefined) {
            const target = Number(operand.branchTarget)
            return [
                ...symbolNamesAt(model, target),
                ...(stubs.has(target) ? [stubs.get(target)!] : [])
            ]
        }
        if (operand.memoryTarget !== undefined) {
            const name = slotName(model, Number(operand.memoryTarget))
            return name ? [name] : []
        }
    }
    return []
}

/**
 * `main` by the `__libc_start_main` pattern: the address `_start` loads into `rdi` (`lea` of a
 * memory operand, or `mov` of an immediate) before its first call, when that call reaches
 * `__libc_start_main` or, in a stripped static binary that names nothing, is followed by `hlt`,
 * since glibc's `_start` makes the one call that never returns. A return or a jump first, or a
 * later write to `rdi`, leaves no `main`.
 */
export function mainFromStart(
    start: readonly DecodedInstruction[],
    called: (instruction: DecodedInstruction) => string[]
): number | undefined {
    let candidate: number | undefined
    for (let i = 0; i < start.length; ++i) {
        const instruction = start[i]
        if (instruction.isCall) {
            const names = called(instruction)
            const startMain = names.some(
                (name) => name.replace(/@plt$/, '') === '__libc_start_main'
            )
            const halts = !names.length && start[i + 1]?.mnemonic === 'hlt'
            return startMain || halts ? candidate : undefined
        }
        if (instruction.isReturn || (instruction.isJump && !instruction.isConditional)) return
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
    return undefined
}

/** The address of a symbol named `main`, which wins over the pattern. */
export function mainSymbol(model: ElfModel): number | undefined {
    return [...model.symbolNames].find(([, names]) =>
        names.some((symbol) => symbol.name === 'main')
    )?.[0]
}

/** Whether an address of code is inside an object a symbol table puts there, listed as data. */
export function insideCodeObject(model: ElfModel, address: number): boolean {
    for (const [start, symbols] of model.symbolNames) {
        if (start > address) continue
        const size = Math.max(0, ...symbols.filter((symbol) => symbol.object).map((s) => s.size))
        if (address < start + size) return true
    }
    return false
}

/**
 * The entry point and `main` of an x86-64 ELF, link-time, by the generator's rules, decoding only
 * `_start`'s first instructions rather than every byte of code: what a Build needs before the
 * Listing is ready. Undefined for bytes the Listing could not be made of either.
 */
export function findProgramStart(
    decoder: ListingDecoder,
    bytes: Uint8Array
): { entry: number; main?: number } | undefined {
    const analysis = decoder.analyze(bytes)
    const machine = bytes.length >= 20 ? bytes[18] | (bytes[19] << 8) : 0
    if (!analysis.isElf || bytes[4] !== 2 || bytes[5] !== 1 || machine !== 62) return undefined
    const model = readElfModel(analysis, bytes, (address) => `0x${address.toString(16)}`)
    const codeRegions = model.regions.filter((region) => region.code)
    const entry = Number(analysis.entry)
    let main = mainSymbol(model)
    if (main === undefined && entry) {
        const region = findRegion(codeRegions, entry)
        if (region && !insideCodeObject(model, entry)) {
            // From the entry to the next address decoding would start afresh at, as the
            // generator's linear decoding does, within the region's bytes in the file.
            let stop = region.address + region.fileSize
            for (const address of model.symbolNames.keys())
                if (address > entry && address < stop) stop = address
            const from = region.offset + entry - region.address
            const length = Math.min(stop - entry, START_INSTRUCTIONS * 15)
            const start = decoder
                .disassemble(bytes.subarray(from, from + Math.max(0, length)), BigInt(entry))
                .slice(0, START_INSTRUCTIONS)
            const stubs = new Map<number, string>()
            for (const stub of analysis.plt)
                stubs.set(Number(stub.address), printableSymbolName(stub.name))
            main = mainFromStart(start, (instruction) => calledNames(model, stubs, instruction))
        }
        if (main !== undefined && !findRegion(codeRegions, main)) main = undefined
    }
    if (main !== undefined && insideCodeObject(model, main)) main = undefined
    return { entry, main }
}
