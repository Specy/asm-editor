<script lang="ts">
    /**
     * The search palette of the documentation pages and the Courses: a box and one ranked list over
     * the page, ↑ and ↓ to move, Enter to go, Esc to close; a full-screen sheet on a phone
     * ([the design record](../../../../../docs/design/documentation-search.md), Search on the
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
    import type { ResolvedPathname } from '$app/types'
    import { hasCodeName } from '#lib/documentation/entries.ts'
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { categoryLabel } from '#lib/documentation/instructions/categories.ts'
    import { courseAccent, languageAccent } from '#lib/languages/languageColors.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { resolveHref } from '#lib/hrefs.ts'
    import { queryTerms, type SearchResult } from '#lib/search/engine.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import type { SearchScope } from '#lib/search/scope.ts'
    import HighlightedText from './HighlightedText.svelte'
    import SearchField from './SearchField.svelte'
    import { closeSearchPalette, openSearchPalette, searchPalette } from './paletteState.svelte'
    import { listenForSearchKey, typedInEditor } from './searchHotkey'

    interface Props {
        scope: SearchScope
        placeholder?: string
        /**
         * The site's palette, which the root layout mounts on every page with the navbar and the
         * navbar's box opens. A page's own palette is the one Ctrl+K opens where there is one.
         */
        site?: boolean
    }

    let { scope, placeholder = 'Search', site = false }: Props = $props()

    /** Open, and this palette is the one opened. */
    const shown = $derived(searchPalette.open && searchPalette.owner === (site ? 'site' : 'page'))

    let query = $state('')
    let results = $state<SearchResult[]>([])
    let searched = $state('')
    let selected = $state(0)
    let input = $state<HTMLInputElement>()
    let list = $state<HTMLUListElement>()
    let opener: HTMLElement | null = null

    const terms = $derived(queryTerms(query))

    // counted untracked: the count is read to be raised, which would otherwise run this forever
    $effect(() => {
        if (site) return
        untrack(() => searchPalette.pagePalettes++)
        return () => untrack(() => searchPalette.pagePalettes--)
    })

    // the site's palette takes the key only where no page palette does, and never from an editor
    $effect(() =>
        listenForSearchKey((event) => {
            if (!site) return void openSearchPalette()
            if (searchPalette.pagePalettes > 0 || typedInEditor(event)) return false
            openSearchPalette('', 'site')
        })
    )

    $effect(() => {
        if (!shown) return
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
        if (!shown || !text) {
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

    function hrefOf(result: SearchResult): ResolvedPathname {
        return resolveHref(result.kind === 'entry' ? result.entry.href : result.section.href)
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

{#snippet language(color: string | null, name?: string)}
    <!-- the General course belongs to no language: an empty square keeps the rows lined up -->
    <span class="swatch" class:none={!color} style:--swatch={color} aria-hidden="true"></span>
    {#if name}<span class="language">{name}</span>{/if}
{/snippet}

{#if shown}
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
                    bare
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
                <p class="hint">Write the name of an instruction, directive or any question.</p>
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
                                <!-- an instruction names its category after its Chapter:
                                     "Instructions · Arithmetic"; the site's search mixes the
                                     languages, so it names the one, in that language's colour -->
                                <span class="kind"
                                    >{#if site}{@render language(
                                            languageAccent(
                                                result.entry.language.toUpperCase() as AvailableLanguages
                                            ),
                                            languageLabel(result.entry.language.toUpperCase())
                                        )}<span class="dot" aria-hidden="true">·</span>{/if}<span
                                        class="where"
                                        >{result.entry.category
                                            ? `${result.entry.chapterTitle} · ${categoryLabel(result.entry.category)}`
                                            : result.entry.chapterTitle}</span
                                    ></span
                                >
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
                                    >{@render language(courseAccent(result.section.course))}<span
                                        class="where"
                                        >{result.section.courseName} › {result.section
                                            .lectureName}</span
                                    ></span
                                >
                                <!-- one flex item, or the gap would split the words around each match -->
                                <span class="title"
                                    ><span
                                        ><HighlightedText
                                            text={result.section.title}
                                            {terms}
                                        /></span
                                    ></span
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
                    ><kbd aria-label="Up"><FaArrowUp /></kbd><kbd aria-label="Down"
                        ><FaArrowDown /></kbd
                    > to move</span
                >
                <span><kbd>Enter</kbd> to open</span>
                <span><kbd>Esc</kbd> to close</span>
            </footer>
        </div>
    </div>
{/if}

<style lang="scss">
    @use '../shared/button/tray.scss';

    /* lighter than a modal's: the palette is a tray over the page, as the prompts are, and the page
       stays readable around it */
    .backdrop {
        position: fixed;
        inset: 0;
        z-index: 50;
        display: flex;
        justify-content: center;
        align-items: flex-start;
        padding: 12vh 1rem 1rem;
        background-color: rgb(0 0 0 / 35%);
    }

    /* drawn as the app's trays (prompts, toasts, the execution dock): a translucent tint that blurs
       what is beneath, a hairline edge, lifted by a shadow; denser and blurrier than a prompt's, as
       it holds a page of text over a page of text. The field is its top, ruled off from the results
       and the keys with the tray's own line */
    .palette {
        @include tray.surface(94%);
        backdrop-filter: blur(16px);
        display: flex;
        flex-direction: column;
        width: min(42rem, 100%);
        /* the same box whether there are results or not, so it does not jump as they arrive */
        min-height: min(26rem, 70vh);
        max-height: 70vh;
        overflow: hidden;
        box-shadow: 0 0.75rem 2.5rem rgb(0 0 0 / 0.4);
        outline: none;
        transform-origin: top center;
    }

    .top {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.5rem;
        padding: 0.3rem 0.5rem;
        border-bottom: 1px solid var(--tray-line);
    }

    .top > :global(.search-field) {
        flex: 1;
    }

    .close {
        @include tray.tool(0.6rem);
        display: none;
        flex: none;
        height: 2rem;
        color: var(--accent);
    }

    .results {
        display: flex;
        flex-direction: column;
        gap: 2px;
        margin: 0;
        padding: 0.35rem;
        list-style: none;
        overflow-y: auto;
        min-height: 0;
    }

    /* a menu's rows: no surface until pointed at or chosen with the arrows, then the tint the tray's
       buttons take on hover, with an accent edge so the chosen one reads at a glance */
    li {
        position: relative;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
        min-width: 0;
        padding: 0.45rem 0.7rem;
        border-radius: 0.4rem;
        cursor: pointer;
    }

    li.selected {
        background-color: color-mix(in srgb, var(--tertiary) 55%, transparent);

        &::before {
            content: '';
            position: absolute;
            top: 0.45rem;
            bottom: 0.45rem;
            left: 0;
            width: 2px;
            border-radius: 1px;
            background-color: var(--accent);
        }
    }

    .kind {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        min-width: 0;
        font-size: 0.72rem;
        color: color-mix(in srgb, var(--primary-text) 60%, transparent);
    }

    /* the square the home page's instruction sets wear */
    .swatch {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 0.1rem;
        background-color: var(--swatch);

        &.none {
            border: 1px solid color-mix(in srgb, var(--primary-text) 35%, transparent);
            background-color: transparent;
        }
    }

    .language {
        flex: none;
        color: var(--primary-text);
        font-weight: 500;
    }

    .dot {
        flex: none;
        opacity: 0.6;
    }

    .where {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .title {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        min-width: 0;
        font-weight: 500;
    }

    .code {
        font-family: 'Fira Code', monospace;
    }

    .signature {
        min-width: 0;
        font-family: 'Fira Code', monospace;
        font-size: 0.8rem;
        font-weight: normal;
        opacity: 0.65;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .line {
        font-size: 0.85rem;
        opacity: 0.75;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .empty {
        padding: 0.8rem 0.7rem;
        cursor: default;
        opacity: 0.65;
        font-size: 0.9rem;
    }

    .hint {
        flex: 1;
        margin: 0;
        padding: 0.9rem 1.05rem;
        opacity: 0.6;
        font-size: 0.9rem;
    }

    footer {
        display: flex;
        flex: none;
        gap: 1.1rem;
        margin-top: auto;
        padding: 0.45rem 0.85rem;
        border-top: 1px solid var(--tray-line);
        font-size: 0.75rem;
        color: color-mix(in srgb, var(--primary-text) 65%, transparent);

        span {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
        }
    }

    /* the keys the Tooltips show */
    kbd {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 1.2rem;
        height: 1.2rem;
        padding: 0 0.3rem;
        border: 1px solid color-mix(in srgb, var(--primary-text) 25%, transparent);
        border-radius: 0.25rem;
        font-family: inherit;
        font-size: 0.7rem;

        :global(svg) {
            width: 0.55rem;
            height: 0.55rem;
        }
    }

    @media (max-width: 600px) {
        .backdrop {
            padding: 0;
        }

        .palette {
            width: 100%;
            height: 100%;
            max-height: none;
            border: none;
            border-radius: 0;
        }

        footer {
            display: none;
        }

        .close {
            display: flex;
        }
    }
</style>
