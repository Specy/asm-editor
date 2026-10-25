<script lang="ts">
    import type { PageData } from './$types'
    import Page from '#cmp/shared/layout/Page.svelte'
    import InstructionExample from '#cmp/documentation/site/InstructionExample.svelte'
    import InstructionDocumentView from '#cmp/documentation/instruction/InstructionDocumentView.svelte'
    import InstructionPageHead from '#cmp/documentation/instruction/InstructionPageHead.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

    let document = $derived(data.props.document)
</script>

<InstructionPageHead {document} architecture="RISC-V" root="/documentation/risc-v" />

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <InstructionDocumentView
        {document}
        language="RISC-V"
        aliases={data.props.aliases}
        lessons={data.props.lessons}
    >
        {#snippet example()}
            <InstructionExample
                instructionKey={document.name}
                example={data.props.content?.example}
            />
        {/snippet}
    </InstructionDocumentView>
</Page>
