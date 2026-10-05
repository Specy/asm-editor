<script lang="ts">
    /** The Terminal's text, following its end as the program writes. */
    import Console from '$cmp/shared/Console.svelte'

    interface Props {
        text: string
        /** Whether its tab is the one shown: a hidden view has no height to scroll. */
        visible?: boolean
    }

    let { text, visible = true }: Props = $props()
    let element: HTMLDivElement | undefined = $state()

    //also when the tab is shown again, since what was written meanwhile could not be scrolled to
    $effect(() => {
        if (element && visible && text) element.scrollTop = element.scrollHeight
    })
</script>

<div class="terminal" bind:this={element}>
    {#if text}
        <Console value={text} />
    {:else}
        <p class="empty">What the program writes appears here.</p>
    {/if}
</div>

<style>
    /* the scrollbar keeps its room from the start, so output that starts to scroll does not
       shift sideways */
    .terminal {
        flex: 1;
        min-height: 0;
        overflow: auto;
        scrollbar-gutter: stable;
        padding: 0.3rem 0.6rem;
        font-family: 'Fira Code', monospace;
    }

    .empty {
        margin: 0.4rem 0;
        font-family: Rubik, sans-serif;
        font-size: 0.8rem;
        color: var(--hint);
    }
</style>
