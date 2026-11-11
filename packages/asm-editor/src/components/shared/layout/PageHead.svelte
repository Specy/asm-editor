<script lang="ts">
    /**
     * A page's title (`Header`, the page title's look, design-system.md D8) and the line under it
     * that says what the page is for or where to begin, in muted text with its links in the accent.
     *
     * By default the title keeps the room above it that the other pages give theirs, the line sits
     * 0.5rem under it, and the head leaves 1.5rem under itself, the room the other pages leave under
     * their titles; `centred` centres it over a centred column (the create page). `compact` is the
     * owner's exception for a tool page whose work should start higher (the exam builder's and the
     * embed builder's): the title a step of the scale down (`--fs-h2`) with no room of its own
     * above or below, the line 0.35rem under it, and the room round the head the page's.
     */
    import type { Snippet } from 'svelte'
    import Header from './Header.svelte'

    interface Props {
        title: string
        /** The line under the title. */
        lead?: Snippet
        centred?: boolean
        compact?: boolean
        /** A class for the page to place the head with. */
        class?: string
    }

    let { title, lead, centred = false, compact = false, class: className }: Props = $props()
</script>

<header class={['page-head', className]} class:centred class:compact>
    <Header>{title}</Header>
    {#if lead}
        <p class="lead">{@render lead()}</p>
    {/if}
</header>

<style>
    .page-head {
        margin-bottom: 1.5rem;
    }
    .page-head :global(h1) {
        margin-bottom: 0;
    }

    .centred {
        text-align: center;
    }

    .compact {
        margin-bottom: 0;
    }
    .compact :global(h1) {
        margin: 0;
        font-size: var(--fs-h2);
    }

    .lead {
        margin: 0.5rem 0 0;
        line-height: 1.6;
        color: var(--text-muted);
    }
    .lead :global(a) {
        color: var(--accent);
    }
    .compact .lead {
        margin-top: 0.35rem;
    }
</style>
