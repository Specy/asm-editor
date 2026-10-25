<script lang="ts">
    import type { PageData } from './$types'
    import Page from '#cmp/shared/layout/Page.svelte'
    import { onMount } from 'svelte'
    import InstructionPreview from '#cmp/documentation/site/InstructionPreview.svelte'
    import InstructionDocumentView from '#cmp/documentation/instruction/InstructionDocumentView.svelte'
    import InstructionPageHead from '#cmp/documentation/instruction/InstructionPageHead.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

    let document = $derived(data.props.document)

    let component: typeof import('#cmp/documentation/site/ClientOnly.svelte').default | undefined =
        $state.raw()
    onMount(async () => {
        component = (await import('#cmp/documentation/site/ClientOnly.svelte')).default
    })
    let code = $derived(data.props.example ?? '')
</script>

<InstructionPageHead {document} architecture="M68K" root="/documentation/m68k" />

<Page contentStyle="padding: 1rem; gap: 1rem;" style="flex: 1;">
    <InstructionDocumentView {document} language="M68K" lessons={data.props.lessons}>
        {#snippet example()}
            {#if data.props.example}
                {#if component}
                    {@const SvelteComponent_1 = component}
                    <SvelteComponent_1 bind:code instructionKey={document.name} language="M68K" />
                {:else}
                    <InstructionPreview {code} language="M68K" />
                {/if}
            {/if}
        {/snippet}
    </InstructionDocumentView>
</Page>
