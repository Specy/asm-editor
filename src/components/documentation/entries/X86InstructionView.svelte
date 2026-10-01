<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        describeX86Instruction,
        formatX86Form,
        type X86Instruction
    } from '$lib/languages/X86/X86-documentation'
    import CodeSample from './CodeSample.svelte'

    interface Props {
        instruction: X86Instruction
        disableLinks?: boolean
    }

    let { instruction, disableLinks = false }: Props = $props()

    /** The shapes a reader is likely to write; `mov` alone has 65. The page lists them all. */
    const MAX_FORMS = 4

    const forms = $derived(
        [...new Set(instruction.forms.map((form) => formatX86Form(instruction.name, form)))].slice(
            0,
            MAX_FORMS
        )
    )
    const description = $derived(describeX86Instruction(instruction.name))
</script>

<div class="instruction">
    {#if description}
        <MarkdownRenderer
            source={description}
            linksInNewTab
            {disableLinks}
            centered={false}
            simpleCode
        />
    {/if}
    {#if forms.length > 0}
        <CodeSample
            code={forms.join('\n')}
            label={instruction.forms.length > forms.length
                ? `${forms.length} of ${instruction.forms.length} forms`
                : 'Forms'}
        />
    {/if}
</div>

<style>
    .instruction {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
</style>
