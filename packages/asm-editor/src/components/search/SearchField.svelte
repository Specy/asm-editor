<script lang="ts">
    /**
     * A search or filter box: an icon, the field, the controls a caller adds at its end, and a
     * clear button once something is typed, drawn as every field is (`styles/field.scss`). The
     * Documentation panel's and the palette's search a `scope` of the Documentation: pointing at
     * one, focusing it or typing in it starts its index loading, then the search model
     * ([ADR 0026](../../../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
     * While either loads a spinner stands in for its icon. While the index loads, the list under it
     * says so and the status only tells screen readers; while the model loads, the status says
     * that the results match words for now. The status is a live region, there from the start so
     * its change is announced; on a narrow box only the spinner shows and the words are left to
     * screen readers. The Symbols and Search panels' filters have no scope: they match the
     * Project's own text.
     *
     * A box with a scope marks the query's Search modifiers in the accent colour, in place in the
     * text, drawn under the field by `QueryMarks`, which shows what each did in a Tooltip; screen
     * readers hear the same words from a second live region beside the status
     * ([the design record](../../../../../docs/design/documentation-search.md), Search modifiers).
     */
    import type { Component, Snippet } from 'svelte'
    import FaSearch from '~icons/fa-solid/search'
    import FaTimes from '~icons/fa-solid/times'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import { readQuery } from '#lib/search/queryModifiers.ts'
    import type { SearchScope } from '#lib/search/scope.ts'
    import type { HTMLInputAttributes } from 'svelte/elements'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import QueryMarks from './QueryMarks.svelte'

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
        /** The Documentation it searches, whose index and model it warms and reports on. */
        scope?: SearchScope
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
        scope,
        icon: Icon = FaSearch,
        size = 'md',
        clearable = true,
        clearLabel = 'Clear the search',
        invalid = false,
        end,
        ...rest
    }: Props = $props()

    /** What is still coming: the words to search, then the model that adds meaning. */
    const loading = $derived.by((): 'index' | 'model' | null => {
        if (!scope) return null
        const index = searchClient.indexStatus(scope)
        if (index === 'loading' || index === 'partial') return 'index'
        return searchClient.model === 'loading' ? 'model' : null
    })
    const warm = () => {
        if (scope) searchClient.warm(scope)
    }

    const marks = $derived(scope ? readQuery(value ?? '', scope).marks : [])
    /** What the Search modifiers did, once each, for screen readers. */
    const markWords = $derived(
        [...new Set(marks.map((mark) => mark.label))].map((label) => `${label}.`).join(' ')
    )
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
    <span class="typed">
        {#if scope}
            <QueryMarks input={el} value={value ?? ''} {marks} />
        {/if}
        <input
            bind:this={el}
            bind:value
            type="search"
            spellcheck="false"
            autocomplete="off"
            aria-label={label}
            aria-busy={scope ? loading !== null : undefined}
            oninput={warm}
            {placeholder}
            {...rest}
        />
    </span>
    {#if scope}
        <!-- the index's wait is shown in the list under the box, these words only read out -->
        <span
            class="status"
            class:visually-hidden={loading !== 'model'}
            role="status"
            title={loading === 'model'
                ? 'Search by meaning is still downloading. Until it is ready, results match the words you type.'
                : undefined}
        >
            {#if loading === 'index'}Loading search…{:else if loading === 'model'}Matching words
                until meaning search loads…{/if}
        </span>
        <!-- what the marks in the text say when pointed at, read out as they change -->
        <span class="visually-hidden" role="status">{markWords}</span>
    {/if}
    {@render end?.()}
    {#if clearable && value}
        <IconButton
            size="sm"
            quiet
            fill
            class="clear"
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

    /* a field (styles/field.scss) round its icon, its text and its buttons; its height, its
       padding and its edge named, which its clear button reaches across */
    .search-field {
        @include field.box;
        --field-height: calc(1.4rem + 0.9rem);
        --field-pad-block: 0.45rem;
        --field-pad-start: 0.6rem;
        --field-pad-end: 0.6rem;
        --field-edge: 1px;
        container-type: inline-size;
        position: relative;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: var(--field-pad-block) var(--field-pad-end) var(--field-pad-block)
            var(--field-pad-start);
        /* Tall enough for the clear button, so the field does not grow when it appears. */
        min-height: var(--field-height);
        min-width: 0;
    }
    /* The clear button runs edge to edge (IconButton's `fill`): the box's whole height inside its
       edge, a square at its end across the padding, its outer corners following the box's (D12)
       and its inner ones square (owner, 2026-11-08) */
    .search-field > :global(.clear) {
        --icon-button-cell: calc(var(--field-height) - 2 * var(--field-edge));
        --icon-button-radius: 0 #{nested-radius(var(--r-control), $border: 1px)}
            #{nested-radius(var(--r-control), $border: 1px)} 0;
        margin: calc(-1 * var(--field-pad-block)) calc(-1 * var(--field-pad-end))
            calc(-1 * var(--field-pad-block)) 0;
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
        --field-height: 2rem;
        --field-pad-block: 0.2rem;
        --field-pad-end: 0.25rem;
        gap: 0.45rem;

        > :global(.icon-button:not(.clear)) {
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
        --field-pad-block: 0.5rem;
        --field-pad-start: 0.4rem;
        --field-pad-end: 0.4rem;
        --field-edge: 0px;
        gap: 0.65rem;
        border: none;
        background-color: transparent;
        color: inherit;
        font-size: var(--fs-body);
    }
    /* A bare field's clear button reaches across the band round it too, to the band's edges: the
       band says how far, with `--band-pad-block` (its padding above and below the field),
       `--band-pad-end` (its padding after it) and `--band-corner` (the corner of what it is the
       top of, which the button's top end follows), as the palette's top does (SearchPalette's
       `.top`). With none of them it fills the field's own box. */
    .search-field.bare > :global(.clear) {
        --icon-button-cell: calc(var(--field-height) + 2 * var(--band-pad-block, 0px));
        --icon-button-radius: 0 var(--band-corner, 0px) 0 0;
        margin: calc(-1 * (var(--field-pad-block) + var(--band-pad-block, 0px)))
            calc(-1 * (var(--field-pad-end) + var(--band-pad-end, 0px)))
            calc(-1 * (var(--field-pad-block) + var(--band-pad-block, 0px))) 0;
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
    /* the field and, with a scope, its query drawn under it (QueryMarks), in the field's place */
    .typed {
        position: relative;
        display: flex;
        flex: 1;
        min-width: 0;
    }
    /* positioned, so it is drawn over the query under it */
    input {
        position: relative;
        flex: 1;
        padding: 0;
    }
    /* its text drawn by QueryMarks, its caret still its own (the text colour) */
    input[data-drawn-under] {
        -webkit-text-fill-color: transparent;
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
