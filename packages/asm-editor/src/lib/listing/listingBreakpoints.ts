import {
    isLineBreakpoint,
    type SourceBreakpoint
} from '#lib/languages/commonLanguageFeatures.svelte.ts'
import { lineOfAddress } from './listing'
import type { ListingDocuments } from './listingDocuments.svelte'

/**
 * A Breakpoint's 0-based line: its own, or for one on a Listing, the line its address is on in the
 * running program's Listing; -1 when there is no such Listing yet.
 */
export function breakpointLine(
    breakpoint: SourceBreakpoint,
    listings: ListingDocuments | undefined
): number {
    if (isLineBreakpoint(breakpoint)) return breakpoint.line
    const listing = listings?.session.get(breakpoint.file)?.listing
    return listing ? lineOfAddress(listing, breakpoint.address) : -1
}
