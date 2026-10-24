<script lang="ts">
    import type { PageData } from './$types'
    import Page from '#cmp/shared/layout/Page.svelte'
    import InstructionExample from '#cmp/documentation/site/InstructionExample.svelte'
    import InstructionDocumentView from '#cmp/documentation/instruction/InstructionDocumentView.svelte'
    import InstructionPageHead from '#cmp/documentation/instruction/InstructionPageHead.svelte'
    import InstructionLessons from '#cmp/documentation/instruction/InstructionLessons.svelte'

    interface Props {
        data: PageData
    }

    let { data }: Props = $props()

    let document = $derived(data.props.document)
</script>

<InstructionPageHead {document} architecture="MIPS" root="/documentation/mips" />

<Page contentStyle="padding: 1rem; gap: 1rem;">
    <InstructionDocumentView {document} language="MIPS">
        {#snippet example()}
            <InstructionExample
                instructionKey={document.name}
                example={data.props.content?.example}
            />
        {/snippet}
    </InstructionDocumentView>
    <InstructionLessons lessons={data.props.lessons} />
</Page>
