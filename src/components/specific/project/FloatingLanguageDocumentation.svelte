<script lang="ts">
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import M68KDocumentation from '$cmp/documentation/m68k/M68KDocumentation.svelte'
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import MipsDocumentation from '$cmp/documentation/mips/MIPSDocumentation.svelte'
    import RISCVDocumentation from '$cmp/documentation/riscv/RISCVDocumentation.svelte'
    interface Props {
        visible: boolean
        language: AvailableLanguages
    }

    let { visible = $bindable(), language }: Props = $props()
    let searchValue = $state('')
</script>

<FloatingContainer bind:visible title="{language} Documentation" style="width: 45rem">
    {#snippet header()}
        <div class="search-bar">
            <Input
                bind:value={searchValue}
                placeholder="Search"
                style="padding: 0rem; background-color: var(--tertiary); color: var(--tertiary-text);"
            />
        </div>
    {/snippet}
    <div class="scroll">
        {#if language === 'M68K'}
            <M68KDocumentation
                bind:searchValue
                bind:visible
                defaultOpen={false}
                showRedirect={false}
            />
        {/if}
        {#if language === 'MIPS'}
            <MipsDocumentation
                bind:searchValue
                bind:visible
                showRedirect={false}
                defaultOpen={false}
            />
        {/if}
        {#if language === 'RISC-V'}
            <RISCVDocumentation
              bind:searchValue
              bind:visible
              showRedirect={false}
              defaultOpen={false}
            />
        {/if}
    </div>
</FloatingContainer>

<style>
    .search-bar {
        max-width: 15rem;
    }
    .scroll {
        height: 80vh;
        overflow-y: auto;
    }
</style>
