<script lang="ts">
    /**
     * The panel an agent slides in from the right in, over the page: kept mounted once opened so
     * the conversation survives closing it, and inert while closed, so neither the keyboard nor a
     * screen reader reaches it off screen. `FloatingAgentSidebar` and `ExamReviewAgentSidebar` put
     * their agents in it, and the chat page, which shows its agent in place, filling the page,
     * until an example opens beside it and the agent floats over it. The Workbench shows agents
     * in its side panel instead.
     */
    import type { Snippet } from 'svelte'

    interface Props {
        open: boolean
        openSize?: string
        verticalOffset?: string
        /** Over the page from the right edge; otherwise in place, filling its parent. */
        floating?: boolean
        /** On a phone, in the flow at the full width and `--agent-phone-height` tall, not over it. */
        stackOnPhones?: boolean
        children: Snippet
    }

    let {
        open = $bindable(),
        openSize,
        verticalOffset = '0px',
        floating = true,
        stackOnPhones = false,
        children
    }: Props = $props()

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
        class="agent-frame"
        class:floating
        class:stack-on-phones={stackOnPhones}
        style:--open-size={openSize ?? '28rem'}
        class:open={showOpen}
        style:--frame-top={verticalOffset}
        inert={!open}
    >
        {@render children()}
    </div>
{/if}

<style>
    /* in place, as the chat page shows its agent before an example opens */
    .agent-frame {
        position: relative;
        flex: 1;
        min-width: 0;
        height: 100%;
    }

    .floating {
        position: fixed;
        right: 0;
        top: var(--frame-top);
        width: min(var(--open-size), 100vw);
        background-color: color-mix(in srgb, var(--tertiary) 20%, transparent);
        backdrop-filter: blur(0.7rem);
        height: calc(100% - var(--frame-top));
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

    .floating.open {
        transform: translateX(0);
        box-shadow: var(--shadow-2);
    }

    /* the chat page's phone layout: the agent above the example, in the page's own colour */
    @media (max-width: 900px) {
        .floating.stack-on-phones {
            position: relative;
            top: auto;
            right: auto;
            width: 100vw;
            height: var(--agent-phone-height, 75dvh);
            flex: 0 0 var(--agent-phone-height, 75dvh);
            background-color: var(--background);
            backdrop-filter: none;
            border: none;
            border-bottom: 1px solid var(--tertiary);
            border-radius: 0;
            transform: none;
            box-shadow: none;
        }
    }
</style>
