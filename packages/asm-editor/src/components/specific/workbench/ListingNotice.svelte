<script lang="ts">
    import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
    import ReadOnlyNotice from './ReadOnlyNotice.svelte'

    /**
     * Above a Listing: what it is. It is generated from the Executable, or from a library the
     * running program loaded, whenever it is shown, and nothing can be edited
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 5).
     */
    let {
        document,
        library = false,
        built = false,
        patchable = false,
        touch = false
    }: {
        document: ListingDocument
        /** A shared library's Listing, under `@lib/`, rather than the Executable's own. */
        library?: boolean
        /**
         * The Build output's, the program the Build linked, which the debugger follows in its
         * source rather than here.
         */
        built?: boolean
        /**
         * The running Executable's own Listing in a Debug session, whose instructions take patches
         * (decision 13): the notice says how.
         */
        patchable?: boolean
        /** A screen without a pointer that hovers, where a long press opens the context menu. */
        touch?: boolean
    } = $props()
    const description = $derived.by(() => {
        if (document.status === 'failed')
            return `The Listing of ${document.name} could not be generated.`
        if (library)
            return `Generated Listing of ${document.name}, a library the program loaded: read-only.`
        if (built)
            return `Generated Listing of ${document.name}, the program the Build linked: read-only. The debugger follows it in its source.`
        if (patchable && touch)
            return `Generated Listing of ${document.name}: read-only. While the program is paused, a long press on a line offers to patch its instruction, in memory only.`
        if (patchable)
            return `Generated Listing of ${document.name}: read-only. While the program is paused, Space or the context menu patches the instruction on a line, in memory only.`
        return `Generated Listing of ${document.name}: read-only.`
    })
</script>

<ReadOnlyNotice label={document.status === 'failed' ? description : 'read-only'} {description} />
