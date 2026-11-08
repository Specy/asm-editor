<script lang="ts">
    /**
     * The panel an agent slides in from the right in, over the page: kept mounted once opened so
     * the conversation survives closing it. `FloatingAgentSidebar` and `ExamReviewAgentSidebar` put
     * their agents in it; the Workbench shows agents in its side panel instead.
     */
    import type { Snippet } from 'svelte'

    interface Props {
        open: boolean
        openSize?: string
        verticalOffset?: string
        children: Snippet
    }

    let { open = $bindable(), openSize, verticalOffset = '0px', children }: Props = $props()

    let hasBeenOpened = $state(false)
    let showOpen = $state(false)

    $effect(() => {
        if (open) {
            if (!hasBeenOpened) {
                hasBeenOpened = true
            } else {
                showOpen = true
            }
        } else {
            showOpen = false
        }
    })

    function animateIn(node: HTMLElement) {
        // Force the browser to compute layout with the closed state
        node.getBoundingClientRect()
        showOpen = true
    }
</script>

{#if hasBeenOpened}
    <div
        use:animateIn
        class="floating-sidebar"
        style:--open-size={openSize ?? '28rem'}
        class:open={showOpen}
        style:top={verticalOffset}
        style:height="calc(100% - {verticalOffset})"
    >
        {@render children()}
    </div>
{/if}

<style>
    .floating-sidebar {
        position: fixed;
        right: 0;
        top: 0;
        width: min(var(--open-size), 100vw);
        background-color: color-mix(in srgb, var(--tertiary) 20%, transparent);
        backdrop-filter: blur(0.7rem);
        height: 100dvh;
        z-index: 100;
        border: solid 1px var(--tertiary);
        border-right: none;
        transform: translateX(100%);
        transition: transform var(--dur-base) ease;
        box-shadow: none;
        display: flex;
        flex-direction: column;
        border-top-left-radius: var(--r-overlay);
        border-bottom-left-radius: var(--r-overlay);
        overflow: hidden;
    }

    .floating-sidebar.open {
        transform: translateX(0);
        box-shadow: var(--shadow-2);
    }
</style>
