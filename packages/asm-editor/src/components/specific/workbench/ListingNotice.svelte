<script lang="ts">
    import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'

    /**
     * Above a Listing: what it is. It is generated from the Executable, or from a library the
     * running program loaded, whenever it is shown, and nothing can be edited
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 5).
     */
    let {
        document,
        library = false
    }: {
        document: ListingDocument
        /** A shared library's Listing, under `@lib/`, rather than the Executable's own. */
        library?: boolean
    } = $props()
</script>

<div class="listing-notice" role="status">
    {#if document.status === 'failed'}
        The Listing of {document.name} could not be generated.
    {:else if library}
        Generated Listing of {document.name}, a library the program loaded: read-only.
    {:else}
        Generated Listing of {document.name}: read-only.
    {/if}
</div>

<style lang="scss">
    .listing-notice {
        padding: 0.45rem 0.75rem;
        color: var(--secondary-text);
        border-bottom: 1px solid var(--wb-line);
        background: color-mix(in srgb, var(--accent2, var(--accent)) 10%, var(--secondary));
        font-size: 0.8rem;
        overflow-wrap: anywhere;
    }
</style>
