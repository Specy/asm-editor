import { LINE_KIND, type Listing } from '#lib/listing/listing.ts'
import type { PatchedLine } from '#lib/listing/listingPatcher.svelte.ts'
import { ListingIndex } from '#lib/listing/listingNavigation.ts'

/**
 * Which editor models hold a Listing, for the providers that read one (navigation, the address and
 * bytes hover) and for the x86 providers that read Project Files and must leave a Listing alone.
 * Registered by the editor showing the model, like a Build's artifacts.
 */
export type ListingModel = {
    listing: Listing
    /** The ELF the Listing was made from, for the bytes of its lines. */
    bytes: Uint8Array
    /** A library's Listing, which takes no Breakpoints. */
    library: boolean
    /** The lines a Debug session patched, by 0-based line, as memory holds them now. */
    patches?: ReadonlyMap<number, PatchedLine>
    /**
     * A narrow editor, a phone's: the gutter leaves out the leading digits every address of the
     * Listing shares, see {@link sharedAddressDigits}; the hover still gives the whole address.
     */
    shortAddresses?: boolean
}

type Registered = ListingModel & { index: ListingIndex }

const models = new Map<string, Registered>()

export function setModelListing(uri: string, model: ListingModel): () => void {
    const registered: Registered = { ...model, index: ListingIndex.of(model.listing) }
    models.set(uri, registered)
    return () => {
        if (models.get(uri) === registered) models.delete(uri)
    }
}

export function modelListing(uri: { toString(): string }): Registered | undefined {
    return models.get(uri.toString())
}

/** How many hex digits a short address keeps: four bytes' worth. */
const SHORT_ADDRESS_DIGITS = 8

/** The run-time addresses of a Listing's first and last bytes, in hex. */
function addressRange(listing: Listing): [first: string, last: string] {
    const { addresses, byAddress } = listing.lines
    const at = (index: number) =>
        byAddress.length ? addresses[byAddress[index]] + listing.base : listing.base
    return [at(0).toString(16), at(byAddress.length - 1).toString(16)]
}

/**
 * How many leading hex digits every address of a Listing shares and a short gutter leaves out:
 * all but the last 8, when the first and last address agree on them (`5555` of a PIE's
 * `5555555551e9`, `7fff` of libc's), else none.
 */
export function sharedAddressDigits(listing: Listing): number {
    const [first, last] = addressRange(listing)
    const shared = last.length - SHORT_ADDRESS_DIGITS
    if (shared <= 0 || first.length !== last.length) return 0
    return first.slice(0, shared) === last.slice(0, shared) ? shared : 0
}

/**
 * The editor's line numbers for a Listing: each line's run-time address, none on other lines nor
 * on a person's comment lines, which hold no bytes; `short` leaves out the leading digits every
 * address shares.
 */
export function listingLineNumbers(
    listing: Listing,
    short = false
): (lineNumber: number) => string {
    const { addresses, kinds } = listing.lines
    const dropped = short ? sharedAddressDigits(listing) : 0
    const width = addressRange(listing)[1].length
    return (lineNumber) => {
        const address = addresses[lineNumber - 1]
        if (!(address >= 0) || kinds[lineNumber - 1] === LINE_KIND.comment) return ''
        const text = (address + listing.base).toString(16)
        return dropped ? text.padStart(width, '0').slice(dropped) : text
    }
}

/** How many characters the widest address of a Listing takes, for the width of its gutter. */
export function listingLineNumberWidth(listing: Listing, short = false): number {
    const width = addressRange(listing)[1].length
    return Math.max(2, width - (short ? sharedAddressDigits(listing) : 0))
}
