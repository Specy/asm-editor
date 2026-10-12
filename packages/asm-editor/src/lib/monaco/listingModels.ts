import type { Listing } from '#lib/listing/listing.ts'
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

/** The editor's line numbers for a Listing: each line's run-time address, none on other lines. */
export function listingLineNumbers(listing: Listing): (lineNumber: number) => string {
    const { addresses } = listing.lines
    return (lineNumber) => {
        const address = addresses[lineNumber - 1]
        return address >= 0 ? (address + listing.base).toString(16) : ''
    }
}

/** How many characters the widest address of a Listing takes, for the width of its gutter. */
export function listingLineNumberWidth(listing: Listing): number {
    const { addresses, byAddress } = listing.lines
    const last = byAddress.length ? addresses[byAddress[byAddress.length - 1]] : 0
    return Math.max(2, (last + listing.base).toString(16).length)
}
