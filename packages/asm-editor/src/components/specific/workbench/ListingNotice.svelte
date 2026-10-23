<script lang="ts">
    import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
    import HelpButton from './HelpButton.svelte'
    import ReadOnlyNotice from './ReadOnlyNotice.svelte'

    /**
     * Above a Listing: what it is. It is generated from the Executable, or from a library the
     * running program loaded, whenever it is shown, and nothing can be edited
     * ([binary-import.md](../../../../../docs/design/binary-import.md), decision 5).
     */
    let {
        document,
        library = false,
        builtFrom,
        patchable = false,
        touch = false,
        findOpen = false,
        onHelp
    }: {
        document: ListingDocument
        /** A shared library's Listing, under `@lib/`, rather than the Executable's own. */
        library?: boolean
        /**
         * The Entry whose Build saved the Executable as its Build output, while it holds that
         * program unchanged: the debugger follows that program in its source rather than here.
         */
        builtFrom?: string
        /**
         * The running Executable's own Listing in a Debug session, whose instructions take patches
         * (decision 13): the notice says how.
         */
        patchable?: boolean
        /** A screen without a pointer that hovers, where a long press opens the context menu. */
        touch?: boolean
        /** Whether the editor's find widget is open, which the notice hides for. */
        findOpen?: boolean
        /** Opens the Documentation's section on the Listing, from the notice's "?". */
        onHelp?: () => void
    } = $props()
    const description = $derived.by(() => {
        if (document.status === 'failed')
            return `The Listing of ${document.name} could not be generated.`
        if (library)
            return `Generated Listing of ${document.name}, a library the program loaded: read-only.`
        if (patchable && touch)
            return `Generated Listing of ${document.name}: read-only. While the program is paused, a long press on a line offers to patch its instruction, in memory only.`
        if (patchable)
            return `Generated Listing of ${document.name}: read-only. While the program is paused, Space or the context menu patches the instruction on a line, in memory only.`
        if (builtFrom)
            return `Generated Listing of ${document.name}, the program a Build of ${builtFrom} saved: read-only. While that program runs, the debugger follows it in ${builtFrom}.`
        return `Generated Listing of ${document.name}: read-only.`
    })
</script>

{#snippet help()}
    <HelpButton label="What is the Listing?" onclick={onHelp} />
{/snippet}

<ReadOnlyNotice
    label={document.status === 'failed' ? description : 'read-only'}
    {description}
    action={onHelp ? help : undefined}
    {findOpen}
/>
