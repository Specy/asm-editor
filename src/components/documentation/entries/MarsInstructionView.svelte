<script lang="ts">
    /**
     * A MIPS or RISC-V instruction: both Cores describe a mnemonic as a list of variants, one per
     * operand shape, many of which share a description.
     */
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import CodeSample from './CodeSample.svelte'

    type Variant = { description: string; example: string; isRv64Only?: boolean }

    interface Props {
        variants: Variant[]
        disableLinks?: boolean
    }

    let { variants, disableLinks = false }: Props = $props()

    const groups = $derived.by(() => {
        const out: { description: string; examples: string[]; rv64: boolean }[] = []
        for (const variant of variants) {
            const group = out.find((candidate) => candidate.description === variant.description)
            if (group) {
                group.examples.push(variant.example)
                continue
            }
            out.push({
                description: variant.description,
                examples: [variant.example],
                rv64: !!variant.isRv64Only
            })
        }
        return out
    })
</script>

<div class="instruction">
    {#each groups as group, index (index)}
        <div class="variant">
            {#if group.rv64}
                <span class="badge" title="Only on the RV64 target">RV64</span>
            {/if}
            <MarkdownRenderer
                source={group.description}
                linksInNewTab
                {disableLinks}
                centered={false}
                simpleCode
            />
            <CodeSample code={[...new Set(group.examples)].join('\n')} />
        </div>
    {/each}
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
    .badge {
        align-self: flex-start;
        font-size: 0.75rem;
        padding: 0.05rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
</style>
