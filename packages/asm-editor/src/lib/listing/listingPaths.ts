/**
 * Where Listings are shown and at which addresses
 * ([binary-import.md](../../../../../docs/design/binary-import.md), decisions 10 and 18): an
 * Executable's at the Executable's own path, a shared library's at `@lib/<soname>`, outside the
 * Project like the Start unit's `@runtime/` Files.
 */

/** Where a shared library's Listing is shown: `@lib/libc.so.6`. */
export const LIBRARY_LISTING_NAMESPACE = '@lib/'

export function isLibraryListingPath(path: string): boolean {
    return path.startsWith(LIBRARY_LISTING_NAMESPACE)
}

/** A loaded library's Listing path: its soname, or the name of the file it was mapped from. */
export function libraryListingPath(object: { path: string; soname?: string }): string {
    return (
        LIBRARY_LISTING_NAMESPACE +
        (object.soname ?? object.path.slice(object.path.lastIndexOf('/') + 1))
    )
}

/**
 * Where an Executable runs (decision 10, gdb's layout with randomisation off): a position-
 * independent one at `0x555555554000`, one at fixed addresses where its headers say, which is a
 * load bias of 0. A Listing shown before a run uses it, so its addresses are the run's.
 */
export const PIE_LOAD_BASE = 0x555555554000

export function plannedLoadBase(pie: boolean): number {
    return pie ? PIE_LOAD_BASE : 0
}
