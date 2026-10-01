<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import {
        groupZ80VariantsByDescription,
        type Z80InstructionVariant
    } from '$lib/languages/Z80/Z80-documentation'
    import { dedupeZ80Forms } from '$cmp/documentation/z80/z80DocsUtils'
    import CodeSample from './CodeSample.svelte'

    interface Props {
        variants: Z80InstructionVariant[]
        disableLinks?: boolean
    }

    let { variants, disableLinks = false }: Props = $props()

    /**
     * `ld` has 192 forms sharing a dozen descriptions: the first groups show here, with a few of
     * their forms each, and the instruction page has the whole table.
     */
    const MAX_GROUPS = 6
    const MAX_FORMS = 4

    const groups = $derived(groupZ80VariantsByDescription(variants))
</script>

<div class="instruction">
    {#each groups.slice(0, MAX_GROUPS) as group, index (index)}
        <div class="variant">
            {#if group.description}
                <MarkdownRenderer
                    source={group.description}
                    linksInNewTab
                    {disableLinks}
                    centered={false}
                    simpleCode
                />
            {/if}
            <CodeSample code={dedupeZ80Forms(group.instructions).slice(0, MAX_FORMS).join('\n')} />
        </div>
    {/each}
    {#if groups.length > MAX_GROUPS}
        <p class="more">{groups.length - MAX_GROUPS} more on the instruction's page.</p>
    {/if}
</div>

<style>
    .instruction {
        display: flex;
        flex-direction: column;
        gap: 0.8rem;
    }
    .variant {
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .more {
        margin: 0;
        font-size: 0.85rem;
        color: var(--background-text-muted);
    }
</style>
