<script lang="ts">
    /**
     * The search palette of the documentation pages and the Courses: a box and one ranked list over
     * the page, ↑ and ↓ to move, Enter to go, Esc to close; a full-screen sheet on a phone
     * ([the design record](../../../docs/design/documentation-search.md), Search on the
     * documentation pages and in the Courses). These pages may navigate, so a result is a place to
     * go: an entry's own page or its anchor on its Chapter's page, a Lecture section's heading.
     *
     * The layout mounts it beside its sidebar, inside its theme scope: a fixed element inside the
     * sidebar, the navbar or a page would be broken by their transforms, and the theme's colours
     * live on the scope rather than on the document.
     */
    import { tick, untrack } from 'svelte'
    import { cubicOut } from 'svelte/easing'
    import FaArrowDown from '~icons/fa-solid/arrow-down'
    import FaArrowUp from '~icons/fa-solid/arrow-up'
    import { goto } from '$app/navigation'
    import { hasCodeName } from '$lib/documentation/entries'
    import { queryTerms, type SearchResult } from '$lib/search/engine'
    import { searchClient } from '$lib/search/searchClient.svelte'
    import type { SearchScope } from '$lib/search/scope'
    import HighlightedText from './HighlightedText.svelte'
    import SearchField from './SearchField.svelte'
    import { closeSearchPalette, openSearchPalette, searchPalette } from './paletteState.svelte'
    import { listenForSearchKey } from './searchHotkey'

    interface Props {
        scope: SearchScope
        placeholder?: string
    }

    let { scope, placeholder = 'Search' }: Props = $props()

    let query = $state('')
    let results = $state<SearchResult[]>([])
    let searched = $state('')
    let selected = $state(0)
    let input = $state<HTMLInputElement>()
    let list = $state<HTMLUListElement>()
    let opener: HTMLElement | null = null

    const terms = $derived(queryTerms(query))

    $effect(() => listenForSearchKey(() => openSearchPalette()))

    $effect(() => {
        if (!searchPalette.open) return
        untrack(() => {
            opener = document.activeElement as HTMLElement | null
            query = searchPalette.query
            selected = 0
            void tick().then(() => {
                input?.focus()
                const end = input?.value.length ?? 0
                input?.setSelectionRange(end, end)
            })
        })
    })

    let generation = 0
    $effect(() => {
        const text = query.trim()
        const where = scope
        if (!searchPalette.open || !text) {
            results = []
            searched = ''
            return
        }
        const mine = ++generation
        const timer = setTimeout(() => {
            searchClient.search(where, text, 20).then(
                (answer) => {
                    if (mine !== generation) return
                    results = answer.results
                    searched = text
                    selected = 0
                },
                () => {
                    if (mine !== generation) return
                    results = []
                    searched = text
                }
            )
        }, 100)
        return () => clearTimeout(timer)
    })

    function reducedMotion(): boolean {
        return window.matchMedia('(prefers-reduced-motion: reduce)').matches
    }

    function backdropFade(_node: HTMLElement) {
        return { duration: 150, easing: cubicOut, css: (t: number) => `opacity: ${t};` }
    }

    /**
     * Drops in from just above where it settles and shrinks back into it; on a phone the sheet rises
     * from just below instead. Reduced motion keeps the fade and drops the movement. Both ways run
     * the same transition, so reopening while it closes turns it around rather than starting over.
     */
    function paletteMotion(_node: HTMLElement) {
        const still = reducedMotion()
        const phone = window.matchMedia('(max-width: 600px)').matches
        return {
            duration: 160,
            easing: cubicOut,
            css: (t: number) => {
                if (still) return `opacity: ${t};`
                const u = 1 - t
                return phone
                    ? `opacity: ${t}; transform: translateY(${u * 1.5}rem);`
                    : `opacity: ${t}; transform: translateY(${u * -0.5}rem) scale(${0.97 + 0.03 * t});`
            }
        }
    }

    function close() {
        closeSearchPalette()
        opener?.focus?.()
    }

    function hrefOf(result: SearchResult): string {
        return result.kind === 'entry' ? result.entry.href : result.section.href
    }

    async function go(result: SearchResult) {
        closeSearchPalette()
        await goto(hrefOf(result))
    }

    function move(by: number) {
        if (results.length === 0) return
        selected = (selected + by + results.length) % results.length
        void tick().then(() =>
            list?.querySelector(`#palette-option-${selected}`)?.scrollIntoView({ block: 'nearest' })
        )
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            move(1)
        } else if (event.key === 'ArrowUp') {
            event.preventDefault()
            move(-1)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            const result = results[selected]
            if (result) void go(result)
        } else if (event.key === 'Escape') {
            event.preventDefault()
            close()
        } else if (event.key === 'Tab') {
            //the box is the dialog's one focusable place; the list is driven from it
            event.preventDefault()
        }
    }
</script>

{#if searchPalette.open}
    <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
    <div class="backdrop" onclick={close} transition:backdropFade>
        <div
            class="palette"
            transition:paletteMotion
            role="dialog"
            aria-modal="true"
            aria-label="Search"
            tabindex="-1"
            onclick={(event) => event.stopPropagation()}
        >
            <div class="top">
                <SearchField
                    bind:value={query}
                    bind:el={input}
                    {placeholder}
                    label={placeholder}
                    role="combobox"
                    aria-expanded={results.length > 0}
                    aria-controls="palette-results"
                    aria-activedescendant={results.length > 0
                        ? `palette-option-${selected}`
                        : undefined}
                    {onkeydown}
                />
                <!-- a phone has no Esc key and no backdrop around the sheet to tap -->
                <button type="button" class="close" onclick={close}>Cancel</button>
            </div>
            {#if !query.trim()}
                <p class="hint">An instruction, a directive, or a question in your own words.</p>
            {:else}
                <ul class="results" id="palette-results" role="listbox" bind:this={list}>
                    {#each results as result, index (result.key)}
                        <!-- svelte-ignore a11y_click_events_have_key_events -->
                        <li
                            id="palette-option-{index}"
                            role="option"
                            aria-selected={index === selected}
                            class:selected={index === selected}
                            onmousemove={() => (selected = index)}
                            onclick={() => go(result)}
                        >
                            {#if result.kind === 'entry'}
                                <span class="kind">{result.entry.chapterTitle}</span>
                                <span class="title">
                                    <span
                                        class:code={hasCodeName({
                                            kind: result.entry.entryKind,
                                            codeName: result.entry.codeName
                                        })}
                                        ><HighlightedText text={result.entry.title} {terms} /></span
                                    >
                                    {#if result.entry.signature}
                                        <span class="signature">{result.entry.signature}</span>
                                    {/if}
                                </span>
                                <span class="line"
                                    ><HighlightedText text={result.entry.summary} {terms} /></span
                                >
                            {:else}
                                <span class="kind"
                                    >{result.section.courseName} › {result.section
                                        .lectureName}</span
                                >
                                <span class="title"
                                    ><HighlightedText text={result.section.title} {terms} /></span
                                >
                                <span class="line"
                                    ><HighlightedText text={result.excerpt} {terms} /></span
                                >
                            {/if}
                        </li>
                    {/each}
                    {#if results.length === 0 && searched === query.trim()}
                        <li class="empty" role="presentation">Nothing matches “{query.trim()}”.</li>
                    {/if}
                </ul>
            {/if}
            <footer>
                <span
                    ><kbd aria-label="Up"><FaArrowUp /></kbd>
                    <kbd aria-label="Down"><FaArrowDown /></kbd> to move</span
                >
                <span><kbd>Enter</kbd> to open</span>
                <span><kbd>Esc</kbd> to close</span>
            </footer>
        </div>
    </div>
{/if}

<style>
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 12vh 1rem 1rem;
        background-color: rgb(0 0 0 / 45%);
        backdrop-filter: blur(2px);
    }
    .palette {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        width: min(44rem, 100%);
        /* the same box whether there are results or not, so it does not jump as they arrive */
        min-height: min(26rem, 70vh);
        max-height: 70vh;
        padding: 0.6rem;
        border-radius: 0.8rem;
        background-color: var(--primary);
        color: var(--primary-text);
        box-shadow: 0 1rem 3rem rgb(0 0 0 / 35%);
        outline: none;
        transform-origin: top center;
    }
    .top {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .top > :global(.search-field) {
        flex: 1;
    }
    .close {
        display: none;
        flex: none;
        padding: 0.5rem 0.3rem;
        border: none;
        background: transparent;
        color: var(--accent);
        font: inherit;
        cursor: pointer;
    }
    .results {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        margin: 0;
        padding: 0;
        list-style: none;
        overflow-y: auto;
        min-height: 0;
    }
    li {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        padding: 0.45rem 0.6rem;
        border-radius: 0.5rem;
        cursor: pointer;
        min-width: 0;
    }
    li.selected {
        background-color: var(--secondary);
        color: var(--secondary-text);
    }
    .kind {
        font-size: 0.72rem;
        color: var(--accent);
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .title {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        font-weight: 600;
        min-width: 0;
    }
    .code {
        font-family: 'Fira Code', monospace;
    }
    .signature {
        min-width: 0;
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
        font-weight: normal;
        opacity: 0.7;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .line {
        font-size: 0.85rem;
        opacity: 0.8;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .empty {
        cursor: default;
        opacity: 0.7;
    }
    .hint {
        flex: 1;
        margin: 0;
        padding: 0.6rem;
        opacity: 0.6;
        font-size: 0.9rem;
    }
    footer {
        display: flex;
        margin-top: auto;
        gap: 1rem;
        padding: 0.2rem 0.4rem 0;
        font-size: 0.75rem;
        opacity: 0.7;
    }
    kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.2rem;
        height: 1.2rem;
        padding: 0 0.3rem;
        border-radius: 0.25rem;
        border: 1px solid var(--tertiary);
        font-family: inherit;
        vertical-align: middle;
    }
    kbd :global(svg) {
        width: 0.6rem;
        height: 0.6rem;
    }
    @media (max-width: 600px) {
        .backdrop {
            padding: 0;
        }
        .palette {
            width: 100%;
            max-height: none;
            height: 100%;
            border-radius: 0;
        }
        footer {
            display: none;
        }
        .close {
            display: block;
        }
    }
</style>
