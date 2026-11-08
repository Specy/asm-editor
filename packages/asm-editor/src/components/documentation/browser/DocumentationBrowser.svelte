<script lang="ts">
    /**
     * A language's **Documentation** as one page that a search filters and reorders: the Workbench's
     * Documentation panel, and `/documentation/<language>/all` at full width
     * ([the design record](../../../../../../docs/design/documentation-search.md), The Documentation panel).
     *
     * With no query, every **Chapter** starts folded under a heading that stays pinned while its
     * expanded rows scroll; the Instructions Chapter lists its entries under a heading per
     * **Instruction category**, pinned under the Chapter's. With a query, the Chapters give way to
     * the ranked results, entries and **Lecture sections** in one list, each instruction naming its
     * category, an entry named exactly what was typed opened already. A link from one entry to
     * another is followed in place, with Back. For an M68K program whose processor is known, the
     * panel leaves out what a later processor brought, from the Chapters and from the results
     * ([m68k-machine.md](../../../../../../docs/design/m68k-machine.md), decision 36).
     */
    import EmptyState from '#cmp/shared/misc/EmptyState.svelte'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import { tick, untrack } from 'svelte'
    import { DUR_BASE, motion, prefersLessMotion } from '#src/styles/motion.ts'
    import { SvelteSet } from 'svelte/reactivity'
    import { cubicOut } from 'svelte/easing'
    import FaArrowLeft from '~icons/fa-solid/arrow-left'
    import FaChevronRight from '~icons/fa-solid/chevron-right'
    import FaCompressAlt from '~icons/fa-solid/compress-alt'
    import FaExpandAlt from '~icons/fa-solid/expand-alt'
    import FaPrint from '~icons/fa-solid/print'
    import SearchField from '#cmp/search/SearchField.svelte'
    import {
        documentationFor,
        m68kDocumentationFor,
        type ProgramDocumentation
    } from '#lib/documentation/documentation.ts'
    import { m68kDialectKey, type M68kDialect } from '#lib/languages/M68K/m68kDialect.ts'
    import type { Chapter, DocumentationEntry } from '#lib/documentation/entries.ts'
    import { categoryLabel, groupByCategory } from '#lib/documentation/instructions/categories.ts'
    import { resolveDocumentationLink, type DocumentationTarget } from '#lib/documentation/links.ts'
    import { queryTerms, type SearchResult } from '#lib/search/engine.ts'
    import { searchClient } from '#lib/search/searchClient.svelte.ts'
    import type { DocumentationLanguage, SearchScope } from '#lib/search/scope.ts'
    import EntryRow from './EntryRow.svelte'
    import { fromIndex } from './fromIndex'
    import LectureSectionCard from './LectureSectionCard.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import ErrorState from '#cmp/shared/layout/ErrorState.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    // the card tokens `/all` draws its Chapters on, as the Workbench's panel has them (`.wb-cards`)
    import '#cmp/specific/workbench/workbench.css'

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
         * A one-shot request from outside the panel: focus the search box (Ctrl+K), with a query
         * if one is given, or follow a link into the Documentation (`href`), as a notice's "?"
         * asks. A new `token` is a new request.
         */
        request?: { token: number; query?: string; href?: string } | null
        /**
         * The **Processor dialect** of the M68K program the panel is beside, from its live
         * analysis: the loaded Chapters and the search results then leave out what a later
         * processor brought. Unknown, or given Chapters, they show everything, as the site does.
         */
        m68kDialect?: M68kDialect
    }

    let {
        language,
        chapters: given,
        scope,
        variant = 'panel',
        disableLinks = false,
        request = null,
        m68kDialect
    }: Props = $props()

    let loaded = $state<ProgramDocumentation | null>(null)
    let failed = $state(false)
    /** Counts the loads Try again asked for, so that asking loads the documentation again. */
    let attempt = $state(0)
    const chapters = $derived(given ?? loaded?.chapters ?? null)
    /** The entries the program's processor leaves out, which the search results leave out too. */
    const hidden = $derived<ReadonlySet<string>>(given ? new Set() : (loaded?.hidden ?? new Set()))

    /**
     * The program's dialect as one word: the analysis of every keystroke says the same dialect in a
     * new object, and only a new dialect loads the Chapters again.
     */
    const dialectKey = $derived(
        language === 'm68k' && m68kDialect ? m68kDialectKey(m68kDialect) : undefined
    )
    /** The language the shown Chapters are of, which a new dialect keeps on screen until its own come. */
    let loadedLanguage: DocumentationLanguage | undefined

    $effect(() => {
        if (given) return
        const wanted = language
        const key = dialectKey
        void attempt
        if (loadedLanguage !== wanted) loaded = null
        failed = false
        const dialect = untrack(() => m68kDialect)
        const loading =
            key !== undefined && dialect
                ? m68kDocumentationFor(dialect)
                : documentationFor(wanted).then((chapters) => ({
                      chapters,
                      hidden: new Set<string>()
                  }))
        loading.then(
            (documentation) => {
                if (language !== wanted || dialectKey !== key) return
                loaded = documentation
                loadedLanguage = wanted
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

    /**
     * The Instructions Chapter by category, in the shared order, alphabetical under each heading.
     * Grouped here, not in the data, which keeps the Chapter's own order (ADR 0025). An entry
     * without a category would drop out, so the Chapter is shown flat unless every entry has one.
     */
    function categoryGroups(chapter: Chapter) {
        if (chapter.id !== 'instructions') return null
        if (!chapter.entries.every((entry) => entry.category)) return null
        return groupByCategory(chapter.entries, (entry) => entry.category)
    }

    const groupsByChapter = $derived(
        new Map((chapters ?? []).map((chapter) => [chapter.id, categoryGroups(chapter)]))
    )

    /**
     * Slide a Chapter open or shut, clipped without creating a new scroll container for the sticky
     * category headings. Its height is measured on every frame, not once when the slide starts as
     * `slide` does: its rows lay themselves out only once they are on screen
     * (`content-visibility: auto`, a prose entry 6rem tall until then) and a long prose entry cuts
     * itself to its Show all height only once it has measured itself, both after the slide has
     * begun, so a height read at the start was wrong and the slide ended with a jump.
     */
    function slideChapter(node: HTMLElement, { duration }: { duration: number }) {
        const style = getComputedStyle(node)
        const paddingTop = parseFloat(style.paddingTop)
        const paddingBottom = parseFloat(style.paddingBottom)
        return {
            duration,
            easing: cubicOut,
            tick: (t: number) => {
                if (t >= 1) {
                    for (const property of ['height', 'padding-top', 'padding-bottom', 'overflow'])
                        node.style.removeProperty(property)
                    return
                }
                node.style.overflow = 'clip'
                node.style.paddingTop = `${t * paddingTop}px`
                node.style.paddingBottom = `${t * paddingBottom}px`
                node.style.removeProperty('height')
                // the rows' height now, without the padding this frame gives the Chapter
                const rows = node.offsetHeight - t * (paddingTop + paddingBottom)
                node.style.height = `${t * (rows + paddingTop + paddingBottom)}px`
            }
        }
    }

    /** Exact border-box sizes, including fractional pixels, so pinned headings meet without a gap. */
    const titleSizes = $state<Record<string, ResizeObserverSize[]>>({})

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
                        (result) =>
                            result.kind === 'entry' && result.exact && !hidden.has(result.entry.id)
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
        if (!current || current.href !== undefined) return
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

    /** The request whose link was followed, once the Chapters it needs had loaded. */
    let followedRequest = -1
    $effect(() => {
        const current = request
        const loaded = chapters
        if (current?.href === undefined || !loaded || current.token === followedRequest) return
        followedRequest = current.token
        const href = current.href
        untrack(() => {
            const target = resolveDocumentationLink(href, loaded)
            if (target) follow(target)
            //another language's page, which this panel does not hold, as its own links do
            else if (variant === 'panel' && !disableLinks) window.open(href, '_blank', 'noopener')
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

    type Shown = SearchResult | { pinnedEntry: DocumentationEntry }

    /** The results but the entries the program's processor leaves out. */
    const found = $derived(
        hidden.size === 0
            ? results
            : results.filter((result) => result.kind !== 'entry' || !hidden.has(result.entry.id))
    )

    const shown = $derived.by((): Shown[] => {
        if (!pinned) return found
        const first = byId.get(pinned)
        const rest = found.filter((result) => result.kind !== 'entry' || result.entry.id !== pinned)
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
        if (!wasFolded || !wasRendered || prefersLessMotion()) finishChapterScroll(id)
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
                behavior: prefersLessMotion() ? 'instant' : 'smooth'
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
                <button
                    type="button"
                    class="back"
                    {@attach tooltip('Back')}
                    aria-label="Back"
                    onclick={goBack}
                >
                    <FaArrowLeft />
                </button>
            {/if}
            <div class="field">
                <SearchField
                    semantic
                    bind:value={() => query, setQuery}
                    bind:el={input}
                    placeholder="Search the documentation"
                    label="Search the documentation"
                />
            </div>
        </div>
    {/if}

    {#if failed}
        <ErrorState compact title="The documentation didn't load">
            Its files could not be downloaded. Check the connection, then try again or reload the
            page.
            {#snippet actions()}
                <Button onClick={() => attempt++}>Try again</Button>
            {/snippet}
        </ErrorState>
    {:else if !chapters}
        <p class="note"><Spinner label="Loading the documentation…" /></p>
    {:else if searching && variant === 'panel'}
        <div class="scroll results" bind:this={scroller}>
            {#if shown.length === 0 && searched === query.trim()}
                <EmptyState>Nothing matches “{query.trim()}”.</EmptyState>
            {/if}
            {#each shown as result ('pinnedEntry' in result ? `pinned:${result.pinnedEntry.id}` : result.key)}
                {#if 'pinnedEntry' in result}
                    <EntryRow
                        entry={result.pinnedEntry}
                        expanded={open.has(result.pinnedEntry.id)}
                        ontoggle={() => toggle(result.pinnedEntry.id)}
                        {terms}
                        {disableLinks}
                        showCategory
                        clampProse
                    />
                {:else if result.kind === 'entry'}
                    {@const entry = byId.get(result.entry.id) ?? fromIndex(result.entry)}
                    <EntryRow
                        {entry}
                        expanded={open.has(entry.id)}
                        ontoggle={() => toggle(entry.id)}
                        {terms}
                        {disableLinks}
                        showCategory
                        clampProse
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
            <!-- filled, at the page's size, each with its mark (owner, 2026-11-08) -->
            <div class="toolbar">
                {#if open.size > 0 || unfolded.size > 0}
                    <Button kind="secondary" style="gap: 0.5rem" onClick={collapseAll}>
                        <Icon size="small"><FaCompressAlt /></Icon>
                        Collapse all
                    </Button>
                {:else}
                    <Button kind="secondary" style="gap: 0.5rem" onClick={() => expandAll()}>
                        <Icon size="small"><FaExpandAlt /></Icon>
                        Expand all
                    </Button>
                {/if}
                <Button kind="secondary" style="gap: 0.5rem" onClick={() => expandAll(true)}>
                    <Icon size="small"><FaPrint /></Icon>
                    Print as PDF
                </Button>
            </div>
        {/if}
        <div class="scroll" class:wb-cards={variant === 'page'} bind:this={scroller}>
            {#each chapters as chapter (chapter.id)}
                {@const isFolded = !unfolded.has(chapter.id)}
                {@const groups = groupsByChapter.get(chapter.id) ?? null}
                <section
                    class="chapter"
                    class:folded={isFolded}
                    class:categorized={!!groups}
                    data-chapter={chapter.id}
                    style:--chapter-title-height={titleSizes[chapter.id]?.[0]
                        ? `${titleSizes[chapter.id][0].blockSize}px`
                        : undefined}
                >
                    <h3 class="chapter-title" bind:borderBoxSize={titleSizes[chapter.id]}>
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
                            class:categorized={!!groups}
                            transition:slideChapter={{ duration: motion(DUR_BASE) }}
                            onintroend={() => finishChapterScroll(chapter.id)}
                        >
                            {#if groups}
                                {#each groups as group (group.category)}
                                    <div class="category-group">
                                        <h4 class="category-title small-heading">
                                            {categoryLabel(group.category)}
                                        </h4>
                                        {#each group.items as entry (entry.id)}
                                            <EntryRow
                                                {entry}
                                                expanded={open.has(entry.id)}
                                                ontoggle={() => toggle(entry.id)}
                                                {disableLinks}
                                                pageLink={variant === 'page'}
                                                clampProse={variant === 'panel'}
                                            />
                                        {/each}
                                    </div>
                                {/each}
                            {:else}
                                {#each chapter.entries as entry (entry.id)}
                                    <EntryRow
                                        {entry}
                                        expanded={open.has(entry.id)}
                                        ontoggle={() => toggle(entry.id)}
                                        {disableLinks}
                                        pageLink={variant === 'page'}
                                        clampProse={variant === 'panel'}
                                    />
                                {/each}
                            {/if}
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
        min-width: 0;
        max-width: 100%;
        min-height: 0;
        height: 100%;
        color: inherit;
    }
    /* in line with the list under it: the same inset, and the same room kept for a scrollbar */
    .search {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex: none;
        padding: 0.5rem var(--documentation-spacing);
        overflow: hidden;
        scrollbar-gutter: stable;
    }
    .field {
        flex: 1;
        min-width: 0;
    }
    /* as tall as the search field beside it, and as wide as the field's own height */
    .back {
        display: flex;
        flex: none;
        align-self: stretch;
        align-items: center;
        justify-content: center;
        width: calc(1.4rem + 0.9rem);
        padding: 0;
        border: none;
        border-radius: 0.5rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        cursor: pointer;
    }
    .back :global(svg) {
        width: var(--fs-small);
        height: var(--fs-small);
    }
    .note {
        margin: 0;
        padding: 0.8rem;
        color: var(--background-text-prose);
    }
    .toolbar {
        display: flex;
        flex-wrap: wrap;
        gap: 0.5rem;
        padding-bottom: 0.6rem;
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
        scrollbar-gutter: stable;
        padding: 0 var(--documentation-spacing) 0.8rem;
    }
    /* `/all`: the Chapters on a panel of their own, as the Settings panel's sections sit on theirs
       (CollapsibleSection.svelte, `outlined`): the card surface inside its edge, so that each
       Chapter's header band and its open body, a well darker than the panel, read as they do
       there (owner, 2026-11-08) */
    .page .scroll {
        display: flex;
        flex-direction: column;
        gap: var(--documentation-spacing);
        overflow: visible;
        padding: 0.4rem;
        background-color: var(--wb-surface);
        color: var(--secondary-text);
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
    }
    .page .chapter {
        margin-bottom: 0;
    }
    /* on paper the Chapters alone, without the panel round them */
    @media print {
        .page .scroll {
            padding: 0;
            border: none;
            background: none;
        }
        .page .chapter-title::before,
        .page .chapter-title::after {
            display: none;
        }
    }
    .results {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }
    .chapter {
        --chapter-border-width: 1px;
        --chapter-radius: 0.5rem;
        /* a whole number of pixels wide, as Settings' sections are (CollapsibleSection.svelte):
           with a fraction of a pixel in its left edge and its width, the pinned title ended a pixel
           to the right of the body under it */
        width: round(down, 100%, 1px);
        display: flex;
        flex-direction: column;
        margin-bottom: var(--documentation-spacing);
        /* an open Chapter is a well darker than the panel, like an open Settings section; its edge
           is drawn over the panel, as a card's is, or it would sink into the well and vanish */
        background-color: var(--background);
        background-clip: padding-box;
        border: var(--chapter-border-width) solid
            var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
        /* The sticky heading carries the top border so it stays visible while scrolling. */
        border-top: none;
        border-radius: var(--chapter-radius);
    }
    .chapter.folded {
        border-bottom: none;
    }
    .chapter-title {
        position: sticky;
        top: 0;
        z-index: 2;
        will-change: transform;
        margin: 0 calc(-1 * var(--chapter-border-width));
        font-size: var(--fs-body);
        background-color: var(--wb-section-header, var(--tertiary));
        color: var(--secondary-text);
        border: var(--chapter-border-width) solid
            var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
        border-radius: var(--chapter-radius) var(--chapter-radius) 0 0;
        box-shadow: var(--shadow-1);
    }
    /* The frame's top corners are the heading's alone: past its rounded corners the panel's
       surface is painted over what the Chapter has there, its side edges and its well, which
       otherwise showed round the curve, most of all while the heading is pinned over the body
       scrolling under it (owner, 2026-11-08). Each corner is a square of the radius at the
       heading's outer edge, clear inside the curve and the panel outside it, with a pixel's
       blend so the curve stays smooth */
    .chapter-title::before,
    .chapter-title::after {
        content: '';
        position: absolute;
        top: calc(-1 * var(--chapter-border-width));
        width: var(--chapter-radius);
        height: var(--chapter-radius);
        pointer-events: none;
        --corner-outside: var(--wb-surface, var(--secondary));
    }
    .chapter-title::before {
        left: calc(-1 * var(--chapter-border-width));
        background: radial-gradient(
            circle at 100% 100%,
            transparent calc(var(--chapter-radius) - 0.5px),
            var(--corner-outside) calc(var(--chapter-radius) + 0.5px)
        );
    }
    .chapter-title::after {
        right: calc(-1 * var(--chapter-border-width));
        background: radial-gradient(
            circle at 0 100%,
            transparent calc(var(--chapter-radius) - 0.5px),
            var(--corner-outside) calc(var(--chapter-radius) + 0.5px)
        );
    }
    .chapter.folded .chapter-title {
        border-radius: var(--chapter-radius);
        box-shadow: none;
    }
    .chapter.categorized .chapter-title {
        box-shadow: none;
    }
    .chapter-entries {
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
        padding: 0.5rem;
        min-width: 0;
    }
    .chapter-entries.categorized {
        padding-top: 0;
    }
    .category-group {
        display: flex;
        flex-direction: column;
        gap: 0.05rem;
        min-width: 0;
    }
    .category-group + .category-group {
        margin-top: 0.4rem;
    }
    /* pinned under the Chapter's own heading while its group scrolls past, edge to edge, with a
       rule and a shadow under it so the rows going by read as passing beneath it */
    .category-title {
        position: sticky;
        top: var(--chapter-title-height, 2.2rem);
        z-index: 1;
        will-change: transform;
        margin: 0 -0.5rem;
        padding: 0.35rem 1rem;
        color: var(--secondary-text);
        background-color: var(--wb-section-header, var(--tertiary));
        border-top: 1px solid var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
        border-bottom: 1px solid
            var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
        box-shadow: var(--shadow-1);
    }
    /* a prose entry's title, brought back into view by Show less, lands below the pinned heading */
    .chapter :global(.prose-title) {
        scroll-margin-top: calc(var(--chapter-title-height, 2.2rem) + 0.5rem);
    }
    /* a row brought into view lands below both pinned headings */
    .category-group :global(.entry-row) {
        scroll-margin-top: calc(var(--chapter-title-height, 2.2rem) + 1.8rem);
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
        width: var(--fs-micro);
        height: var(--fs-micro);
        opacity: 0.6;
        transform: rotate(90deg);
        transition: transform var(--dur-base) ease;
    }
    .chevron.folded {
        transform: rotate(0deg);
    }
    .page .chapter-title {
        top: 3.2rem;
        font-size: var(--fs-prose);
    }
    .page .category-title {
        top: calc(3.2rem + var(--chapter-title-height, 2.6rem));
        font-size: var(--fs-small);
    }
    .page .category-group :global(.entry-row) {
        scroll-margin-top: calc(3.2rem + var(--chapter-title-height, 2.6rem) + 2rem);
    }
    @media (prefers-reduced-motion: reduce) {
        .chevron {
            transition: none;
        }
    }
</style>
