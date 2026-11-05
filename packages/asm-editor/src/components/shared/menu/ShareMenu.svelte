<script lang="ts">
    import type { Snippet } from 'svelte'
    import ContextMenu from './ContextMenu.svelte'
    import type { ShareStartAction } from '#lib/shareStart.ts'

    let {
        onShare,
        trigger
    }: {
        onShare: (action?: ShareStartAction) => void
        trigger: Snippet<[{ open: (event: MouseEvent) => void; expanded: boolean }]>
    } = $props()

    let menu = $state<{ x: number; y: number } | null>(null)
    function open(event: MouseEvent) {
        const bounds = (event.currentTarget as HTMLElement).getBoundingClientRect()
        menu = { x: bounds.left + 16, y: bounds.bottom + 4 }
    }
</script>

{@render trigger({ open, expanded: menu !== null })}
{#if menu}
    <ContextMenu
        x={menu.x}
        y={menu.y}
        label="Share options"
        arrow
        onClose={() => (menu = null)}
        items={[
            { label: 'Copy link', onSelect: () => onShare() },
            { label: 'Copy link to build on open', onSelect: () => onShare('build') },
            { label: 'Copy link to build and run on open', onSelect: () => onShare('buildAndRun') }
        ]}
    />
{/if}
