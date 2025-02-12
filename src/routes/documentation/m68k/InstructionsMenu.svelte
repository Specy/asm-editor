<script lang="ts">
    import { createBubbler } from 'svelte/legacy'

    import Column from '$cmp/shared/layout/Column.svelte'
    interface Props {
        currentInstructionName?: string
        instructions: string[]
        onClick?: (e: MouseEvent) => void
        hrefBase: string
    }

    let { currentInstructionName = '', instructions, onClick, hrefBase}: Props = $props()
</script>

<Column>
    {#each instructions as ins}
        <a
            href="{hrefBase}/{ins}"
            class="instruction-link"
            class:current-instruction={ins === currentInstructionName}
            onclick={onClick}
        >
            <div class="instruction-link-inner">
                {ins}
            </div>
        </a>
    {/each}
</Column>

<style lang="scss">
    a {
        padding: 0.4rem 0.6rem;
        border-radius: 0 0.2rem 0.2rem 0;
        border-left: solid 0.2rem transparent;
    }

    a:hover {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        border-left-color: var(--accent);
    }
    .current-instruction {
        border-left-color: var(--accent2);
        background-color: rgba(var(--RGB-tertiary), 0.5);
    }
    .instruction-link-inner {
        transition: transform 0.1s;
    }
    a:hover > .instruction-link-inner {
        transform: translateX(0.2rem);
    }
</style>
