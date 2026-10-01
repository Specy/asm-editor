<script lang="ts">
    /**
     * The search box of the Documentation panel and of the palette. While the model is still
     * downloading and the reader types, a spinner says the results are by words only for now
     * ([ADR 0026](../../../docs/adr/0026-hybrid-search-in-the-browser-over-a-build-time-index.md)).
     */
    import FaSearch from '~icons/fa-solid/search'
    import FaTimes from '~icons/fa-solid/times'
    import { searchClient } from '$lib/search/searchClient.svelte'
    import type { HTMLInputAttributes } from 'svelte/elements'

    interface Props extends Omit<HTMLInputAttributes, 'value'> {
        value: string
        el?: HTMLInputElement
        placeholder?: string
        /** A label for screen readers, when there is no visible one. */
        label?: string
    }

    let {
        value = $bindable(),
        el = $bindable(),
        placeholder = 'Search',
        label = 'Search',
        ...rest
    }: Props = $props()

    const downloading = $derived(searchClient.model === 'loading' && value.trim().length > 0)
</script>

<div class="search-field">
    <span class="icon" aria-hidden="true">
        {#if downloading}
            <span class="spinner" title="Downloading the search model: matching words only for now"
            ></span>
        {:else}
            <FaSearch />
        {/if}
    </span>
    <input
        bind:this={el}
        bind:value
        type="search"
        spellcheck="false"
        autocomplete="off"
        aria-label={label}
        {placeholder}
        {...rest}
    />
    {#if value}
        <button
            type="button"
            class="clear"
            title="Clear the search"
            aria-label="Clear the search"
            onclick={() => {
                value = ''
                el?.focus()
            }}
        >
            <FaTimes />
        </button>
    {/if}
</div>

<style>
    .search-field {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.45rem 0.6rem;
        border-radius: 0.5rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        min-width: 0;
    }
    .search-field:focus-within {
        outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
    }
    .icon {
        display: flex;
        width: 0.95rem;
        height: 0.95rem;
        flex: none;
        opacity: 0.7;
    }
    input {
        flex: 1;
        min-width: 0;
        border: none;
        outline: none;
        background: transparent;
        color: inherit;
        font: inherit;
        padding: 0;
    }
    input::-webkit-search-cancel-button {
        display: none;
    }
    .clear {
        display: flex;
        flex: none;
        width: 1.4rem;
        height: 1.4rem;
        padding: 0.3rem;
        border: none;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        cursor: pointer;
        opacity: 0.7;
    }
    .clear:hover {
        opacity: 1;
        background-color: color-mix(in srgb, var(--tertiary-text) 12%, transparent);
    }
    .spinner {
        width: 100%;
        height: 100%;
        border-radius: 50%;
        border: 2px solid color-mix(in srgb, var(--tertiary-text) 30%, transparent);
        border-top-color: var(--accent);
        animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
        to {
            transform: rotate(360deg);
        }
    }
</style>
