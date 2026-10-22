import {
    functionAtLine,
    LINE_KIND,
    lineOfAddress,
    type Listing,
    type ListingLabel,
    type ListingNameOrigin
} from './listing'
import { demangledComment } from './listingText'

/**
 * Reading a Listing's text for navigation: the name under the cursor, the label it means, every
 * line that names a label, and what a hover says about a line or a name
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decisions 5 and 7). Lines and
 * columns are 0-based; a Listing's line `i` is the editor's line `i + 1`.
 */

/** What a name in a Listing may hold, as `printableSymbolName` leaves symbol names. */
const NAME_CHARACTER = /[\w$#@~.?]/

/** The bytes a hover shows of a line before it says how many more there are. */
const HOVER_BYTES = 16

export type ListingToken = { text: string; start: number; end: number }

/** Where a name appears: a 0-based line and the columns it covers, the end exclusive. */
export type ListingSpan = { line: number; start: number; end: number }

/**
 * Whether a column is inside a string: a `db "…"` operand or a comment's `"…"`, whose words are
 * text, not names. A comment escapes its quotes as C does (`\"`); NASM's strings hold none.
 */
function insideString(line: string, column: number): boolean {
    let inside = false
    for (let i = 0; i < column && i < line.length; ++i)
        if (line[i] === '"' && line[i - 1] !== '\\') inside = !inside
    return inside
}

/** Where a line's comment starts: its first `;` outside a string, or the line's length. */
function commentStart(line: string): number {
    let inside = false
    for (let i = 0; i < line.length; ++i) {
        if (line[i] === '"' && line[i - 1] !== '\\') inside = !inside
        else if (line[i] === ';' && !inside) return i
    }
    return line.length
}

/**
 * The name or number under a column: `strcmp@plt`, `FUN_brave_otter.LAB_3`, `.LAB_2`, `stdin`
 * of `[rel stdin+0x8]`, `0x555555555149`. Nothing inside a string.
 */
export function listingTokenAt(line: string, column: number): ListingToken | undefined {
    let start = column
    let end = column
    while (start > 0 && NAME_CHARACTER.test(line[start - 1])) --start
    while (end < line.length && NAME_CHARACTER.test(line[end])) ++end
    if (start === end || insideString(line, start)) return undefined
    return { text: line.slice(start, end), start, end }
}

/** Lookups on one Listing, built when first needed and kept with it. */
export class ListingIndex {
    private labelsByName?: Map<string, ListingLabel>
    private lineStarts?: Uint32Array
    private demangles?: boolean

    constructor(readonly listing: Listing) {}

    private static readonly indexes = new WeakMap<Listing, ListingIndex>()

    static of(listing: Listing): ListingIndex {
        let index = ListingIndex.indexes.get(listing)
        if (!index) {
            index = new ListingIndex(listing)
            ListingIndex.indexes.set(listing, index)
        }
        return index
    }

    /**
     * The label a name written on a line means: a label's full name (`FUN_brave_otter.LAB_3`,
     * `strcmp@plt`), or a bare `.LAB_3`, which is the block of the function the line is in.
     */
    label(name: string, line: number): ListingLabel | undefined {
        this.labelsByName ??= new Map(this.listing.labels.map((label) => [label.fullName, label]))
        if (name.startsWith('.')) {
            const owner = functionAtLine(this.listing, line)
            return owner ? this.labelsByName.get(owner.name + name) : undefined
        }
        return this.labelsByName.get(name)
    }

    /**
     * Whether a column of a line's text is in a comment's demangled name
     * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision 9): text, whose
     * words are no names even where one is also a label's, as `main` in
     * `; main::'lambda'(int)::operator()(int) const`. A comment says the demangled name of a
     * label the line names (in its code, or in an earlier comment, `; _ZSt4cout std::cout`) or
     * defines, then any offset (`+0x10`).
     */
    inDemangledComment(text: string, line: number, column: number): boolean {
        this.demangles ??= this.listing.labels.some((label) => label.demangled)
        if (!this.demangles) return false
        const comment = commentStart(text)
        if (column <= comment) return false
        for (let at = 0; at < text.length;) {
            if (!NAME_CHARACTER.test(text[at])) {
                ++at
                continue
            }
            const start = at
            while (at < text.length && NAME_CHARACTER.test(text[at])) ++at
            const demangled = this.label(text.slice(start, at), line)?.demangled
            if (!demangled) continue
            const said = demangledComment(demangled)
            for (
                let found = text.indexOf(said, comment);
                found >= 0 && found <= column;
                found = text.indexOf(said, found + 1)
            ) {
                const offset = /^[+-]0x[\da-f]+/.exec(text.slice(found + said.length))
                if (column < found + said.length + (offset?.[0].length ?? 0)) return true
            }
        }
        return false
    }

    /** The line a number names, when it is a run-time address the Listing covers. */
    addressLine(token: string): number {
        if (!/^0x[\da-f]+$/i.test(token)) return -1
        const address = parseInt(token, 16) - this.listing.base
        return Number.isSafeInteger(address) && address >= 0
            ? lineOfAddress(this.listing, address)
            : -1
    }

    /**
     * Every place that names a label, its own definition included, in line order: its full name
     * anywhere in the Listing, and for a block, its bare `.LAB_n` inside its own function. A name
     * inside a string does not count; `name+0x8` names `name`.
     */
    references(label: ListingLabel): ListingSpan[] {
        const spans = this.occurrences(label.fullName, 0, this.listing.text.length)
        if (label.kind === 'block') {
            const owner = functionAtLine(this.listing, label.line)
            if (owner)
                spans.push(
                    ...this.occurrences(
                        label.name,
                        this.offsetOfLine(owner.line),
                        this.offsetOfLine(owner.endLine)
                    )
                )
        }
        return spans.sort((a, b) => a.line - b.line || a.start - b.start)
    }

    private occurrences(name: string, from: number, to: number): ListingSpan[] {
        const text = this.listing.text
        const spans: ListingSpan[] = []
        for (
            let at = text.indexOf(name, from);
            at >= 0 && at < to;
            at = text.indexOf(name, at + 1)
        ) {
            const end = at + name.length
            if (at > 0 && NAME_CHARACTER.test(text[at - 1])) continue
            if (end < text.length && NAME_CHARACTER.test(text[end])) continue
            const line = this.lineOfOffset(at)
            const lineStart = this.offsetOfLine(line)
            const start = at - lineStart
            if (insideString(text.slice(lineStart, at), start)) continue
            if (this.demangles !== false) {
                const lineEnd = text.indexOf('\n', at)
                const lineText = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
                if (this.inDemangledComment(lineText, line, start)) continue
            }
            spans.push({ line, start, end: start + name.length })
        }
        return spans
    }

    private starts(): Uint32Array {
        if (!this.lineStarts) {
            const text = this.listing.text
            const starts = [0]
            for (let at = text.indexOf('\n'); at >= 0; at = text.indexOf('\n', at + 1))
                starts.push(at + 1)
            this.lineStarts = Uint32Array.from(starts)
        }
        return this.lineStarts
    }

    /** Where a 0-based line starts in the text; the text's length past the last line. */
    offsetOfLine(line: number): number {
        const starts = this.starts()
        return line < starts.length ? starts[line] : this.listing.text.length
    }

    private lineOfOffset(offset: number): number {
        const starts = this.starts()
        let low = 0
        let high = starts.length - 1
        while (low < high) {
            const middle = (low + high + 1) >> 1
            if (starts[middle] <= offset) low = middle
            else high = middle - 1
        }
        return low
    }
}

function runTimeAddress(listing: Listing, address: number): string {
    return `0x${(address + listing.base).toString(16)}`
}

const ORIGINS: Record<ListingNameOrigin, (label: ListingLabel, listing: Listing) => string> = {
    symbol: () => 'Named by the symbol table.',
    dynamic: () => 'Named by the dynamic symbol table, which shared libraries are linked through.',
    plt: (label) =>
        label.name.endsWith('@plt_resolver')
            ? `A lazy PLT stub: it asks the dynamic linker for \`${label.name.replace(/@plt_resolver$/, '')}\` the first time it is called.`
            : `A PLT stub: it jumps to \`${label.name.replace(/@plt$/, '')}\`, in a shared library, through the address its GOT slot holds.`,
    got: (label) =>
        `A GOT slot: the dynamic linker writes the address of \`${label.name.replace(/@got$/, '')}\` here when the program starts.`,
    main: () =>
        '`main`, found from the address `_start` passes to `__libc_start_main`; the file does not name it.',
    entry: () => 'The entry point, where the program starts; the file does not name it.',
    invented: (label) =>
        `An invented name: nothing in the file names this ${label.kind === 'function' ? 'function' : 'data'}, so the Listing made one up from its address.`,
    string: () => 'Named after the text it holds.',
    block: (label, listing) => {
        const owner = functionAtLine(listing, label.line)
        return owner
            ? `A place a jump goes to inside \`${owner.name}\`.`
            : 'A place a jump goes to.'
    }
}

/** Where a label's name comes from, as a hover says it: "Named by the symbol table." */
export function nameOrigin(listing: Listing, label: ListingLabel): string {
    return ORIGINS[label.origin](label, listing)
}

/** What a hover says about a label: its name, its run-time address and where the name comes from. */
export function labelHoverMarkdown(listing: Listing, label: ListingLabel): string {
    return [
        `**${label.fullName}** at \`${runTimeAddress(listing, label.address)}\``,
        '',
        nameOrigin(listing, label)
    ].join('\n')
}

/**
 * What a hover says about an instruction or data line: its run-time address and its bytes, or
 * how much reserved space it is. Undefined for other lines.
 */
export function lineHoverMarkdown(
    listing: Listing,
    bytes: Uint8Array,
    line: number,
    patched?: { bytes: Uint8Array; original: Uint8Array; originalText: string }
): string | undefined {
    const { kinds, addresses, sizes, offsets } = listing.lines
    const kind = kinds[line]
    if (kind !== LINE_KIND.instruction && kind !== LINE_KIND.data) return undefined
    const address = `Address \`${runTimeAddress(listing, addresses[line])}\``
    const size = sizes[line]
    const offset = offsets[line]
    if (offset < 0) return `${address} · ${size} bytes reserved, zero when the program starts`
    const shown = (from: Uint8Array) =>
        Array.from(from.subarray(0, HOVER_BYTES), (byte) =>
            byte.toString(16).padStart(2, '0')
        ).join(' ')
    const more = size > HOVER_BYTES ? ` and ${size - HOVER_BYTES} more` : ''
    if (patched)
        return [
            `${address} · Bytes \`${shown(patched.bytes)}\`${more}`,
            '',
            `Patched in this Debug session. The Executable has \`${shown(patched.original)}\` here, \`${patched.originalText}\`; Undo takes the patch back.`
        ].join('\n')
    return `${address} · Bytes \`${shown(bytes.subarray(offset, offset + size))}\`${more}`
}
