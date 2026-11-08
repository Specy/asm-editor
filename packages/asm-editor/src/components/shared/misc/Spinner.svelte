<script lang="ts">
    /**
     * Something under way (design-system.md, stage 3 item 7): the spinner icon turning once a
     * second, at the size of the text around it. Alone it is only a mark, hidden from screen
     * readers, for a place that already says what is under way (a button's `aria-busy` and label,
     * a field's live region). With a `label` it says it, in words beside it that a screen reader
     * reads where they are, in a live region (`role="status"`): VoiceOver tends to announce one
     * that appears with its words, NVDA and JAWS seldom do. `announce={false}` leaves the region
     * out, for a wait that another one on the page already announces. `size="lg"` is a page's or a
     * pane's wait, centred in a larger muted text, which the "Loading…" headings were.
     *
     * It keeps turning when the system asks for less motion (`keeps-moving`, global.css), since a
     * spinner that stops no longer says that anything is under way.
     */
    import FaSpinner from '~icons/fa-solid/spinner'
    import type { HTMLAttributes } from 'svelte/elements'

    interface Props extends HTMLAttributes<HTMLSpanElement> {
        /** What is under way, in words: shown beside it and announced. */
        label?: string
        /** The label in a live region (the default), or only in the page's text. */
        announce?: boolean
        /** inline: the size of the text around it; lg: a page's or a pane's wait. */
        size?: 'inline' | 'lg'
    }

    let { label, announce = true, size = 'inline', class: className, ...rest }: Props = $props()
</script>

{#if label}
    <span {...rest} class={['spinner', size, className]} role={announce ? 'status' : undefined}>
        <span class="turning keeps-moving" aria-hidden="true"><FaSpinner /></span>
        <span>{label}</span>
    </span>
{:else}
    <span {...rest} class={['spinner', size, className]} aria-hidden="true">
        <span class="turning keeps-moving"><FaSpinner /></span>
    </span>
{/if}

<style lang="scss">
    .spinner {
        display: inline-flex;
        align-items: center;
        gap: 0.5em;
    }

    .lg {
        display: flex;
        justify-content: center;
        gap: 0.6rem;
        color: var(--text-muted);
        font-family: var(--font-ui);
        font-size: var(--fs-lead);
        font-weight: 500;
        text-align: center;
    }

    .turning {
        display: flex;
        flex: none;
        width: 1em;
        height: 1em;
        animation: spinner-turn 1s linear infinite;

        :global(svg) {
            width: 100%;
            height: 100%;
        }
    }

    @keyframes spinner-turn {
        to {
            transform: rotate(360deg);
        }
    }
</style>
