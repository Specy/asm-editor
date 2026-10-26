import {
    VARIANTS as CTOR_DTOR_VARIANTS,
    type CtorDtorVariant,
    type DemangledName
} from '#lib/languages/demangle/demangledNames.ts'
import { partitionPoint } from '#lib/sorted.ts'
import {
    functionAtLine,
    LINE_KIND,
    lineOfAddress,
    PERSON_COMMENT,
    personCommentIndex,
    type Listing,
    type ListingLabel,
    type ListingNameOrigin
} from './listing'
import { commentStart, demangledComment } from './listingText'

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
    private labelsByDemangledName?: Map<string, ListingLabel | null>
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
     * The label a demangled name means, as lists and hovers write it: a short name
     * (`std::ostream::operator<<@plt`), a signature (`std::string::operator+=(std::string const&)`)
     * or a list form (`game::Player::Player(std::string) [complete]`), when only labels at one
     * address have it ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision
     * 11): a class's constructors share a short name, which then means none of them.
     */
    demangledLabel(name: string): ListingLabel | undefined {
        if (!this.labelsByDemangledName) {
            const named = new Map<string, ListingLabel | null>()
            for (const label of this.listing.labels) {
                const { demangled } = label
                if (!demangled) continue
                for (const form of new Set([
                    demangled.short,
                    demangled.signature,
                    demangled.list
                ])) {
                    const known = named.get(form)
                    if (known === undefined) named.set(form, label)
                    else if (known && known.address !== label.address) named.set(form, null)
                }
            }
            this.labelsByDemangledName = named
        }
        return this.labelsByDemangledName.get(name) ?? undefined
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

    /**
     * Whether a column of a line's text is in a person's comment
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md), decision
     * 11): text, whose words are never names, nor numbers to follow, even where one is a label's,
     * as `main` in `; calls main twice`. `text` is the line as shown, which a Debug session's
     * patch may have rewritten before the comment it keeps at its end.
     */
    inPersonComment(text: string, line: number, column: number): boolean {
        const at = personCommentIndex(this.listing, line)
        return at >= 0 && column >= text.length - this.listing.comments!.lengths[at]
    }

    /**
     * The person's comment a line has at its end, as they wrote it, or undefined: what a patched
     * line keeps after its new code.
     */
    endOfLineComment(line: number): string | undefined {
        const at = personCommentIndex(this.listing, line)
        const comments = this.listing.comments
        if (at < 0 || comments!.kinds[at] !== PERSON_COMMENT.end) return undefined
        const end = this.offsetOfLine(line + 1) - 1
        //the length counts its `; `
        return this.listing.text.slice(end - comments!.lengths[at] + 2, end)
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
            const commented = personCommentIndex(this.listing, line) >= 0
            if (this.demangles !== false || commented) {
                const lineEnd = text.indexOf('\n', at)
                const lineText = text.slice(lineStart, lineEnd < 0 ? undefined : lineEnd)
                if (commented && this.inPersonComment(lineText, line, start)) continue
                if (this.demangles !== false && this.inDemangledComment(lineText, line, start))
                    continue
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
        return partitionPoint(starts.length, (line) => starts[line] <= offset) - 1
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
            ? `A place a jump goes to inside ${markdownCode(owner.list ?? owner.name)}.`
            : 'A place a jump goes to.'
    }
}

/** Where a label's name comes from, as a hover says it: "Named by the symbol table." */
export function nameOrigin(listing: Listing, label: ListingLabel): string {
    return ORIGINS[label.origin](label, listing)
}

/**
 * What a hover says about a label: its name, its run-time address and where the name comes from.
 * A C++ name reads by its signature, then its other forms and its mangled name
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision 10).
 */
export function labelHoverMarkdown(listing: Listing, label: ListingLabel): string {
    const address = `\`${runTimeAddress(listing, label.address)}\``
    const { demangled, renamed } = label
    const conflict =
        label.renameConflict === undefined
            ? []
            : [
                  `You renamed this to ${markdownCode(label.renameConflict)}, but another label already has that name, so the original name is shown instead.`
              ]
    if (renamed)
        //the person's name, then what it was, as the hover gave it before
        return [
            `**${label.fullName}** at ${address}`,
            `Renamed from ${markdownCode(renamed.demangled?.signature ?? renamed.from)}.`,
            ...(renamed.demangled ? demangledNameMarkdown(renamed.demangled, renamed.from) : []),
            nameOrigin(listing, label)
        ].join('\n\n')
    if (!demangled)
        return [
            `**${label.fullName}** at ${address}`,
            ...conflict,
            nameOrigin(listing, label)
        ].join('\n\n')
    return [
        `**${markdownCode(demangled.signature)}** at ${address}`,
        ...demangledNameMarkdown(demangled, label.fullName),
        ...conflict,
        nameOrigin(listing, label)
    ].join('\n\n')
}

/**
 * What a hover says of a demangled name under a title giving its signature
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision 10): the
 * demangler's own text where the signature reads otherwise, then the short name where it differs
 * from the signature, the raw name the program and the Listing's text use, and the constructor's
 * or destructor's variant the raw name marks:
 *
 * - "As the demangler writes it: `std::__cxx11::basic_string<char, …>::operator+=(…)`"
 * - "Short name `game::Player::~Player`; mangled name `_ZN4game6PlayerD0Ev`, where `D0` marks the
 *   deleting destructor, which frees the object once it is destroyed."
 */
export function demangledNameMarkdown(demangled: DemangledName, raw: string): string[] {
    const { signature, suffix, text } = demangled
    //the demangler's text says nothing more when the signature is that text, its Listing's suffix
    //and a variant's mark: no template shortened, no return type left out, no clone rewritten
    const plain = text + suffix
    const same = signature === plain || signature.startsWith(`${plain} [`)
    const short =
        demangled.short === signature ? '' : `Short name ${markdownCode(demangled.short)}; mangled`
    const variant = demangled.variant && variantWords(demangled, demangled.variant)
    return [
        ...(same ? [] : [`As the demangler writes it: ${markdownCode(text)}`]),
        `${short || 'Mangled'} name ${markdownCode(raw)}${variant ? `, where ${variant}` : ''}.`
    ]
}

/** What a hover says of a constructor's or destructor's variant: "`D0` marks the deleting destructor". */
function variantWords(demangled: DemangledName, variant: CtorDtorVariant): string | undefined {
    const destructor = demangled.pseudocode.name.startsWith('~')
    const code = Object.keys(CTOR_DTOR_VARIANTS).find(
        (candidate) =>
            CTOR_DTOR_VARIANTS[candidate] === variant &&
            candidate.startsWith(destructor ? 'D' : 'C')
    )
    if (!code) return undefined
    const what = `\`${code}\` marks the ${variant} ${destructor ? 'destructor' : 'constructor'}`
    return variant === 'deleting' ? `${what}, which frees the object once it is destroyed` : what
}

/**
 * Markdown code that shows `text` as it is: fenced by more backticks than it holds in a row, and
 * padded where it starts or ends with a backtick or a space, which the fence would otherwise eat.
 * A C++ name holds `<`, `*` and `_`, which plain Markdown would read as markup.
 */
export function markdownCode(text: string): string {
    const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))
    const fence = '`'.repeat(longest + 1)
    const pad = /^[ `]|[ `]$/.test(text) ? ' ' : ''
    return `${fence}${pad}${text}${pad}${fence}`
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
