<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        fromSizesToString,
        fromSizeToString,
        getAddressingModeNames,
        type InstructionDocumentation
    } from '$lib/languages/M68K/M68K-documentation'
    import CodeSample from './CodeSample.svelte'

    interface Props {
        instruction: InstructionDocumentation
        disableLinks?: boolean
    }

    let { instruction, disableLinks = false }: Props = $props()
</script>

<div class="instruction">
    {#if instruction.sizes.length > 0 || instruction.args.length > 0}
        <dl class="facts">
            {#if instruction.sizes.length > 0}
                <dt>Sizes</dt>
                <dd>
                    {fromSizesToString(instruction.sizes, true)}{instruction.defaultSize
                        ? `, ${fromSizeToString(instruction.defaultSize, true)} by default`
                        : ''}
                </dd>
            {/if}
            {#each instruction.args as modes, index (index)}
                <dt>Operand {index + 1}</dt>
                <dd class="code">{getAddressingModeNames(modes)}</dd>
            {/each}
        </dl>
    {/if}
    <MarkdownRenderer
        source={instruction.description}
        linksInNewTab
        {disableLinks}
        centered={false}
        simpleCode
    />
    {#if instruction.example}
        <CodeSample code={instruction.example} label="Example" />
    {/if}
</div>

<style>
    .instruction {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .facts {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.2rem 0.8rem;
        margin: 0;
        padding-bottom: 0.6rem;
        border-bottom: 1px solid
            var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
        font-size: 0.9rem;
    }
    dt {
        color: var(--background-text-muted);
    }
    dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .code {
        font-family: 'Fira Code', monospace;
    }
</style>
