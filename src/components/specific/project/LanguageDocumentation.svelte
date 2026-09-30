<script lang="ts">
    /**
     * A language's documentation, searchable: the Workbench's Documentation panel. With
     * `showSearch` off a caller draws the search field itself and binds `searchValue`.
     */
    import Input from '$cmp/shared/input/Input.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import M68KDocumentation from '$cmp/documentation/m68k/M68KDocumentation.svelte'
    import MipsDocumentation from '$cmp/documentation/mips/MIPSDocumentation.svelte'
    import RISCVDocumentation from '$cmp/documentation/riscv/RISCVDocumentation.svelte'
    import X86Documentation from '$cmp/documentation/x86/X86Documentation.svelte'
    import Z80Documentation from '$cmp/documentation/z80/Z80Documentation.svelte'

    interface Props {
        language: AvailableLanguages
        disableLinks?: boolean
        /** Whether the documentation is on screen, which is when a search scrolls to its match. */
        visible?: boolean
        searchValue?: string
        showSearch?: boolean
        /** Fill the container and scroll inside it, rather than taking 80% of the screen. */
        fill?: boolean
    }

    let {
        language,
        disableLinks = false,
        visible = $bindable(true),
        searchValue = $bindable(''),
        showSearch = true,
        fill = false
    }: Props = $props()
</script>

<div class="language-documentation" class:fill>
    {#if showSearch}
        <div class="search-bar">
            <Input
                bind:value={searchValue}
                placeholder="Search the documentation"
                style="padding: 0rem; background-color: var(--tertiary); color: var(--tertiary-text);"
            />
        </div>
    {/if}
    <div class="scroll" class:fill>
        {#if language === 'M68K'}
            <M68KDocumentation
                bind:searchValue
                bind:visible
                defaultOpen={false}
                showRedirect={false}
                {disableLinks}
            />
        {/if}
        {#if language === 'MIPS'}
            <MipsDocumentation
                bind:searchValue
                bind:visible
                showRedirect={false}
                defaultOpen={false}
                {disableLinks}
            />
        {/if}
        {#if language === 'RISC-V' || language === 'RISC-V-64'}
            <RISCVDocumentation
                bind:searchValue
                bind:visible
                showRedirect={false}
                defaultOpen={false}
                {disableLinks}
            />
        {/if}
        {#if language === 'X86'}
            <X86Documentation
                bind:searchValue
                bind:visible
                showRedirect={false}
                defaultOpen={false}
                {disableLinks}
            />
        {/if}
        {#if language === 'Z80'}
            <Z80Documentation
                bind:searchValue
                bind:visible
                showRedirect={false}
                defaultOpen={false}
                {disableLinks}
            />
        {/if}
    </div>
</div>

<style>
    .language-documentation {
        display: flex;
        flex-direction: column;
        min-height: 0;
    }
    .fill {
        flex: 1;
        height: 100%;
    }
    .search-bar {
        flex: none;
        padding: 0.5rem;
    }
    .scroll {
        height: calc(var(--screen-height) * 0.8);
        overflow-y: auto;
    }
    .scroll.fill {
        flex: 1;
        height: auto;
        min-height: 0;
    }
</style>
