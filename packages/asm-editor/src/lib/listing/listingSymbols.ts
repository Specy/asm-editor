import { lineOfAddress, type Listing } from './listing'
import { ListingIndex } from './listingNavigation'
import { cEscape } from './listingText'

/**
 * The functions and strings of a Listing as the Symbols panel lists them
 * ([reverse-engineering-ux.md](../../../../../docs/design/reverse-engineering-ux.md), decision
 * 18), in address order and at run-time addresses, as the Listing's gutter and hover give them.
 * A C++ function is listed by its demangled name
 * ([cpp-demangling.md](../../../../../docs/design/cpp-demangling.md), decision 11).
 */

export type FunctionSymbol = {
    /** Its label: the raw name, `_ZNSolsEi@plt`, which the Listing's text uses. */
    name: string
    /**
     * What its row shows: a C++ function's list form (`std::ostream::operator<<@plt`, a signature
     * where another function shares that), else its name.
     */
    display: string
    /**
     * A C++ function's short name and signature, which the filter matches as well as the raw name,
     * and the tooltip gives.
     */
    demangled?: { short: string; signature: string }
    /**
     * For a function the person renamed, whose `name` and `display` are theirs: the name the
     * Listing gave it, and that name's short name and signature for a C++ one, which the filter
     * matches too
     * ([annotations-and-search.md](../../../../../docs/design/annotations-and-search.md),
     * decision 9).
     */
    renamed?: { from: string; demangled?: { short: string; signature: string } }
    /** Run-time. */
    address: number
    /** In bytes, up to the next function or the end of its section. */
    size: number
    /** The 0-based line of its label. */
    line: number
}

export type StringSymbol = {
    /** Its bytes up to the NUL, a character each. */
    text: string
    /** The text as a C string literal's contents, `\n` and `\t` escaped. */
    escaped: string
    /** Run-time. */
    address: number
    /** The 0-based line of its label, and the line after its last one. */
    line: number
    endLine: number
}

/** The most of a string read when the Listing gives no end for it, as a Listing made by hand. */
const UNBOUNDED_STRING = 4096

export function listingFunctions(listing: Listing): FunctionSymbol[] {
    const index = ListingIndex.of(listing)
    const forms = (demangled: { short: string; signature: string }) => ({
        short: demangled.short,
        signature: demangled.signature
    })
    return listing.functions.map((fn) => {
        const label = index.label(fn.name, fn.line)
        const demangled = fn.list === undefined ? undefined : label?.demangled
        const renamed = label?.renamed
        return {
            name: fn.name,
            display: fn.list ?? fn.name,
            ...(demangled ? { demangled: forms(demangled) } : {}),
            ...(renamed
                ? {
                      renamed: renamed.demangled
                          ? { from: renamed.from, demangled: forms(renamed.demangled) }
                          : { from: renamed.from }
                  }
                : {}),
            address: fn.address + listing.base,
            size: fn.end - fn.address,
            line: fn.line
        }
    })
}

/**
 * The strings the Listing labels, each once at its first label, read from the bytes the Listing
 * was made from: up to the end the Listing's string holders give, else up to a NUL.
 */
export function listingStrings(listing: Listing, bytes: Uint8Array): StringSymbol[] {
    const { addresses, offsets } = listing.lines
    const ends = new Map<number, number>()
    const pairs = listing.holders?.strings ?? new Float64Array(0)
    for (let i = 0; i < pairs.length; i += 2) ends.set(pairs[i], pairs[i + 1])
    const strings: StringSymbol[] = []
    const seen = new Set<number>()
    for (const label of listing.labels) {
        if (label.kind !== 'string' || seen.has(label.address)) continue
        seen.add(label.address)
        const first = lineOfAddress(listing, label.address)
        if (first < 0 || offsets[first] < 0) continue
        const start = offsets[first] + label.address - addresses[first]
        const end = ends.get(label.address)
        const limit = Math.min(
            bytes.length,
            start + (end === undefined ? UNBOUNDED_STRING : end - label.address)
        )
        let text = ''
        for (let at = start; at < limit && bytes[at] !== 0; ++at)
            text += String.fromCharCode(bytes[at])
        //the NUL is on the string's last line
        const last = lineOfAddress(listing, label.address + text.length)
        strings.push({
            text,
            escaped: cEscape(text),
            address: label.address + listing.base,
            line: label.line,
            endLine: Math.max(label.line, last < 0 ? first : last) + 1
        })
    }
    return strings.sort((a, b) => a.address - b.address)
}

/** An address as the Symbols panel writes it, run-time, as Go to Symbol and the hover do. */
export function symbolAddress(address: number): string {
    return `0x${address.toString(16)}`
}

/**
 * What a filter typed in the panel matches against an address: its hex digits, without the `0x`
 * typed before them, which alone matches every address; nothing when the filter cannot be part of
 * an address.
 */
function addressQuery(query: string): string | undefined {
    const digits = query.startsWith('0x') ? query.slice(2) : query
    return /^[0-9a-f]*$/.test(digits) ? digits : undefined
}

/** The filter as the rows are matched against it: trimmed and in lower case. */
export function symbolQuery(text: string): string {
    return text.trim().toLowerCase()
}

/**
 * The functions whose name or address holds a filter, made by `symbolQuery`: for a C++ function,
 * its raw name, its short name, its signature or what its row shows; for a renamed one, the
 * person's name and the names it had.
 */
export function filterFunctions(functions: FunctionSymbol[], query: string): FunctionSymbol[] {
    if (!query) return functions
    const digits = addressQuery(query)
    const holds = (text: string) => text.toLowerCase().includes(query)
    const holdsForms = (demangled: { short: string; signature: string } | undefined) =>
        demangled !== undefined && (holds(demangled.short) || holds(demangled.signature))
    return functions.filter(
        (fn) =>
            holds(fn.name) ||
            (fn.demangled !== undefined && (holds(fn.display) || holdsForms(fn.demangled))) ||
            (fn.renamed !== undefined &&
                (holds(fn.renamed.from) || holdsForms(fn.renamed.demangled))) ||
            (digits !== undefined && fn.address.toString(16).includes(digits))
    )
}

/**
 * A function row's tooltip: its name, address and size, a C++ function by its signature with the
 * raw name the Listing's text and Ctrl+F use on a line of its own; a renamed one by the person's
 * name, then what it was renamed from, a C++ name by its signature and its raw name.
 */
export function functionTooltip(fn: FunctionSymbol): string {
    const size = `${fn.size} byte${fn.size === 1 ? '' : 's'}`
    const at = `at ${symbolAddress(fn.address)}, ${size}`
    if (fn.renamed) {
        const { from, demangled } = fn.renamed
        return demangled
            ? `${fn.name} ${at}\nRenamed from ${demangled.signature}\n${from}`
            : `${fn.name} ${at}\nRenamed from ${from}`
    }
    return fn.demangled ? `${fn.demangled.signature} ${at}\n${fn.name}` : `${fn.name} ${at}`
}

/** The strings whose text, as stored or as escaped, or address holds a filter. */
export function filterStrings(strings: StringSymbol[], query: string): StringSymbol[] {
    if (!query) return strings
    const digits = addressQuery(query)
    return strings.filter(
        (string) =>
            string.text.toLowerCase().includes(query) ||
            string.escaped.toLowerCase().includes(query) ||
            (digits !== undefined && string.address.toString(16).includes(digits))
    )
}
