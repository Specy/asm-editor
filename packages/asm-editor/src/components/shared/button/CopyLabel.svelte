<script lang="ts">
    /**
     * A copy button's label, which turns into a check and "Copied" while `copied` (CopyFeedback).
     * The two sit in one grid cell, so the button keeps the width of the wider and nothing beside
     * it moves. The label stays the button's name all along, only out of sight: the pill saying
     * what was copied is what a screen reader reads (LoggerProvider), and "Copied" is not read
     * again as the button's new name. The faces are flex rows with the button's own `gap`.
     */
    import type { Snippet } from 'svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaCheck from '~icons/fa-solid/check'

    interface Props {
        copied: boolean
        /** The button's own label: its words and icon. */
        children: Snippet
    }

    let { copied, children }: Props = $props()
</script>

<span class="copy-label">
    <span class="face" class:gone={copied}>{@render children()}</span>
    <span class="face done" class:shown={copied} aria-hidden="true">
        <Icon size="small"><FaCheck /></Icon>
        Copied
    </span>
</span>

<style>
    .copy-label {
        display: inline-grid;
        gap: inherit;
    }
    .face {
        grid-area: 1 / 1;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: inherit;
        transition:
            opacity var(--dur-fast),
            visibility var(--dur-fast);
    }
    /* still in the accessibility tree, so the button's name does not change */
    .gone {
        opacity: 0;
    }
    .done:not(.shown) {
        visibility: hidden;
        opacity: 0;
    }
</style>
