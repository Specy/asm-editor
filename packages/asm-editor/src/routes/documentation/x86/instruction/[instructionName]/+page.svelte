<script lang="ts">
    import type { PageData } from './$types'
    import Page from '#cmp/shared/layout/Page.svelte'
    import { onMount } from 'svelte'
    import InstructionDocumentView from '#cmp/documentation/instruction/InstructionDocumentView.svelte'
    import InstructionPageHead from '#cmp/documentation/instruction/InstructionPageHead.svelte'
    import InstructionLessons from '#cmp/documentation/instruction/InstructionLessons.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

    let document = $derived(data.props.document)

    // Bound into the editor below, which is free to overwrite it; navigating to another
    // instruction re-derives it, the same way the other languages' instruction pages do.
    let code = $derived(data.props.example ?? '')

    let component: typeof import('#cmp/documentation/site/ClientOnly.svelte').default | undefined =
        $state.raw()
    onMount(async () => {
        component = (await import('#cmp/documentation/site/ClientOnly.svelte')).default
    })
</script>

<InstructionPageHead {document} architecture="x86-64" root="/documentation/x86" />

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <InstructionDocumentView {document} language="X86" aliases={data.props.aliases}>
        {#snippet example()}
            {#if data.props.example}
                {#if component}
                    {@const SvelteComponent_1 = component}
                    <SvelteComponent_1
                        bind:code
                        instructionKey={document.name}
                        language="X86"
                        showPc={true}
                        showFlags={true}
                        showConsole={true}
                    />
                {:else}
                    <div class="loading">Loading...</div>
                {/if}
            {/if}
        {/snippet}
    </InstructionDocumentView>
    <InstructionLessons lessons={data.props.lessons} />
</Page>

<style>
    .loading {
        display: flex;
        justify-content: center;
        align-items: center;
        flex: 1;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-size: 2rem;
        border-radius: 0.5rem;
        min-height: 19.75rem;
    }
</style>
