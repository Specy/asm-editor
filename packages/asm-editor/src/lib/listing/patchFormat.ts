import type { DecodedInstruction } from './decoder'
import {
    functionAtLine,
    LINE_KIND,
    lineOfAddress,
    type Listing,
    type ListingFunction,
    type ListingLabel
} from './listing'
import { ListingIndex } from './listingNavigation'
import {
    type AddressNaming,
    holderAt,
    nameAddress,
    NO_HOLDERS,
    stringComment as sharedStringComment
} from './addressNames'
import { instructionLineText, nameComment, withPersonComment } from './listingText'
import { withoutComment } from './patchResolver'

/**
 * How a patched Listing line reads
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 13): the instruction
 * decoded from the bytes memory holds, its targets named as the Listing names them, and what else
 * the line's bytes hold now as a comment (`je .LAB_2 ; + 1 nop`), so the line table never changes.
 */

/**
 * Names for run-time addresses that the Listing has no label at exactly, taken from what a line
 * was written with (`[rel DAT_calm_lynx+0x8]`), so a patched line keeps them while they hold
 * ({@link hintHolds}).
 */
export type NameHints = ReadonlyMap<bigint, string>

/** No names: a line nothing typed over. */
export const NO_NAMES: NameHints = new Map()

/** The names resolved text used, by the address each stands for. */
export function namesOf(names: readonly { address: bigint; written: string }[]): NameHints {
    return new Map(names.map((name) => [name.address, name.written]))
}

/** The names of both, the second's where both name an address. */
export function mergeNames(first: NameHints, second?: NameHints): NameHints {
    return second?.size ? new Map([...first, ...second]) : first
}

/** One `nop`, the byte a shorter encoding is padded with. */
export const NOP = 0x90

const labelsByAddress = new WeakMap<Listing, Map<number, ListingLabel[]>>()

/** The labels at a link-time address, in line order: aliases first, the name operands use last. */
function labelsAt(listing: Listing, address: number): readonly ListingLabel[] {
    let index = labelsByAddress.get(listing)
    if (!index) {
        index = new Map()
        for (const label of listing.labels) {
            const list = index.get(label.address)
            if (list) list.push(label)
            else index.set(label.address, [label])
        }
        labelsByAddress.set(listing, index)
    }
    return index.get(address) ?? []
}

/** The function whose range holds a link-time address, if any. */
function functionAt(listing: Listing, address: number): ListingFunction | undefined {
    const { functions } = listing
    let low = 0
    let high = functions.length - 1
    while (low <= high) {
        const middle = (low + high) >> 1
        const candidate = functions[middle]
        if (candidate.address > address) high = middle - 1
        else if (candidate.end <= address) low = middle + 1
        else return candidate
    }
    return undefined
}

const hex = (value: bigint) => `0x${value.toString(16)}`

/** How a Listing names addresses, for {@link nameAddress}, from a 0-based line. */
function listingNaming(listing: Listing, hints: NameHints): AddressNaming<number> {
    const base = BigInt(listing.base)
    return {
        label: (address) => {
            const named = labelsAt(listing, address).filter((label) => label.kind !== 'block')
            return named.length ? named[named.length - 1].fullName : undefined
        },
        block: (address, line) => {
            const block = labelsAt(listing, address).find((label) => label.kind === 'block')
            if (!block) return undefined
            const owner = functionAtLine(listing, line)
            return owner && owner === functionAtLine(listing, block.line)
                ? block.name
                : block.fullName
        },
        hint: (address, line) => {
            const target = BigInt(address) + base
            const written = hints.get(target)
            return written !== undefined && hintHolds(listing, written, target, line)
                ? written
                : undefined
        },
        holder: (address) => holderAt(listing.holders ?? NO_HOLDERS, address),
        owner: (address) => functionAt(listing, address)?.address
    }
}

/**
 * The name a run-time address has, written from a 0-based line, as the generator writes it
 * (`nameAddress`): a label at exactly that address (the name operands use; a block as `.LAB_n`
 * inside the line's own function and `FUN_x.LAB_n` from outside it), else a name the line was
 * written with, else `name+0xN` inside a named object or string, else inside a function.
 * Undefined when none applies: the address is shown.
 */
export function addressName(
    listing: Listing,
    target: bigint,
    line: number,
    hints: NameHints = new Map()
): string | undefined {
    const address = Number(target - BigInt(listing.base))
    if (!Number.isSafeInteger(address) || address < 0) {
        const written = hints.get(target)
        return written !== undefined && hintHolds(listing, written, target, line)
            ? written
            : undefined
    }
    return nameAddress(listingNaming(listing, hints), address, line)
}

/**
 * Whether a name a line was written with (`main+0x8e`, `.LAB_2`, `s_hunter2-0x1`) still names the
 * run-time `target` in this Listing, read from `line` as `resolveListingNames` reads it: its label
 * is still called so and is where it was. A rename or a Reset name of the label takes the name
 * away ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
 * decision 8), and the address is then named as the Listing names it.
 */
function hintHolds(listing: Listing, written: string, target: bigint, line: number): boolean {
    const sign = written.search(/[+-]/)
    const name = sign < 0 ? written : written.slice(0, sign)
    let offset = 0n
    if (sign >= 0) {
        try {
            offset = BigInt(written.slice(sign + 1))
        } catch {
            return false
        }
        if (written[sign] === '-') offset = -offset
    }
    const index = ListingIndex.of(listing)
    const label =
        index.label(name, line) ??
        (name.startsWith('$') ? index.label(name.slice(1), line) : undefined)
    return (
        label !== undefined &&
        BigInt.asUintN(64, BigInt(label.address + listing.base) + offset) === target
    )
}

/** A decoded instruction's text with its branch and RIP-relative targets named. */
export function labelledText(
    decoded: DecodedInstruction,
    listing: Listing,
    line: number,
    hints?: NameHints
): string {
    let text = decoded.text
    const edits: [number, number, string][] = []
    for (const operand of decoded.operands) {
        if (operand.textStart === undefined || operand.textEnd === undefined) continue
        if (operand.branchTarget !== undefined) {
            const target = operand.branchTarget
            edits.push([
                operand.textStart,
                operand.textEnd,
                addressName(listing, target, line, hints) ?? hex(target)
            ])
        } else if (operand.memoryTarget !== undefined) {
            const target = operand.memoryTarget
            edits.push([
                operand.textStart,
                operand.textEnd,
                `[rel ${addressName(listing, target, line, hints) ?? hex(target)}]`
            ])
        }
    }
    edits.sort((a, b) => b[0] - a[0])
    for (const [start, end, replacement] of edits)
        text = text.slice(0, start) + replacement + text.slice(end)
    return text
}

/**
 * The comments an instruction's operands get, as the generator writes them: for each branch or
 * RIP-relative target a label with a demangled name names, that name
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision 9); and the text of
 * the first string a RIP-relative operand reaches, from there to its end, quoted, after the name
 * of the same operand if it has one.
 */
function operandComments(
    listing: Listing,
    bytes: Uint8Array,
    decoded: DecodedInstruction,
    line: number,
    hints?: NameHints
): string[] {
    const index = ListingIndex.of(listing)
    const demangledOf = (name: string) => index.label(name, line)?.demangled
    const offsetOf = (address: number) => {
        const at = lineOfAddress(listing, address)
        const offset = at < 0 ? -1 : listing.lines.offsets[at]
        return offset < 0 ? -1 : offset + address - listing.lines.addresses[at]
    }
    const comments: string[] = []
    let quoted = false
    for (const operand of decoded.operands) {
        const target = operand.branchTarget ?? operand.memoryTarget
        if (target === undefined) continue
        const written =
            operand.textStart === undefined || operand.textEnd === undefined
                ? undefined
                : addressName(listing, target, line, hints)
        const said = written === undefined ? undefined : nameComment(written, demangledOf)
        let string: string | undefined
        if (operand.branchTarget === undefined && !quoted) {
            const address = Number(target - BigInt(listing.base))
            string = sharedStringComment(listing.holders ?? NO_HOLDERS, bytes, address, offsetOf)
            quoted = string !== undefined
        }
        if (said !== undefined || string !== undefined)
            comments.push([said, string].filter((part) => part !== undefined).join(' '))
    }
    return comments
}

/** What a Listing line's bytes hold, decoded: the first instruction, and what follows it. */
export type DescribedLine = {
    /** The first instruction's text, named: `je .LAB_2`. */
    instruction: string
    /** The single-byte `nop`s and any other instructions after it, in the line's bytes. */
    rest: string[]
    /**
     * The comments the line shows: the demangled names of the labels its operands name and a
     * string one reaches, then {@link rest}.
     */
    comments: string[]
    /**
     * The whole line, indented, as the Listing shows it, with the person's comment the line has
     * at its end kept there
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
     * decision 11).
     */
    text: string
}

/**
 * Describes the instructions decoded from one Listing line's bytes: the first is the line's own,
 * and the rest, which a shorter patch pads with `nop`, are counted in a comment: `+ 1 nop`,
 * `+ 3 nops`, or named when they are anything else (bytes poked by hand).
 */
export function describeLine(
    decoded: readonly DecodedInstruction[],
    listing: Listing,
    bytes: Uint8Array,
    line: number,
    hints?: NameHints
): DescribedLine {
    const [first, ...others] = decoded
    const instruction = first ? labelledText(first, listing, line, hints) : ''
    const rest: string[] = []
    let nops = 0
    const flush = () => {
        if (nops) rest.push(`+ ${nops} nop${nops === 1 ? '' : 's'}`)
        nops = 0
    }
    for (const other of others) {
        if (!other.isInvalid && other.length === 1 && other.mnemonic === 'nop') nops++
        else {
            flush()
            rest.push(`+ ${labelledText(other, listing, line, hints)}`)
        }
    }
    flush()
    const comments = [
        ...(first ? operandComments(listing, bytes, first, line, hints) : []),
        ...rest
    ]
    const text = instructionLineText(instruction, comments)
    const person = ListingIndex.of(listing).endOfLineComment(line)
    return {
        instruction,
        rest,
        comments,
        text: person === undefined ? text : withPersonComment(text, person)
    }
}

/** The bytes a patch writes: the encoding, padded with `nop` to the length of the instruction it replaces. */
export function fitPatch(
    encoding: Uint8Array,
    length: number
): { bytes: Uint8Array } | { error: string } {
    if (encoding.length > length)
        return {
            error: `The new instruction needs ${encoding.length} bytes, the instruction it replaces has ${length}; it would overwrite the next instruction`
        }
    const bytes = new Uint8Array(length).fill(NOP)
    bytes.set(encoding)
    return { bytes }
}

/**
 * How the History names a patch: `Patched jne → je at 0x5555555551f8` when only the mnemonic
 * changed, the whole instructions otherwise, with what pads them.
 */
export function patchTitle(from: DescribedLine, to: DescribedLine, address: bigint): string {
    const split = (text: string) => {
        const space = text.indexOf(' ')
        return space < 0 ? [text, ''] : [text.slice(0, space), text.slice(space + 1)]
    }
    const [fromMnemonic, fromOperands] = split(from.instruction)
    const [toMnemonic, toOperands] = split(to.instruction)
    const whole = (line: DescribedLine) => [line.instruction, ...line.rest].join(' ')
    const change =
        fromOperands === toOperands && !from.rest.length && !to.rest.length
            ? `${fromMnemonic} → ${toMnemonic}`
            : `${whole(from)} → ${whole(to)}`
    return `Patched ${change} at ${hex(address)}`
}

/**
 * The Listing with some lines' text replaced, everything else (the line table, labels, functions)
 * shared with it: what the editor shows for a running Executable whose code was patched.
 */
export function withLines(
    listing: Listing,
    replaced: Iterable<readonly [line: number, text: string]>
): Listing {
    const lines = [...replaced]
        .filter(([line]) => line >= 0 && line < listing.lines.kinds.length)
        .sort((a, b) => a[0] - b[0])
    if (!lines.length) return listing
    const index = ListingIndex.of(listing)
    const text = listing.text
    const pieces: string[] = []
    let at = 0
    for (const [line, replacement] of lines) {
        const start = index.offsetOfLine(line)
        const end = text.indexOf('\n', start)
        pieces.push(text.slice(at, start), replacement)
        at = end < 0 ? text.length : end
    }
    pieces.push(text.slice(at))
    return { ...listing, text: pieces.join('') }
}

/** The instruction a Listing line shows, without its comment; empty for any other line. */
export function instructionText(listing: Listing, line: number): string {
    if (listing.lines.kinds[line] !== LINE_KIND.instruction) return ''
    const index = ListingIndex.of(listing)
    const start = index.offsetOfLine(line)
    const end = listing.text.indexOf('\n', start)
    return withoutComment(listing.text.slice(start, end < 0 ? undefined : end)).trim()
}
