<script lang="ts">
    import FloatingContainer from '$cmp/shared/layout/FloatingContainer.svelte'
    import Input from '$cmp/shared/input/Input.svelte'
    import M68KDocumentation from '$cmp/documentation/m68k/M68KDocumentation.svelte'
    interface Props {
        visible: boolean
    }

    let { visible = $bindable() }: Props = $props()
    let searchValue = $state('')
</script>

<FloatingContainer bind:visible title="M68K Documentation" style="width: 45rem">
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
        <M68KDocumentation bind:searchValue bind:visible defaultOpen={false} showRedirect={false} />
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
