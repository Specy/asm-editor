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
            class="row"
            aria-current={ins === currentInstructionName ? 'page' : undefined}
            onclick={onClick}
        >
            {ins}
        </a>
    {/each}
</Column>

<style lang="scss">
    @use '../../../styles/outline.scss';
    @use '../../../styles/focus.scss' as *;

    /* the outline's rows (styles/outline.scss), as the course sidebar's lectures are: run out to
       the sidebar's left edge by the caller, edge to edge with no gap, their padding the rhythm,
       rounded on the far side, the one under the pointer in the hover tint and the instruction
       shown in the current item's look; the keyboard's ring inside the row. The text starts at
       the caller's `--instruction-indent`, under its heading's name. */
    .row {
        @include outline.row('[aria-current="page"]');
        @include outline.row-padding;
        @include focus-ring($inset: true);
        padding-left: var(--instruction-indent, 0.75rem);
        font-size: var(--fs-body);
    }
</style>
