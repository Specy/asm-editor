<script lang="ts" module>
    export type FindKind = 'hex' | 'text'
</script>

<script lang="ts">
    import { onMount } from 'svelte'
    import SegmentedControl from '#cmp/specific/project/cpu/SegmentedControl.svelte'
    import FaArrowUp from '~icons/fa-solid/arrow-up'
    import FaArrowDown from '~icons/fa-solid/arrow-down'
    import FaTimes from '~icons/fa-solid/times'

    /**
     * The Hex editor's Find and Go to offset, in a small bar over the bytes like Monaco's find
     * widget ([file-views.md](../../../../../../../docs/design/file-views.md), decision 9). Enter
     * finds the next match, Shift+Enter the previous one, both wrapping round the File; Escape
     * closes the bar and gives the keyboard back to the bytes.
     */
    let {
        mode,
        query = $bindable(''),
        kind = $bindable<FindKind>('hex'),
        message,
        matchCount,
        failed = false,
        onSubmit,
        onClose
    }: {
        mode: 'find' | 'goto'
        query?: string
        kind?: FindKind
        /** What the last search or go to found, or why it could not. */
        message?: string
        matchCount?: string
        failed?: boolean
        /** Find the next match, or with `backwards` the previous one; go to the offset typed. */
        onSubmit: (backwards: boolean) => void
        onClose: () => void
    } = $props()
    let input = $state<HTMLInputElement>()

    const KINDS = [
        { id: 'hex', label: 'Hex', title: 'Hex bytes, ?? for any byte' },
        { id: 'text', label: 'Text', title: 'Text' }
    ]

    onMount(() => {
        input?.focus()
        input?.select()
    })

    /** Focuses the query again, as Ctrl+F does while the bar is open. */
    export function focus() {
        input?.focus()
        input?.select()
    }

    function onKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            onSubmit(event.shiftKey)
        } else if (event.key === 'Escape') {
            event.preventDefault()
            event.stopPropagation()
            onClose()
        }
    }
</script>

<div
    class="hex-find-bar"
    role="search"
    aria-label={mode === 'find' ? 'Find in the File' : 'Go to offset'}
>
    <div class="controls">
        {#if mode === 'find'}
            <SegmentedControl
                ariaLabel="Find as"
                options={KINDS}
                selected={kind}
                onSelect={(id) => {
                    kind = id as FindKind
                    input?.focus()
                }}
                style="flex-shrink: 0"
            />
        {/if}
        <input
            bind:this={input}
            bind:value={query}
            class:failed
            aria-label={mode === 'find'
                ? kind === 'hex'
                    ? 'Hex bytes to find'
                    : 'Text to find'
                : 'Offset to go to'}
            placeholder={mode === 'find'
                ? kind === 'hex'
                    ? '7f 45 ?? 46'
                    : 'Text'
                : 'Offset: 1f40, 0x1f40 or #8000'}
            spellcheck="false"
            autocomplete="off"
            onkeydown={onKeydown}
        />
        {#if mode === 'find'}
            <button
                type="button"
                class="icon"
                title="Previous match (Shift+Enter)"
                aria-label="Previous match"
                onclick={() => onSubmit(true)}
            >
                <FaArrowUp />
            </button>
            <button
                type="button"
                class="icon"
                title="Next match (Enter)"
                aria-label="Next match"
                onclick={() => onSubmit(false)}
            >
                <FaArrowDown />
            </button>
        {:else}
            <button type="button" class="go" onclick={() => onSubmit(false)}>Go</button>
        {/if}
        <button
            type="button"
            class="icon"
            title="Close (Escape)"
            aria-label="Close"
            onclick={onClose}><FaTimes /></button
        >
    </div>
    {#if message || matchCount}
        <div class="message" class:failed role="status">
            <span class="message-text">{message ?? ''}</span>
            {#if matchCount}<span class="match-count">{matchCount}</span>{/if}
        </div>
    {/if}
</div>

<style lang="scss">
    .hex-find-bar {
        position: absolute;
        z-index: 4;
        top: 0.3rem;
        right: 1.2rem;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        width: 28rem;
        max-width: calc(100% - 1.6rem);
        padding: 0.3rem;
        border: 1px solid var(--wb-line, var(--tertiary));
        border-radius: 0.4rem;
        background: var(--secondary);
        color: var(--secondary-text);
        box-shadow: 0 0.25rem 0.8rem rgb(0 0 0 / 0.3);
        font-size: 0.8rem;
    }
    .controls {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        width: 100%;
    }
    input {
        flex: 1 1 10rem;
        min-width: 4rem;
        padding: 0.25rem 0.4rem;
        border: 1px solid var(--wb-line, var(--tertiary));
        border-radius: 0.25rem;
        background: var(--primary);
        color: var(--primary-text);
        font-family: monospace;
        font-size: 0.85rem;

        &:focus {
            border-color: var(--accent);
        }
        &.failed {
            border-color: var(--red);
        }
    }
    .message {
        display: flex;
        gap: 0.75rem;
        align-self: stretch;
        padding: 0 0.2rem;
        line-height: 1.2;
        overflow-wrap: anywhere;
        opacity: 0.8;

        &.failed {
            color: var(--red);
            opacity: 1;
        }
    }
    .message-text {
        min-width: 0;
    }
    .match-count {
        margin-left: auto;
        flex-shrink: 0;
        white-space: nowrap;
        text-align: right;
    }
    button {
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
    }
    .icon,
    .go {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        height: 1.6rem;
        min-width: 1.6rem;
        border-radius: 0.25rem;
        background: transparent;
        color: inherit;
        font: inherit;
        cursor: pointer;

        :global(svg) {
            width: 0.75rem;
            height: 0.75rem;
        }
        &:hover {
            background: color-mix(in srgb, var(--tertiary) 55%, transparent);
        }
    }
    .go {
        padding: 0 0.5rem;
        background: color-mix(in srgb, var(--accent) 22%, transparent);
    }
</style>
