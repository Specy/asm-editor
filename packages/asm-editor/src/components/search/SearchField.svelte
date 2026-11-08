<script lang="ts">
    /**
     * A search or filter box: an icon, the field, the controls a caller adds at its end, and a
     * clear button once something is typed, drawn as every field is (`styles/field.scss`). The
     * Documentation panel's and the palette's are `semantic`: pointing at one, focusing it or
     * typing in it starts the search model loading; while it loads, a spinner and a short status
     * say the results are by words only for now
     * ([ADR 0026](../../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
     * The status is a live region, there from the start so its change is announced; on a narrow
     * box only the spinner shows and the words are left to screen readers. The Symbols and Search
     * panels' filters are not: they match the Project's own text.
     */
    import type { Component, Snippet } from 'svelte'
    import FaSearch from '~icons/fa-solid/search'
    import FaTimes from '~icons/fa-solid/times'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import type { HTMLInputAttributes } from 'svelte/elements'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'

    interface Props extends Omit<HTMLInputAttributes, 'value' | 'size'> {
        value: string
        el?: HTMLInputElement
        placeholder?: string
        /** A label for screen readers, when there is no visible one. */
        label?: string
        /**
         * No box of its own: the palette's field is the top of the palette, ruled off from the
         * results, rather than a box inside it.
         */
        bare?: boolean
        /** Whether it searches with the search model, which it then warms and reports on. */
        semantic?: boolean
        /** The icon at its start, a magnifier when left out. */
        icon?: Component
        /** `sm` for a side panel's filter. */
        size?: 'sm' | 'md'
        /** Whether a button to clear it shows once something is typed. */
        clearable?: boolean
        /** The clear button's name and Tooltip. */
        clearLabel?: string
        /** Edged in the danger colour; the caller says why (`aria-invalid`, `aria-describedby`). */
        invalid?: boolean
        /** Controls at its end, before the clear button, such as a search's options. */
        end?: Snippet
    }

    let {
        value = $bindable(),
        el = $bindable(),
        placeholder = 'Search',
        label = 'Search',
        bare = false,
        semantic = false,
        icon: Icon = FaSearch,
        size = 'md',
        clearable = true,
        clearLabel = 'Clear the search',
        invalid = false,
        end,
        ...rest
    }: Props = $props()

    const loading = $derived(semantic && searchClient.model === 'loading')
    const warm = () => {
        if (semantic) searchClient.warmModel()
    }
</script>

<div
    class="search-field {size}"
    class:bare
    class:invalid
    onpointerenter={warm}
    onfocusin={warm}
    role="presentation"
>
    <span class="icon" aria-hidden="true">
        {#if loading}
            <Spinner />
        {:else}
            <Icon />
        {/if}
    </span>
    <input
        bind:this={el}
        bind:value
        type="search"
        spellcheck="false"
        autocomplete="off"
        aria-label={label}
        aria-busy={semantic ? loading : undefined}
        oninput={warm}
        {placeholder}
        {...rest}
    />
    {#if semantic}
        <span
            class="status"
            class:visually-hidden={!loading}
            role="status"
            title={loading
                ? 'Downloading the search model: matching words only for now'
                : undefined}
        >
            {#if loading}Loading semantic search…{/if}
        </span>
    {/if}
    {@render end?.()}
    {#if clearable && value}
        <IconButton
            size="sm"
            quiet
            label={clearLabel}
            {@attach tooltip(clearLabel)}
            onClick={() => {
                value = ''
                el?.focus()
            }}
        >
            <FaTimes />
        </IconButton>
    {/if}
</div>

<style lang="scss">
    @use '../../styles/field.scss';
    @use '../../styles/radius.scss' as *;
    @use '../../styles/visually-hidden.scss' as *;

    /* a field (styles/field.scss) round its icon, its text and its buttons */
    .search-field {
        @include field.box;
        container-type: inline-size;
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.6rem;
        /* Tall enough for the clear button, so the field does not grow when it appears. */
        min-height: calc(1.4rem + 0.9rem);
        min-width: 0;
    }
    /* a side panel's: as tall as its rows of controls, its buttons a quarter rem inside its edge,
       their corners running parallel to its own (D12); the caller's buttons at its end take the
       same corner, `--search-field-inner-radius` */
    .search-field.sm {
        --search-field-inner-radius: #{nested-radius(
                var(--r-control),
                $border: 1px,
                $inset: 0.25rem
            )};
        gap: 0.45rem;
        min-height: 2rem;
        padding: 0.2rem 0.25rem 0.2rem 0.6rem;

        > :global(.icon-button) {
            border-radius: var(--search-field-inner-radius);
        }
    }
    .search-field.invalid {
        border-color: var(--danger);
    }
    .search-field.invalid:has(input:focus-visible) {
        outline-color: var(--danger);
    }
    .search-field.bare {
        gap: 0.65rem;
        padding: 0.5rem 0.4rem;
        border: none;
        background-color: transparent;
        color: inherit;
        font-size: var(--fs-body);
    }
    /* the caret is enough: the field is the only thing in its dialog that takes focus */
    .search-field.bare:has(input:focus-visible) {
        outline: none;
    }
    .bare .icon {
        width: var(--fs-body);
        height: var(--fs-body);
        opacity: 0.6;
    }
    .bare input::placeholder {
        color: var(--hint);
    }
    /* its font size the box's, which the spinner standing in for the icon is drawn at */
    .icon {
        display: flex;
        width: var(--fs-body);
        height: var(--fs-body);
        flex: none;
        font-size: 0.95rem;
        opacity: 0.7;
    }
    .sm .icon {
        width: var(--fs-caption);
        height: var(--fs-caption);
        font-size: 0.75rem;
    }
    input {
        flex: 1;
        padding: 0;
    }
    input::-webkit-search-cancel-button {
        display: none;
    }
    .status {
        flex: none;
        font-size: var(--fs-caption);
        white-space: nowrap;
        color: var(--text-muted);
    }
    /* Too narrow for the words beside the query: the spinner alone shows, the words stay for
       screen readers. Out of sight while quiet too (the global class), so the live region is there
       before it speaks. */
    @container (max-width: 20rem) {
        .status {
            @include visually-hidden;
        }
    }
</style>
