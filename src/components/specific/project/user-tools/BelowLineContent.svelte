<script lang="ts">
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'

    let { md, note, instructions, currentAddress } = $props<{
        md: string
        note: string
        instructions?: { address: bigint; code: string }[]
        currentAddress?: bigint
    }>()
</script>

<div class="below-line-content">
    {#if instructions}
        <div class="generated-code">
            {#each instructions as instruction, index (`${instruction.address}:${index}`)}
                <div class:current={instruction.address === currentAddress}>
                    <span>0x{instruction.address.toString(16).toUpperCase()}</span>
                    <code>{instruction.code}</code>
                </div>
            {/each}
        </div>
    {:else}
        <MarkdownRenderer source={md} simpleCode />
    {/if}
    {#if note}
        <div class="note">
            {note}
        </div>
    {/if}
</div>

<style lang="scss">
    .below-line-content {
        position: relative;
        background-color: rgba(var(--RGB-tertiary), 0.3);
        //border-top: 0.1rem solid rgba(var(--RGB-accent), 0.5);
        //border-bottom: 0.1rem solid rgba(var(--RGB-accent), 0.5);
        border-left: solid 1px #404040;
        padding: 0.1rem 0;
        font-size: 1rem;
    }

    .note {
        position: absolute;
        top: 50%;
        right: 0.5rem;
        line-height: 1;
        opacity: 0.5;
        font-size: 0.8rem;
        transform: translateY(-50%);
    }

    .generated-code {
        padding: 0.2rem 0.5rem;
        overflow-x: auto;
        background: var(--secondary);
        font-family: 'Fira Mono', monospace;
        white-space: pre;

        > div {
            display: flex;
            gap: 0.8rem;
            padding-inline: 0.25rem;
            border-left: 2px solid transparent;

            &.current {
                border-left-color: var(--accent);
                background: rgba(var(--RGB-accent), 0.16);
            }

            span {
                color: var(--accent);
                opacity: 0.8;
            }
        }
    }
</style>
