<script lang="ts">
    /**
     * The documentation sidebar's instructions, in alphabetical order: the sidebar is for finding a
     * mnemonic by name, and the Workbench's Documentation panel is what groups them by
     * **Instruction category** ([the plan](../../../../../../docs/design/instruction-layout-plan.md),
     * decision 32).
     */
    import type { ResolvedPathname } from '$app/types'
    import Column from '#cmp/shared/layout/Column.svelte'

    interface Props {
        currentInstructionName?: string
        names: string[]
        onClick?: (e: MouseEvent) => void
        /** An instruction's page. */
        hrefOf: (name: string) => ResolvedPathname
    }

    let { currentInstructionName = '', names, onClick, hrefOf }: Props = $props()
</script>

<Column>
    {#each names as ins (ins)}
        <a
            href={hrefOf(ins)}
            class="instruction-link"
            class:current-instruction={ins === currentInstructionName}
            aria-current={ins === currentInstructionName ? 'page' : undefined}
            onclick={onClick}
        >
            <div class="instruction-link-inner">
                {ins}
            </div>
        </a>
    {/each}
</Column>

<style lang="scss">
    @use '../../../styles/rows.scss';

    /* the text where a 0.2rem edge used to push it */
    a {
        padding: 0.4rem 0.6rem 0.4rem 0.8rem;
        border-radius: 0 0.2rem 0.2rem 0;
    }

    /* the row under the pointer, and the page you are on (design-system.md, D4) */
    a:hover:not(.current-instruction) {
        background-color: var(--hover-bg);
    }
    .current-instruction {
        @include rows.selected;
    }
    .instruction-link-inner {
        transition: transform var(--dur-fast);
    }
    a:hover > .instruction-link-inner {
        transform: translateX(0.2rem);
    }
</style>
