<script lang="ts">
    import Card from '$cmp/shared/layout/Card.svelte'
    import Column from '$cmp/shared/layout/Column.svelte'
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import { z80Directives } from '$lib/languages/Z80/Z80-documentation'

    interface Props {
        disableLinks?: boolean
    }

    let { disableLinks = false }: Props = $props()
</script>

<Column gap="1rem" style="width: 100%;">
    {#each z80Directives as directive (directive.primary)}
        <Card gap="0.6rem" padding="1rem" background="secondary" style="width: 100%;">
            <h2 class="sub-title">{directive.primary}</h2>
            <span class="sub-description">
                <MarkdownRenderer source={directive.description} {disableLinks} />
            </span>
            {#if directive.names.length > 1}
                <!-- The assembler accepts several spellings of the same directive, so a program
                     written for another assembler usually keeps working. -->
                <div class="synonyms">
                    <span class="synonyms-label">Also written as</span>
                    {#each directive.names.slice(1) as name (name)}
                        <span class="synonym">{name}</span>
                    {/each}
                </div>
            {/if}
        </Card>
    {/each}
</Column>

<style lang="scss">
    .sub-title {
        font-family: FiraCode;
    }
    .synonyms {
        display: flex;
        flex-wrap: wrap;
        gap: 0.3rem;
        align-items: center;
    }
    .synonyms-label {
        font-size: 0.8rem;
        opacity: 0.8;
        margin-right: 0.2rem;
    }
    .synonym {
        font-family: FiraCode;
        font-size: 0.8rem;
        padding: 0.1rem 0.4rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
</style>
