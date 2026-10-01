<script lang="ts">
    /**
     * A language's **Documentation** as one page that a search filters and reorders: the Workbench's
     * Documentation panel, and `/documentation/<language>/all` at full width
     * ([the design record](../../../../docs/design/documentation-search.md), The Documentation panel).
     *
     * With no query, every **Chapter** starts folded under a heading that stays pinned while its
     * expanded rows scroll. With a query, the Chapters give way to the
     * ranked results, entries and **Lecture sections** in one list, an entry named exactly what was
     * typed opened already. A link from one entry to another is followed in place, with Back.
     */
    import { tick, untrack } from 'svelte'
    import { prefersReducedMotion } from 'svelte/motion'
    import { SvelteSet } from 'svelte/reactivity'
    import { slide } from 'svelte/transition'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import SearchField from '$cmp/search/SearchField.svelte'
    import { documentationFor } from '$lib/documentation/documentation'
    import type { Chapter, DocumentationEntry } from '$lib/documentation/entries'
    import { resolveDocumentationLink, type DocumentationTarget } from '$lib/documentation/links'
    import { queryTerms, type SearchResult } from '$lib/search/engine'
    import type { EntryDocument } from '$lib/search/payload'
    import { searchClient } from '$lib/search/searchClient.svelte'
    import type { DocumentationLanguage, SearchScope } from '$lib/search/scope'
    import EntryRow from './EntryRow.svelte'
    import LectureSectionCard from './LectureSectionCard.svelte'

    interface Props {
        language: DocumentationLanguage
        /**
         * The Chapters, when the page already has them: `/all` imports its language's and so is
         * prerendered with every Chapter heading. The panel leaves it out and loads them on demand.
         */
        chapters?: Chapter[]
        /** What the search box looks through; the page variant has no search box. */
        scope?: SearchScope
        variant?: 'panel' | 'page'
        /** In an Exam: links into the Documentation still work, every other link is text. */
        disableLinks?: boolean
        /**
         * A one-shot request from outside the panel (Ctrl+K): focus the search box, with a query if
         * one is given. A new `token` is a new request.
         */
        request?: { token: number; query?: string } | null
    }

    let {
        language,
        chapters: given,
        scope,
        variant = 'panel',
        disableLinks = false,
        request = null
    }: Props = $props()

    let loaded = $state<Chapter[] | null>(null)
    let failed = $state(false)
    const chapters = $derived(given ?? loaded)

    $effect(() => {
        if (given) return
        const wanted = language
        loaded = null
        failed = false
        documentationFor(wanted).then(
            (chapters) => {
                if (language === wanted) loaded = chapters
            },
            () => {
                if (language === wanted) failed = true
            }
        )
    })

    /** `/all`: every entry open at once, for reading straight through or printing. */
    async function expandAll(print = false) {
        for (const chapter of chapters ?? []) unfolded.add(chapter.id)
        openOnly((chapters ?? []).flatMap((chapter) => chapter.entries.map((entry) => entry.id)))
        if (!print) return
        await tick()
        // the open entries render their markdown on the next frames; give them a moment
        setTimeout(() => window.print(), 400)
    }

    function collapseAll() {
        open.clear()
        unfolded.clear()
    }

    const byId = $derived(
        new Map(
            (chapters ?? []).flatMap((chapter) => chapter.entries).map((entry) => [entry.id, entry])
        )
    )

    let query = $state('')
    let results = $state<SearchResult[]>([])
    let searched = $state('')
    /** The rows and cards shown open. */
    const open = new SvelteSet<string>()

    /** The Chapters opened from their default folded state. */
    const unfolded = new SvelteSet<string>()

    function toggleChapter(id: string) {
        if (unfolded.has(id)) unfolded.delete(id)
        else unfolded.add(id)
    }

    function openOnly(ids: Iterable<string>) {
        open.clear()
        for (const id of ids) open.add(id)
    }
    /** An entry a followed link asked for: shown first, open, whatever the search ranks. */
    let pinned = $state<string | null>(null)
    let back = $state<string[]>([])
    let input = $state<HTMLInputElement>()
    let scroller = $state<HTMLDivElement>()

    const terms = $derived(queryTerms(query))
    const searching = $derived(query.trim().length > 0)

    let generation = 0
    $effect(() => {
        const text = query.trim()
        const where = scope
        if (!text || !where) {
            results = []
            searched = ''
            return
        }
        const mine = ++generation
        const timer = setTimeout(() => {
            searchClient.search(where, text, 30).then(
                (answer) => {
                    if (mine !== generation) return
                    results = answer.results
                    searched = text
                    const exact = answer.results.find(
                        (result) => result.kind === 'entry' && result.exact
                    )
                    const ids: string[] = []
                    if (untrack(() => pinned)) ids.push(untrack(() => pinned)!)
                    else if (exact?.kind === 'entry') ids.push(exact.entry.id)
                    openOnly(ids)
                },
                () => {
                    if (mine !== generation) return
                    results = []
                    searched = text
                }
            )
        }, 120)
        return () => clearTimeout(timer)
    })

    $effect(() => {
        const current = request
        if (!current) return
        untrack(() => {
            if (current.query !== undefined) setQuery(current.query)
            void tick().then(() =>
                requestAnimationFrame(() => {
                    input?.focus()
                    input?.select()
                })
            )
        })
    })

    function setQuery(text: string) {
        query = text
        pinned = null
    }

    function toggle(key: string) {
        if (open.has(key)) open.delete(key)
        else open.add(key)
    }

    /** An entry the index knows but this page's entries do not: shown from what the index holds. */
    function fromIndex(document: EntryDocument): DocumentationEntry {
        return {
            id: document.id,
            language: document.language,
            chapter: document.chapter,
            kind: document.entryKind,
            title: document.title,
            codeName: document.codeName,
            names: document.names,
            signature: document.signature || undefined,
            summary: document.summary,
            href: document.href,
            anchor: document.id,
            view: { type: 'markdown', markdown: document.text },
            searchText: document.text
        }
    }

    type Shown = SearchResult | { pinnedEntry: DocumentationEntry }

    const shown = $derived.by((): Shown[] => {
        if (!pinned) return results
        const first = byId.get(pinned)
        const rest = results.filter(
            (result) => result.kind !== 'entry' || result.entry.id !== pinned
        )
        return first ? [{ pinnedEntry: first }, ...rest] : rest
    })

    /** A linked Chapter or entry: unfolded before it is brought into view. */
    let chapterToScroll: { chapter: string; entry?: string } | null = null

    async function scrollToChapter(id: string, entry?: string) {
        chapterToScroll = { chapter: id, entry }
        const wasRendered = !!scroller?.querySelector(`[data-chapter="${CSS.escape(id)}"]`)
        const wasFolded = !unfolded.has(id)
        unfolded.add(id)
        await tick()
        if (!wasFolded || !wasRendered || prefersReducedMotion.current) finishChapterScroll(id)
    }

    /** Wait for a folded Chapter to finish opening before positioning it in the scroll area. */
    function finishChapterScroll(id: string) {
        if (chapterToScroll?.chapter !== id) return
        const entry = chapterToScroll.entry
        chapterToScroll = null
        scroller
            ?.querySelector(
                entry
                    ? `[data-entry-id="${CSS.escape(entry)}"]`
                    : `[data-chapter="${CSS.escape(id)}"]`
            )
            ?.scrollIntoView({
                block: entry ? 'nearest' : 'start',
                behavior: prefersReducedMotion.current ? 'instant' : 'smooth'
            })
    }

    function scrollToEntry(id: string) {
        const chapter = byId.get(id)?.chapter
        if (chapter) void scrollToChapter(chapter, id)
    }

    function follow(target: DocumentationTarget) {
        if (variant === 'panel') {
            back = [...back, query]
            if (target.kind === 'entry') {
                query = target.entry.title
                pinned = target.entry.id
                openOnly([target.entry.id])
            } else {
                setQuery('')
                void scrollToChapter(target.chapter.id)
            }
            scroller?.scrollTo({ top: 0 })
            return
        }
        if (target.kind === 'entry') {
            open.add(target.entry.id)
            void scrollToEntry(target.entry.id)
        } else {
            void scrollToChapter(target.chapter.id)
        }
    }

    function goBack() {
        const previous = back[back.length - 1] ?? ''
        back = back.slice(0, -1)
        setQuery(previous)
    }

    /**
     * Links inside entries: one into the Documentation is followed here; any other leaves for a new
     * tab from the panel, because the Workbench never navigates (ADR 0024).
     */
    function onclick(event: MouseEvent) {
        const element = (event.target as HTMLElement | null)?.closest<HTMLElement>(
            'a[href], [data-doc-href]'
        )
        if (!element || element.classList.contains('page-link')) return
        const href = element.getAttribute('data-doc-href') ?? element.getAttribute('href') ?? ''
        const row = element.closest<HTMLElement>('[data-entry-id]')
        const from = row ? byId.get(row.dataset.entryId ?? '') : undefined
        if (chapters && (href.startsWith('/documentation/') || href.startsWith('#'))) {
            const target = resolveDocumentationLink(href, chapters, from)
            if (target) {
                event.preventDefault()
                follow(target)
                return
            }
        }
        if (variant === 'panel' && element.tagName === 'A' && !element.hasAttribute('target')) {
            event.preventDefault()
            window.open(href, '_blank', 'noopener')
        }
    }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="documentation-browser" class:page={variant === 'page'} {onclick}>
    {#if variant === 'panel'}
        <div class="search">
            {#if back.length > 0}
                <button type="button" class="back" title="Back" aria-label="Back" onclick={goBack}>
                    <FaArrowLeft />
                </button>
            {/if}
            <div class="field">
                <SearchField
                    bind:value={() => query, setQuery}
                    bind:el={input}
                    placeholder="Search the documentation"
                    label="Search the documentation"
                />
            </div>
        </div>
    {/if}

    {#if failed}
        <p class="note">The documentation could not be loaded.</p>
    {:else if !chapters}
        <p class="note">Loading the documentation…</p>
    {:else if searching && variant === 'panel'}
        <div class="scroll results" bind:this={scroller}>
            {#if shown.length === 0 && searched === query.trim()}
                <p class="note">Nothing matches “{query.trim()}”.</p>
            {/if}
            {#each shown as result ('pinnedEntry' in result ? `pinned:${result.pinnedEntry.id}` : result.key)}
                {#if 'pinnedEntry' in result}
                    <EntryRow
                        entry={result.pinnedEntry}
                        expanded={open.has(result.pinnedEntry.id)}
                        ontoggle={() => toggle(result.pinnedEntry.id)}
                        {terms}
                        {disableLinks}
                    />
                {:else if result.kind === 'entry'}
                    {@const entry = byId.get(result.entry.id) ?? fromIndex(result.entry)}
                    <EntryRow
                        {entry}
                        expanded={open.has(entry.id)}
                        ontoggle={() => toggle(entry.id)}
                        {terms}
                        {disableLinks}
                    />
                {:else}
                    <LectureSectionCard
                        section={result.section}
                        excerpt={result.excerpt}
                        expanded={open.has(result.section.id)}
                        ontoggle={() => toggle(result.section.id)}
                        {terms}
                    />
                {/if}
            {/each}
        </div>
    {:else}
        {#if variant === 'page'}
            <div class="toolbar">
                {#if open.size > 0 || unfolded.size > 0}
                    <button type="button" class="tool" onclick={collapseAll}>
                        Collapse all
                    </button>
                {:else}
                    <button type="button" class="tool" onclick={() => expandAll()}>
                        Expand all
                    </button>
                {/if}
                <button type="button" class="tool" onclick={() => expandAll(true)}>
                    Print as PDF
                </button>
            </div>
        {/if}
        <div class="scroll" bind:this={scroller}>
            {#each chapters as chapter (chapter.id)}
                {@const isFolded = !unfolded.has(chapter.id)}
                <section class="chapter" class:folded={isFolded} data-chapter={chapter.id}>
                    <h3 class="chapter-title">
                        <button
                            type="button"
                            class="chapter-toggle"
                            aria-expanded={!isFolded}
                            onclick={() => toggleChapter(chapter.id)}
                        >
                            <span class="chevron" class:folded={isFolded} aria-hidden="true">
                                <FaChevronRight />
                            </span>
                            {chapter.title}
                        </button>
                    </h3>
                    {#if !isFolded}
                        <div
                            class="chapter-entries"
                            transition:slide={{ duration: prefersReducedMotion.current ? 0 : 200 }}
                            onintroend={() => finishChapterScroll(chapter.id)}
                        >
                            {#each chapter.entries as entry (entry.id)}
                                <EntryRow
                                    {entry}
                                    expanded={open.has(entry.id)}
                                    ontoggle={() => toggle(entry.id)}
                                    {disableLinks}
                                    pageLink={variant === 'page'}
                                />
                            {/each}
                        </div>
                    {/if}
                </section>
            {/each}
        </div>
    {/if}
</div>

<style>
    .documentation-browser {
        --documentation-spacing: 0.35rem;
        display: flex;
        flex-direction: column;
        min-height: 0;
        height: 100%;
        color: inherit;
    }
    .search {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex: none;
        padding: 0.5rem;
    }
    .field {
        flex: 1;
        min-width: 0;
    }
    .back {
        display: flex;
        flex: none;
        width: 2rem;
        height: 2rem;
        padding: 0.55rem;
        border: none;
        border-radius: 0.4rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        cursor: pointer;
    }
    .note {
        margin: 0;
        padding: 0.8rem;
        color: var(--background-text-muted);
    }
    .toolbar {
        display: flex;
        gap: 0.5rem;
        padding-bottom: 0.6rem;
    }
    .tool {
        padding: 0.35rem 0.8rem;
        border: none;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font: inherit;
        font-size: 0.9rem;
        cursor: pointer;
    }
    .tool:hover {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    @media print {
        .toolbar {
            display: none;
        }
    }
    .scroll {
        flex: 1;
        min-height: 0;
        overflow-y: auto;
        padding: 0 var(--documentation-spacing) 0.8rem;
    }
    .page .scroll {
        overflow: visible;
        padding: 0;
    }
    .results {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }
    .chapter {
        display: flex;
        flex-direction: column;
        margin-bottom: var(--documentation-spacing);
        border: 0.1rem solid color-mix(in srgb, var(--tertiary) 70%, transparent);
        border-radius: 0.5rem;
    }
    .chapter-title {
        position: sticky;
        top: 0;
        z-index: 1;
        margin: 0;
        font-size: 0.95rem;
        background-color: var(--wb-section-header, var(--tertiary));
        color: var(--secondary-text);
        border-radius: 0.4rem 0.4rem 0 0;
        border-bottom: 1px solid color-mix(in srgb, var(--tertiary) 70%, transparent);
    }
    .chapter.folded .chapter-title {
        border-radius: 0.4rem;
        border-bottom: none;
    }
    .chapter-entries {
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
        padding: 0.5rem;
        min-width: 0;
    }
    .chapter-toggle {
        display: flex;
        align-items: baseline;
        gap: 0.5rem;
        width: 100%;
        padding: 0.45rem 0.5rem;
        border: none;
        background: transparent;
        color: inherit;
        font: inherit;
        font-weight: 600;
        text-align: left;
        cursor: pointer;
    }
    .chapter-toggle:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: -2px;
    }
    .chevron {
        display: flex;
        align-self: center;
        width: 0.6rem;
        height: 0.6rem;
        opacity: 0.6;
        transform: rotate(90deg);
        transition: transform 0.15s ease;
    }
    .chevron.folded {
        transform: rotate(0deg);
    }
    .page .chapter-title {
        top: 3.2rem;
        font-size: 1.1rem;
    }
    @media (prefers-reduced-motion: reduce) {
        .chevron {
            transition: none;
        }
    }
</style>
