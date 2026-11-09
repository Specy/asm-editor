<script lang="ts" module>
    export type FindKind = 'hex' | 'text'
</script>

<script lang="ts">
    import { onMount } from 'svelte'
    import SegmentedControl from '#cmp/shared/input/SegmentedControl.svelte'
    import FaArrowUp from '~icons/fa-solid/arrow-up'
    import FaArrowDown from '~icons/fa-solid/arrow-down'
    import FaTimes from '~icons/fa-solid/times'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import TextField from '#cmp/shared/input/TextField.svelte'
    import { readsAsHex } from './hexSearch'

    /**
     * The Hex editor's Find and Go to offset, in a small bar over the bytes like Monaco's find
     * widget ([file-views.md](../../../../../../../docs/design/file-views.md), decision 9). Enter
     * finds the next match, Shift+Enter the previous one, both wrapping round the File; Escape
     * closes the bar and gives the keyboard back to the bytes. Text typed while Find is on Hex
     * turns it to Text, as the strip shows, instead of being refused as bytes.
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
        { id: 'text', label: 'Text' }
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

    function onInput(event: Event) {
        const text = (event.currentTarget as HTMLInputElement).value
        if (mode === 'find' && kind === 'hex' && !readsAsHex(text)) kind = 'text'
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
        <TextField
            size="sm"
            mono
            invalid={failed}
            bind:el={input}
            bind:value={query}
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
            autocomplete="off"
            oninput={onInput}
            onkeydown={onKeydown}
        />
        {#if mode === 'find'}
            <IconButton
                size="sm"
                label="Previous match"
                {@attach tooltip('Previous match', { shortcut: 'Shift+Enter' })}
                onClick={() => onSubmit(true)}
            >
                <FaArrowUp />
            </IconButton>
            <IconButton
                size="sm"
                label="Next match"
                {@attach tooltip('Next match', { shortcut: 'Enter' })}
                onClick={() => onSubmit(false)}
            >
                <FaArrowDown />
            </IconButton>
        {:else}
            <button type="button" class="go" onclick={() => onSubmit(false)}>Go</button>
        {/if}
        <IconButton
            size="sm"
            label="Close"
            {@attach tooltip('Close', { shortcut: 'Escape' })}
            onClick={onClose}><FaTimes /></IconButton
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
    @use '../../../shared/button/tray.scss';
    @use '../../../../styles/focus.scss';

    /* a Tray over the bytes' top right corner, as Monaco's find widget is over the code's */
    .hex-find-bar {
        @include tray.surface;
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
        font-size: var(--fs-small);
    }
    .controls {
        display: flex;
        align-items: center;
        gap: 0.25rem;
        width: 100%;
    }
    .controls :global(.text-field) {
        flex: 1 1 10rem;
        min-width: 4rem;
        height: 1.6rem;
        font-size: var(--fs-small);
    }
    .message {
        display: flex;
        gap: 0.75rem;
        align-self: stretch;
        padding: 0 0.2rem;
        line-height: 1.2;
        overflow-wrap: anywhere;
        color: var(--text-muted);

        &.failed {
            color: var(--danger);
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
        @include focus.focus-ring($inset: true);
    }
    .go {
        display: grid;
        place-items: center;
        flex-shrink: 0;
        height: 1.6rem;
        min-width: 1.6rem;
        padding: 0 0.5rem;
        border-radius: 0.25rem;
        background: color-mix(in srgb, var(--accent) 22%, transparent);
        color: inherit;
        font: inherit;
        cursor: pointer;

        /* the hover every tray tool takes (tray.tool-look): the bar's text at 10%, over Go's own
           tint */
        &:hover {
            background-image: linear-gradient(var(--hover-bg), var(--hover-bg));
        }
    }
</style>
