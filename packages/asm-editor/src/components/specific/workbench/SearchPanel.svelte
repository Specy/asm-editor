<script lang="ts">
    /**
     * The Search panel
     * ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md),
     * decisions 23 to 29): one query box with Match case, Match whole word and Use regular
     * expression, the "Files to include" and "Files to exclude" patterns behind a toggle, and, in
     * a Project with an Executable, "Look in" ticks for its Files, its Listings and its Pseudocode.
     * The results are grouped by File, the Pseudocode's by Executable then function, each row a
     * line's number and its text with the matches marked, at most 2,000 rows with Show more for
     * the rest. A row opens its File, Listing or function at the match, keeping the keyboard here;
     * the results are a tree the arrow keys, Home, End and Enter move through. While the panel is
     * shown with Pseudocode ticked, the Executables' functions are decompiled in the background,
     * with their progress, Cancel, and Try again for a function past the time limit.
     */
    import { untrack } from 'svelte'
    import { SvelteSet } from 'svelte/reactivity'
    import {
        AUTO_DECOMPILE_LIMIT,
        type SearchedListing
    } from '#lib/projectSearch/projectSearch.svelte.ts'
    import { escapeRegExp } from '#lib/projectSearch/query.ts'
    import { SEARCH_TIME_LIMIT_MS } from '#lib/projectSearch/searchClient.ts'
    import {
        groupResults,
        type SearchDocumentResult,
        type SearchResultGroup
    } from '#lib/projectSearch/searchResults.ts'
    import type { SearchRow } from '#lib/projectSearch/searchText.ts'
    import type { PseudocodeSearchProgress } from '#lib/pseudocode/pseudocodeSearchCache.ts'
    import FaAngleRight from '~icons/fa-solid/angle-right'
    import FaEllipsisH from '~icons/fa-solid/ellipsis-h'
    import FaSearch from '~icons/fa-solid/search'
    import SourceFileIcon from '#cmp/specific/project/SourceFileIcon.svelte'
    import { usesCommandKey } from '#stores/shortcutsStore.ts'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        /** Whether the panel is the one shown: only then are documents kept and searched. */
        shown?: boolean
        /** A result was opened, which closes a phone's drawer. */
        onReveal?: () => void
    }

    let { shown = true, onReveal }: Props = $props()

    const { session, ui } = useWorkbench()
    const search = session.projectSearch
    const project = session.project

    let queryInput = $state<HTMLInputElement>()
    let tree = $state<HTMLElement>()
    const problemId = `search-problem-${Math.random().toString(36).slice(2)}`

    $effect(() => {
        if (!shown) return
        return search.watch()
    })

    //Ctrl+Shift+F: the query focused, and filled with the editor's selection when there is one,
    //escaped when the query is a regular expression, so that it finds the text selected
    $effect(() => {
        const request = ui.searchRequest
        const input = queryInput
        if (!request || !input || request.token === search.answeredRequest) return
        search.answeredRequest = request.token
        untrack(() => {
            if (request.query !== undefined)
                search.text = search.regex ? escapeRegExp(request.query) : request.query
            requestAnimationFrame(() => {
                input.focus()
                input.select()
            })
        })
    })

    const fileName = (path: string) => path.slice(path.lastIndexOf('/') + 1)
    const folderOf = (path: string) => path.slice(0, Math.max(0, path.lastIndexOf('/')))
    /** "1 match", "12 matches", with the number written as a reader writes it. */
    const count = (n: number, noun: string, plural = `${noun}s`) =>
        `${n.toLocaleString('en-US')} ${n === 1 ? noun : plural}`

    const executables = $derived(search.executables)
    const lookIn = $derived(search.lookIn)
    const offered = $derived(executables.length > 0)
    const groups = $derived(groupResults(search.results))
    const totals = $derived(search.totals)
    const hidden = $derived(totals.lines - totals.rows)

    const stopped = `Search stopped after ${SEARCH_TIME_LIMIT_MS / 1000} seconds.`

    /** What the summary says under the controls. */
    const summary = $derived.by(() => {
        if (!search.text) return ''
        const found = `${count(totals.matches, 'match', 'matches')} in ${totals.files.toLocaleString('en-US')} ${totals.files === 1 ? 'File' : 'Files'}`
        switch (search.status) {
            case 'searching':
                return totals.matches && search.resultsCurrent
                    ? `Searching… ${found} so far`
                    : 'Searching…'
            case 'complete':
                return totals.matches ? found : 'No matches found.'
            case 'timedOut':
                return totals.matches
                    ? `${stopped} Found ${found} before stopping. Try a simpler pattern.`
                    : `${stopped} Try a simpler pattern.`
            case 'failed':
                return search.problem ?? 'Search failed. Try again.'
            default:
                return ''
        }
    })

    /** Why nothing is searched, when nothing can be. */
    const nothingTicked = $derived(
        !search.looksIn('files') && !search.looksIn('listings') && !search.looksIn('pseudocode')
    )

    // ---- the Listings and the Pseudocode the panel waits for -----------------------------------

    type Lane = {
        path: string
        name: string
        listing: SearchedListing | undefined
        progress: PseudocodeSearchProgress | undefined
    }

    const lanes = $derived.by<Lane[]>(() => {
        if (!offered || (!search.looksIn('listings') && !search.looksIn('pseudocode'))) return []
        return executables.map((path) => ({
            path,
            name: fileName(path),
            listing: search.listings.find((state) => state.path === path),
            progress: search.looksIn('pseudocode') ? search.progress[path] : undefined
        }))
    })

    /** What a screen reader hears of the batches: when one starts and when it ends. */
    const laneAnnouncement = $derived(
        lanes
            .map(({ name, progress }) => {
                if (!progress) return ''
                if (progress.running) return `Decompiling the functions of ${name}.`
                return progress.done >= progress.total
                    ? `Decompiled the functions of ${name}.`
                    : `Stopped decompiling the functions of ${name}.`
            })
            .filter(Boolean)
            .join(' ')
    )

    // ---- the results tree ----------------------------------------------------------------------

    /** The groups and functions folded away, by key. */
    const collapsed = new SvelteSet<string>()
    /** The tree item that takes the keyboard when the tree is tabbed into. */
    let activeKey = $state<string | undefined>()
    /** The row last opened, marked until another is. */
    let openedKey = $state<string | undefined>()

    type TreeItem =
        | {
              type: 'group'
              key: string
              level: 1
              group: SearchResultGroup
              expanded: boolean
          }
        | {
              type: 'function'
              key: string
              level: 2
              parent: string
              result: SearchDocumentResult
              expanded: boolean
          }
        | {
              type: 'row'
              key: string
              level: 2 | 3
              parent: string
              result: SearchDocumentResult
              row: SearchRow
          }

    /**
     * The tree's keys, which no path can make two items share: a path may hold `:` and `@`, so
     * a key is the item's parts as JSON rather than joined.
     */
    const groupKey = (group: SearchResultGroup) => JSON.stringify(['group', group.kind, group.path])
    const functionKey = (result: SearchDocumentResult) => JSON.stringify(['function', result.id])
    const rowKey = (result: SearchDocumentResult, row: SearchRow) =>
        JSON.stringify(['row', result.id, row.line])

    const items = $derived.by<TreeItem[]>(() => {
        const list: TreeItem[] = []
        for (const group of groups) {
            const key = groupKey(group)
            const expanded = !collapsed.has(key)
            list.push({ type: 'group', key, level: 1, group, expanded })
            if (!expanded) continue
            for (const result of group.documents) {
                let parent = key
                let level: 2 | 3 = 2
                if (group.kind === 'pseudocode') {
                    const fn = functionKey(result)
                    const open = !collapsed.has(fn)
                    list.push({
                        type: 'function',
                        key: fn,
                        level: 2,
                        parent: key,
                        result,
                        expanded: open
                    })
                    if (!open) continue
                    parent = fn
                    level = 3
                }
                for (const row of result.rows)
                    list.push({
                        type: 'row',
                        key: rowKey(result, row),
                        level,
                        parent,
                        result,
                        row
                    })
            }
        }
        return list
    })

    /** The item that takes the keyboard on Tab: the one last moved to, else the first. */
    const tabKey = $derived(
        activeKey !== undefined && items.some((item) => item.key === activeKey)
            ? activeKey
            : items[0]?.key
    )

    function groupTitle(group: SearchResultGroup) {
        if (group.kind === 'listing') return `The Listing of ${group.path}`
        if (group.kind === 'pseudocode') return `The Pseudocode of ${group.path}`
        return group.path
    }

    /**
     * A row's text as shown: without its indentation, and from a little before its first match
     * when that is far along the line, with each match marked.
     */
    function segments(row: SearchRow): { text: string; match: boolean }[] {
        const { text } = row
        const indent = text.length - text.trimStart().length
        const first = row.ranges.length ? Math.max(0, row.ranges[0].start - row.textStart) : indent
        const from = first < indent ? first : first - indent > 40 ? first - 24 : indent
        const parts: { text: string; match: boolean }[] = []
        if (from > indent || row.textStart > 0) parts.push({ text: '…', match: false })
        let at = from
        for (const range of row.ranges) {
            const start = Math.max(at, range.start - row.textStart)
            const end = Math.min(
                text.length,
                range.endLine === undefined ? range.end - row.textStart : text.length
            )
            if (start >= text.length) break
            if (start > at) parts.push({ text: text.slice(at, start), match: false })
            if (end > start) parts.push({ text: text.slice(start, end), match: true })
            at = Math.max(at, end)
        }
        if (at < text.length) parts.push({ text: text.slice(at), match: false })
        return parts
    }

    function rowLabel(item: Extract<TreeItem, { type: 'row' }>) {
        const matches = item.row.ranges.length
        return `Line ${item.row.line}: ${item.row.text.trim()}, ${count(matches, 'match', 'matches')}`
    }

    async function open(item: Extract<TreeItem, { type: 'row' }>) {
        openedKey = item.key
        activeKey = item.key
        await session.openSearchResult(item.result.document, item.row)
        onReveal?.()
    }

    function toggle(key: string) {
        if (collapsed.has(key)) collapsed.delete(key)
        else collapsed.add(key)
    }

    function treeItems(): HTMLElement[] {
        return [...(tree?.querySelectorAll<HTMLElement>('[role="treeitem"]') ?? [])]
    }

    function focusItem(key: string | undefined) {
        if (key === undefined) return
        activeKey = key
        requestAnimationFrame(() =>
            treeItems()
                .find((element) => element.dataset.key === key)
                ?.focus()
        )
    }

    function onItemKeydown(event: KeyboardEvent, item: TreeItem) {
        const index = items.indexOf(item)
        let next: string | undefined
        switch (event.key) {
            case 'ArrowDown':
                next = items[Math.min(items.length - 1, index + 1)]?.key
                break
            case 'ArrowUp':
                if (index === 0) {
                    event.preventDefault()
                    queryInput?.focus()
                    return
                }
                next = items[index - 1]?.key
                break
            case 'Home':
                next = items[0]?.key
                break
            case 'End':
                next = items.at(-1)?.key
                break
            case 'ArrowRight':
                if (item.type === 'row') return
                if (!item.expanded) toggle(item.key)
                else next = items[index + 1]?.key
                break
            case 'ArrowLeft':
                if (item.type !== 'row' && item.expanded) toggle(item.key)
                else if (item.type !== 'group') next = item.parent
                else return
                break
            case 'Enter':
            case ' ':
                if (item.type === 'row') void open(item)
                else toggle(item.key)
                break
            default:
                return
        }
        event.preventDefault()
        focusItem(next ?? item.key)
    }

    /**
     * Alt+C, Alt+W and Alt+R switch the toggles from anywhere in the panel's controls; on a Mac
     * ⌥⌘C, ⌥⌘W and ⌥⌘R, as Visual Studio Code has them, since Option alone types a character
     * there (`ç`, `∑`, `®`), which the boxes must take.
     */
    const mac = usesCommandKey()
    function onControlsKeydown(event: KeyboardEvent) {
        if (!event.altKey || event.ctrlKey || event.metaKey !== mac) return
        if (event.code === 'KeyC') search.matchCase = !search.matchCase
        else if (event.code === 'KeyW') search.wholeWord = !search.wholeWord
        else if (event.code === 'KeyR') search.regex = !search.regex
        else return
        event.preventDefault()
    }

    function onQueryKeydown(event: KeyboardEvent) {
        if (event.key === 'ArrowDown') {
            event.preventDefault()
            focusItem(tabKey)
        } else if (event.key === 'Enter') {
            event.preventDefault()
            const first = items.find((item) => item.type === 'row')
            if (first?.type === 'row') void open(first)
        } else if (event.key === 'Escape' && search.text) {
            event.preventDefault()
            event.stopPropagation()
            search.text = ''
        }
    }

    const toggleKey = (letter: string) => (mac ? `⌥⌘${letter}` : `Alt+${letter}`)
    const TOGGLES = [
        { key: 'matchCase', label: 'Match case', glyph: 'Aa', shortcut: toggleKey('C') },
        { key: 'wholeWord', label: 'Match whole word', glyph: 'ab', shortcut: toggleKey('W') },
        { key: 'regex', label: 'Use regular expression', glyph: '.*', shortcut: toggleKey('R') }
    ] as const

    const LOOK_IN = [
        { key: 'files', label: 'Files', title: "The Project's text Files" },
        {
            key: 'listings',
            label: 'Listings',
            title: "Each Executable's Listing, with its renames and comments"
        },
        {
            key: 'pseudocode',
            label: 'Pseudocode',
            title: "Every function's Pseudocode, decompiled in the background while the panel is open"
        }
    ] as const
</script>

<section class="search" class:touch={!ui.viewport.canHover} aria-label="Search the Project">
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="search-controls" onkeydown={onControlsKeydown}>
        <div class="query-row">
            <div class="query" class:invalid={search.status === 'invalid'}>
                <span class="query-icon" aria-hidden="true"><FaSearch /></span>
                <input
                    bind:this={queryInput}
                    bind:value={search.text}
                    type="text"
                    spellcheck="false"
                    autocomplete="off"
                    aria-label="Search"
                    placeholder="Search"
                    aria-invalid={search.status === 'invalid'}
                    aria-describedby={search.status === 'invalid' ? problemId : undefined}
                    onkeydown={onQueryKeydown}
                />
                {#each TOGGLES as option (option.key)}
                    <button
                        type="button"
                        class="toggle {option.key}"
                        aria-pressed={search[option.key]}
                        aria-label={option.label}
                        title={`${option.label} (${option.shortcut})`}
                        onclick={() => (search[option.key] = !search[option.key])}
                        >{option.glyph}</button
                    >
                {/each}
            </div>
            <button
                type="button"
                class="details"
                aria-expanded={search.details}
                aria-label="Files to include and exclude"
                title="Files to include and exclude"
                onclick={() => (search.details = !search.details)}
            >
                <FaEllipsisH />
            </button>
        </div>
        {#if search.status === 'invalid' && search.problem}
            <p class="problem" id={problemId}>{search.problem}</p>
        {/if}
        {#if search.details || search.include || search.exclude}
            <label class="pattern">
                <span>Files to include</span>
                <input
                    bind:value={search.include}
                    type="text"
                    spellcheck="false"
                    autocomplete="off"
                    placeholder="*.c, src/**"
                />
            </label>
            <label class="pattern">
                <span>Files to exclude</span>
                <input
                    bind:value={search.exclude}
                    type="text"
                    spellcheck="false"
                    autocomplete="off"
                    placeholder="*.md, build/**"
                />
            </label>
        {/if}
        {#if offered}
            <fieldset class="look-in">
                <legend>Look in</legend>
                {#each LOOK_IN as place (place.key)}
                    <label title={place.title}>
                        <input
                            type="checkbox"
                            checked={lookIn[place.key]}
                            onchange={(event) =>
                                search.setLookIn(place.key, event.currentTarget.checked)}
                        />
                        {place.label}
                    </label>
                {/each}
            </fieldset>
        {/if}
    </div>

    {#if lanes.length}
        <div class="lanes">
            {#each lanes as lane (lane.path)}
                {@const listing = lane.listing}
                {@const progress = lane.progress}
                {#if listing?.status === 'generating'}
                    <div class="lane">
                        <p>
                            Generating the Listing of {lane.name}{listing.document.progress ===
                            undefined
                                ? '…'
                                : `: ${Math.round(listing.document.progress * 100)}%`}
                        </p>
                        <progress
                            max="1"
                            value={listing.document.progress}
                            aria-label={`The Listing of ${lane.name} generated so far`}
                        ></progress>
                    </div>
                {:else if listing?.status === 'failed'}
                    <p class="lane failed">
                        The Listing of {lane.name} could not be generated: {listing.document.error}
                    </p>
                {:else if progress && progress.total > 0}
                    {#if progress.running}
                        <div class="lane">
                            <div class="lane-line">
                                <p>
                                    Decompiling {progress.done.toLocaleString('en-US')} of {progress.total.toLocaleString(
                                        'en-US'
                                    )} functions of {lane.name}
                                </p>
                                <button
                                    type="button"
                                    class="lane-action"
                                    onclick={() => search.cancel(lane.path)}>Cancel</button
                                >
                            </div>
                            <progress
                                max={progress.total}
                                value={progress.done}
                                aria-label={`Functions of ${lane.name} decompiled`}
                            ></progress>
                        </div>
                    {:else if progress.done < progress.total}
                        <div class="lane lane-line">
                            {#if search.cancelled.has(lane.path) || progress.done > 0 || progress.total <= AUTO_DECOMPILE_LIMIT}
                                <p>
                                    Searched {progress.done.toLocaleString('en-US')} of {progress.total.toLocaleString(
                                        'en-US'
                                    )} functions of {lane.name}. Press Resume to search the rest.
                                </p>
                                <button
                                    type="button"
                                    class="lane-action"
                                    onclick={() => search.decompile(lane.path)}>Resume</button
                                >
                            {:else}
                                <p>
                                    {lane.name} has {progress.total.toLocaleString('en-US')} functions.
                                    Their Pseudocode is decompiled when you search.
                                </p>
                                <button
                                    type="button"
                                    class="lane-action"
                                    onclick={() => search.decompile(lane.path)}
                                    >Decompile now</button
                                >
                            {/if}
                        </div>
                    {/if}
                    {#if progress.failures.length}
                        <details class="lane failures">
                            <summary>
                                {`${count(progress.failures.length, 'function')} of ${lane.name} couldn't be searched.`}
                            </summary>
                            <ul>
                                {#each progress.failures as failure (failure.address)}
                                    <li title={failure.error}>
                                        <span class="failure-name">{failure.name}</span>
                                        <span class="failure-error">{failure.error}</span>
                                        {#if failure.retryable}
                                            <button
                                                type="button"
                                                class="lane-action"
                                                aria-label={`Try ${failure.name} again`}
                                                onclick={() =>
                                                    search.retry(lane.path, failure.address)}
                                                >Try again</button
                                            >
                                        {/if}
                                    </li>
                                {/each}
                            </ul>
                        </details>
                    {/if}
                {/if}
            {/each}
            <p class="announcement" role="status" aria-live="polite">{laneAnnouncement}</p>
        </div>
    {/if}

    {#if nothingTicked}
        <p class="note">Nothing to search: tick Files, Listings or Pseudocode under “Look in”.</p>
    {:else if !search.text}
        <p class="note">
            {offered
                ? "Search the Project's Files, Listings and Pseudocode."
                : "Search the Project's Files."}
        </p>
    {/if}
    <p
        class="summary"
        class:searching={search.status === 'searching'}
        class:failed={search.status === 'timedOut' || search.status === 'failed'}
        role="status"
    >
        {summary}
    </p>

    {#if items.length}
        <div
            class="results"
            class:stale={!search.resultsCurrent}
            role="tree"
            aria-label="Results"
            aria-busy={search.status === 'searching'}
            bind:this={tree}
        >
            {#each items as item (item.key)}
                {#if item.type === 'group'}
                    {@const group = item.group}
                    <div
                        class="item group"
                        role="treeitem"
                        aria-level={1}
                        aria-expanded={item.expanded}
                        aria-selected={false}
                        aria-label={`${groupTitle(group)}, ${count(group.matches, 'match', 'matches')}`}
                        tabindex={item.key === tabKey ? 0 : -1}
                        data-key={item.key}
                        title={groupTitle(group)}
                        onclick={() => {
                            activeKey = item.key
                            toggle(item.key)
                        }}
                        onkeydown={(event) => onItemKeydown(event, item)}
                        onfocus={() => (activeKey = item.key)}
                    >
                        <span class="disclosure" class:open={item.expanded} aria-hidden="true"
                            ><FaAngleRight /></span
                        >
                        <SourceFileIcon
                            path={group.path}
                            language={project.language}
                            file={project.files[group.path]}
                        />
                        <span class="group-name ellipsis">{fileName(group.path)}</span>
                        {#if group.kind !== 'file'}
                            <span class="view-tag"
                                >{group.kind === 'listing' ? 'Listing' : 'Pseudocode'}</span
                            >
                        {/if}
                        <span class="folder ellipsis">{folderOf(group.path)}</span>
                        <span class="count-badge">{group.matches.toLocaleString('en-US')}</span>
                    </div>
                {:else if item.type === 'function'}
                    {@const fn = item.result.document.function}
                    <div
                        class="item function"
                        role="treeitem"
                        aria-level={2}
                        aria-expanded={item.expanded}
                        aria-selected={false}
                        aria-label={`${fn?.name}, ${count(item.result.matches, 'match', 'matches')}`}
                        tabindex={item.key === tabKey ? 0 : -1}
                        data-key={item.key}
                        title={fn ? `${fn.name} at 0x${fn.address.toString(16)}` : undefined}
                        onclick={() => {
                            activeKey = item.key
                            toggle(item.key)
                        }}
                        onkeydown={(event) => onItemKeydown(event, item)}
                        onfocus={() => (activeKey = item.key)}
                    >
                        <span class="disclosure" class:open={item.expanded} aria-hidden="true"
                            ><FaAngleRight /></span
                        >
                        <span class="function-name ellipsis">{fn?.name}</span>
                        <span class="count-badge"
                            >{item.result.matches.toLocaleString('en-US')}</span
                        >
                    </div>
                {:else}
                    <div
                        class="item row level-{item.level}"
                        class:opened={item.key === openedKey}
                        role="treeitem"
                        aria-level={item.level}
                        aria-selected={item.key === openedKey}
                        aria-label={rowLabel(item)}
                        tabindex={item.key === tabKey ? 0 : -1}
                        data-key={item.key}
                        title={item.row.text.trim()}
                        onclick={() => void open(item)}
                        onkeydown={(event) => onItemKeydown(event, item)}
                        onfocus={() => (activeKey = item.key)}
                    >
                        <span class="line-number">{item.row.line}</span>
                        <span class="row-text"
                            >{#each segments(item.row) as part, index (index)}{#if part.match}<mark
                                        >{part.text}</mark
                                    >{:else}{part.text}{/if}{/each}</span
                        >
                    </div>
                {/if}
            {/each}
            {#if hidden > 0}
                <div class="more">
                    <span>{count(hidden, 'more line')} not shown</span>
                    <button type="button" class="lane-action" onclick={() => search.showMore()}
                        >Show more</button
                    >
                </div>
            {/if}
        </div>
    {/if}
</section>

<style lang="scss">
    .search {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        font-size: 0.78rem;
    }

    .search-controls {
        display: flex;
        flex: none;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.5rem;
    }

    .query-row {
        display: flex;
        align-items: center;
        gap: 0.3rem;
    }

    /* the Symbols panel's filter, with the three toggles at its end */
    .query {
        display: flex;
        flex: 1;
        align-items: center;
        gap: 0.2rem;
        min-width: 0;
        min-height: 2rem;
        padding: 0.2rem 0.25rem 0.2rem 0.6rem;
        border-radius: 0.5rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);

        &:focus-within {
            outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
        }

        &.invalid {
            outline: 2px solid color-mix(in srgb, var(--red) 75%, transparent);
        }

        input {
            flex: 1;
            min-width: 0;
            padding: 0 0 0 0.25rem;
            border: none;
            outline: none;
            background: transparent;
            color: inherit;
            font: inherit;
        }
    }

    .query-icon {
        display: flex;
        flex: none;
        width: 0.75rem;
        height: 0.75rem;
        opacity: 0.7;
    }

    .toggle {
        display: grid;
        place-items: center;
        flex: none;
        min-width: 1.45rem;
        height: 1.45rem;
        padding: 0 0.2rem;
        border: 1px solid transparent;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        font-family: 'Fira Code', monospace;
        font-size: 0.7rem;
        line-height: 1;
        opacity: 0.75;
        cursor: pointer;

        &:hover {
            opacity: 1;
            background-color: color-mix(in srgb, var(--tertiary-text) 12%, transparent);
        }

        &[aria-pressed='true'] {
            opacity: 1;
            color: var(--accent);
            border-color: color-mix(in srgb, var(--accent) 70%, transparent);
            background-color: color-mix(in srgb, var(--accent) 16%, transparent);
        }

        &.wholeWord {
            text-decoration: underline;
            text-underline-offset: 0.18em;
        }
    }

    .details {
        display: grid;
        place-items: center;
        flex: none;
        width: 1.7rem;
        height: 1.7rem;
        padding: 0.42rem;
        border: none;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        opacity: 0.75;
        cursor: pointer;

        &:hover,
        &[aria-expanded='true'] {
            opacity: 1;
            background-color: var(--tertiary);
        }
    }

    .problem {
        margin: 0;
        padding: 0 0.3rem;
        color: var(--red);
        font-size: 0.72rem;
        line-height: 1.35;
        overflow-wrap: anywhere;
    }

    .pattern {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        font-size: 0.7rem;
        opacity: 0.9;

        input {
            min-width: 0;
            min-height: 1.8rem;
            padding: 0.2rem 0.5rem;
            border: none;
            border-radius: 0.4rem;
            outline: none;
            background-color: var(--tertiary);
            color: var(--tertiary-text);
            font: inherit;
            font-size: 0.78rem;

            &:focus {
                outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
            }
        }
    }

    .look-in {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 0.2rem 0.8rem;
        margin: 0;
        padding: 0 0.2rem;
        border: none;

        legend {
            float: left;
            margin-right: 0.2rem;
            padding: 0;
            font-size: 0.7rem;
            opacity: 0.7;
        }

        label {
            display: inline-flex;
            align-items: center;
            gap: 0.3rem;
            min-height: 1.4rem;
            cursor: pointer;
        }

        input {
            margin: 0;
            accent-color: var(--accent);
        }
    }

    .lanes {
        display: flex;
        flex: none;
        flex-direction: column;
        gap: 0.35rem;
        padding: 0 0.8rem 0.4rem;
    }

    .lane {
        margin: 0;
        font-size: 0.72rem;
        line-height: 1.35;

        p {
            margin: 0;
        }

        progress {
            width: 100%;
            height: 0.35rem;
            accent-color: var(--accent);
        }

        &.failed {
            color: var(--red);
        }
    }

    .lane-line {
        display: flex;
        align-items: center;
        gap: 0.5rem;

        p {
            flex: 1;
            min-width: 0;
        }
    }

    .lane-action {
        flex: none;
        padding: 0.15rem 0.5rem;
        border: 1px solid var(--wb-line, var(--tertiary));
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        font: inherit;
        font-size: 0.7rem;
        cursor: pointer;

        &:hover {
            background-color: var(--tertiary);
        }
    }

    .failures {
        summary {
            cursor: pointer;
        }

        ul {
            margin: 0.25rem 0 0;
            padding: 0;
            list-style: none;
        }

        li {
            display: flex;
            align-items: center;
            gap: 0.4rem;
            min-height: 1.5rem;
        }
    }

    .failure-name {
        flex: none;
        font-family: 'Fira Code', monospace;
    }

    .failure-error {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        opacity: 0.65;
    }

    .announcement {
        position: absolute;
        width: 1px;
        height: 1px;
        margin: -1px;
        overflow: hidden;
        clip-path: inset(50%);
        white-space: nowrap;
    }

    .note {
        margin: 0;
        padding: 0.3rem 0.8rem;
        font-size: 0.75rem;
        line-height: 1.4;
        color: var(--hint);
    }

    .summary {
        flex: none;
        margin: 0;
        padding: 0 0.8rem 0.3rem;
        font-size: 0.7rem;
        opacity: 0.7;

        &:empty {
            display: none;
        }

        &.failed {
            color: var(--red);
            opacity: 1;
        }
    }

    .results {
        flex: 1;
        min-height: 0;
        padding: 0 0 0.4rem;
        overflow: auto;
        scrollbar-gutter: stable;

        /* the last query's, until the new one's first results come */
        &.stale {
            opacity: 0.55;
        }
    }

    .item {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        height: 1.55rem;
        padding: 0 0.6rem 0 0.4rem;
        cursor: pointer;
        white-space: nowrap;
        /* a long list lays out and paints only the rows in view */
        content-visibility: auto;
        contain-intrinsic-size: auto 1.55rem;

        &:hover,
        &:focus-visible {
            background: var(--tertiary);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
    }

    .touch .item {
        height: 2rem;
        contain-intrinsic-size: auto 2rem;
    }

    .disclosure {
        display: grid;
        place-items: center;
        flex: none;
        width: 0.8rem;
        height: 0.8rem;
        opacity: 0.7;
        transition: transform 0.1s;

        &.open {
            transform: rotate(90deg);
        }

        :global(svg) {
            width: 0.6rem;
            height: 0.6rem;
        }
    }

    .ellipsis {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .group {
        font-weight: 600;
    }

    .group-name {
        flex: none;
        max-width: 60%;
    }

    .view-tag {
        flex: none;
        padding: 0.02rem 0.3rem;
        border-radius: 999px;
        background: color-mix(in srgb, var(--accent) 12%, transparent);
        color: var(--accent);
        font-size: 0.6rem;
        font-weight: 600;
    }

    .folder {
        flex: 1;
        font-size: 0.7rem;
        font-weight: normal;
        opacity: 0.55;
    }

    .count-badge {
        flex: none;
        min-width: 1.2rem;
        margin-left: auto;
        padding: 0 0.35rem;
        border-radius: 999px;
        background: var(--tertiary);
        font-size: 0.65rem;
        font-weight: normal;
        text-align: center;
    }

    .function {
        padding-left: 1.2rem;
        font-family: 'Fira Code', monospace;
        font-size: 0.72rem;

        .function-name {
            flex: 1;
        }
    }

    .row {
        gap: 0.5rem;
        font-family: 'Fira Code', monospace;
        font-size: 0.72rem;

        &.level-2 {
            padding-left: 1.6rem;
        }

        &.level-3 {
            padding-left: 2.4rem;
        }

        &.opened {
            background: color-mix(in srgb, var(--accent) 24%, var(--tertiary));
            box-shadow: inset 2px 0 0 var(--accent);
        }
    }

    .line-number {
        flex: none;
        min-width: 2ch;
        text-align: right;
        opacity: 0.5;
    }

    .row-text {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: pre;

        mark {
            border-radius: 0.15rem;
            background: color-mix(in srgb, var(--accent) 38%, transparent);
            color: inherit;
        }
    }

    .more {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.4rem 0.8rem;
        font-size: 0.72rem;
        opacity: 0.85;
    }
</style>
