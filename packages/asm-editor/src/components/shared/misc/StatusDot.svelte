<script lang="ts">
    /**
     * A small round mark of how something stands: a Testcase passed or failed, the Testcases
     * panel's rail entry after a run, a toast's kind (design-system.md, stage 3 item 7). Its
     * colour is its `tone`, or a `color` of the caller's for a kind the caller colours itself;
     * `hollow` draws only its ring, for a state not reached yet (a Testcase not run). Without a
     * `label` it repeats what text beside it says and is hidden from screen readers; with one it
     * is an image of that name.
     */
    import type { HTMLAttributes } from 'svelte/elements'

    interface Props extends HTMLAttributes<HTMLSpanElement> {
        tone?: 'neutral' | 'accent' | 'success' | 'danger' | 'warning'
        /** A colour of the caller's, in place of the tone's. */
        color?: string
        /** Its ring alone. */
        hollow?: boolean
        /** What it says, for a dot that nothing beside it says in words. */
        label?: string
    }

    let {
        tone = 'neutral',
        color,
        hollow = false,
        label,
        class: className,
        ...rest
    }: Props = $props()
</script>

<span
    {...rest}
    class={['status-dot', tone, className]}
    class:hollow
    style:--dot-color={color}
    role={label ? 'img' : undefined}
    aria-label={label}
    aria-hidden={label ? undefined : 'true'}
></span>

<style lang="scss">
    .status-dot {
        display: inline-block;
        flex: none;
        box-sizing: border-box;
        width: 0.5rem;
        height: 0.5rem;
        border: 1.5px solid var(--dot-color, var(--dot-tone));
        border-radius: var(--r-pill);
        background-color: var(--dot-color, var(--dot-tone));
    }

    .hollow {
        background-color: transparent;
    }

    .neutral {
        --dot-tone: var(--hint);
    }
    .accent {
        --dot-tone: var(--accent);
    }
    .success {
        --dot-tone: var(--success);
    }
    .danger {
        --dot-tone: var(--danger);
    }
    .warning {
        --dot-tone: var(--warning);
    }
</style>
