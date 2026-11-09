<script lang="ts">
    /**
     * The documentation sidebar's instructions, in alphabetical order: the sidebar is for finding a
     * mnemonic by name, and the Workbench's Documentation panel is what groups them by
     * **Instruction category** ([the plan](../../../../../../docs/design/instruction-layout-plan.md),
     * decision 32).
     */
    import type { ResolvedPathname } from '$app/types'
    import Column from '#cmp/shared/layout/Column.svelte'
    import SidebarLink from '#cmp/content/SidebarLink.svelte'

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
        <SidebarLink href={hrefOf(ins)} current={ins === currentInstructionName} {onClick}>
            {ins}
        </SidebarLink>
    {/each}
</Column>
