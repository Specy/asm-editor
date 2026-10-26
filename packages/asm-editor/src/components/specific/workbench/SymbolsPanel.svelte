<script lang="ts">
    /**
     * The Symbols panel
     * ([reverse-engineering-ux.md](../../../../../../docs/design/reverse-engineering-ux.md),
     * decision 18): the functions and strings of the Executable in the focused editor pane, or else
     * of the Selected program's Entry file, read from its Listing, which is generated for the panel
     * when no pane shows it yet. A row reveals its line in the Listing, which a Pseudocode beside
     * it follows, and the row the Listing's cursor is in is marked. The filter keeps the rows whose
     * name, or text, or address holds what is typed; Enter in it reveals the first, and the arrow
     * keys move from it through the rows. A C++ function's row shows its demangled name, and its
     * filter and tooltip read the raw name as well
     * ([cpp-demangling.md](../../../../../../docs/design/cpp-demangling.md), decision 11). A
     * function's row renames it, comments on it and resets its name, from its menu (a right click,
     * the Menu key, or on a touch screen its button) and on F2
     * ([annotations-and-search.md](../../../../../../docs/design/annotations-and-search.md),
     * decision 18), in a prompt over the panel.
     */
    import ContextMenu, { type ContextMenuEntry } from '#cmp/shared/menu/ContextMenu.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import SegmentedControl from '#cmp/specific/project/cpu/SegmentedControl.svelte'
    import { functionAtLine } from '#lib/listing/listing.ts'
    import type { ListingDocument } from '#lib/listing/listingDocuments.svelte.ts'
    import { ListingIndex } from '#lib/listing/listingNavigation.ts'
    import {
        filterFunctions,
        filterStrings,
        functionTooltip,
        listingFunctions,
        listingStrings,
        symbolAddress,
        symbolQuery,
        type FunctionSymbol
    } from '#lib/listing/listingSymbols.ts'
    import type { AnnotationPrompt } from '#lib/workbench/annotationPrompt.svelte.ts'
    import { renameTarget } from '#lib/workbench/annotationTargets.ts'
    import {
        buildSource,
        isSameProjectSourceSelection,
        liveSource,
        type ProjectSourceSelection
    } from '#lib/monaco/projectSourceSelection.ts'
    import FaCommentAlt from '~icons/fa-solid/comment-alt'
    import FaEllipsisH from '~icons/fa-solid/ellipsis-h'
    import FaFilter from '~icons/fa-solid/filter'
    import FaPen from '~icons/fa-solid/pen'
    import FaTimes from '~icons/fa-solid/times'
    import FaUndo from '~icons/fa-solid/undo'
    import AnnotationPromptView from './AnnotationPrompt.svelte'
    import { useWorkbench } from './workbenchContext'

    interface Props {
        /** Whether the panel is the one shown; a hidden one starts no Listing. */
        shown?: boolean
        /** A row was picked, which closes a phone's drawer. */
        onReveal?: () => void
    }

    let { shown = true, onReveal }: Props = $props()

    const { session, ui } = useWorkbench()
    const project = session.project

    type Kind = 'functions' | 'strings'
    const KINDS = [
        { id: 'functions', label: 'Functions' },
        { id: 'strings', label: 'Strings' }
    ]
    /** How much of a string a row holds; its tooltip has the whole of it. */
    const SHOWN_STRING = 160

    let kind = $state<Kind>('functions')
    let filter = $state('')
    let filterInput = $state<HTMLInputElement>()
    let list = $state<HTMLElement>()

    /**
     * The File the panel lists, in the version shown: the focused pane's Executable, else the
     * Selected program's Entry when it is one, in the Debug session's version while it has it.
     */
    const source = $derived.by<{ selection: ProjectSourceSelection; entry: boolean } | undefined>(
        () => {
            const focused = session.focusedGroup
            if (focused.displayedKind === 'executable')
                return { selection: { ...focused.sourceSelection }, entry: false }
            const entry = project.selectedProgram
            if (entry === undefined || session.kindAt(entry) !== 'executable') return undefined
            const built = session.debugSession && !!session.emulator.buildSources?.files[entry]
            return {
                selection: built ? buildSource(entry, session.buildGeneration) : liveSource(entry),
                entry: true
            }
        }
    )

    //kept while the panel is hidden, so showing it again finds its rows as they were, and while
    //the same File's Listing is made again, after a rename or a comment, so its rows stay
    let kept: ListingDocument | undefined
    let keptSelection: ProjectSourceSelection | undefined
    //asked for apart: a derived does not depend on the state of a document it made
    const requested = $derived(source && shown ? session.listingFor(source.selection) : undefined)
    const listingDocument = $derived.by(() => {
        if (!source) return (kept = undefined)
        if (!shown) return kept
        if (
            requested?.status === 'generating' &&
            kept?.status === 'ready' &&
            isSameProjectSourceSelection(keptSelection, source.selection)
        )
            return kept
        keptSelection = source.selection
        return (kept = requested)
    })
    const listing = $derived(listingDocument?.listing)
    const functions = $derived(listing ? listingFunctions(listing) : [])
    const strings = $derived(
        listing && listingDocument ? listingStrings(listing, listingDocument.bytes) : []
    )
    const query = $derived(symbolQuery(filter))
    const shownFunctions = $derived(filterFunctions(functions, query))
    const shownStrings = $derived(filterStrings(strings, query))
    const total = $derived(kind === 'functions' ? functions.length : strings.length)
    const count = $derived(kind === 'functions' ? shownFunctions.length : shownStrings.length)
    const noun = $derived(
        `${kind === 'functions' ? 'function' : 'string'}${total === 1 ? '' : 's'}`
    )

    /**
     * The line of the Listing's cursor, in a pane showing the listed version, the focused one
     * first; else the label of the function a focused Pseudocode shows.
     */
    const cursorLine = $derived.by(() => {
        if (!source) return -1
        const focused = session.focusedGroup
        const panes = [focused, ...session.groups.filter((group) => group !== focused)]
        const pane = panes.find(
            (group) =>
                group.displayedView === 'listing' &&
                isSameProjectSourceSelection(group.sourceSelection, source.selection)
        )
        if (pane) return pane.cursorLine
        return focused.displayedView === 'pseudocode' &&
            isSameProjectSourceSelection(focused.sourceSelection, source.selection)
            ? (focused.pseudocodeFunction?.line ?? -1)
            : -1
    })
    /** The run-time address of the row the cursor is in. */
    const current = $derived.by(() => {
        const line = cursorLine
        if (!listing || line < 0) return undefined
        if (kind === 'strings')
            return strings.find((string) => line >= string.line && line < string.endLine)?.address
        const fn = functionAtLine(listing, line)
        return fn && fn.address + listing.base
    })
    /** The widest address and size, which every row's columns are as wide as, so they line up. */
    const widest = (texts: string[]) => texts.reduce((most, text) => Math.max(most, text.length), 0)
    const addressWidth = $derived(
        kind === 'functions'
            ? widest(functions.map((fn) => symbolAddress(fn.address)))
            : widest(strings.map((string) => symbolAddress(string.address)))
    )
    const sizeWidth = $derived(widest(functions.map((fn) => `${fn.size} B`)))

    function reveal(line: number) {
        if (!source) return
        void session.revealListingLine(source.selection, line)
        onReveal?.()
    }

    /** The Project's File the rows rename and comment on, when the listed version takes them. */
    const annotatable = $derived(source ? session.annotatableFile(source.selection) : undefined)
    let menu = $state<{ x: number; y: number; items: ContextMenuEntry[] } | null>(null)
    /** The function whose menu is open, whose row is marked meanwhile. */
    let menuFunction = $state<number | undefined>()
    let prompt = $state.raw<AnnotationPrompt | undefined>()
    /** The row the prompt was opened from, which takes the keyboard back when it closes. */
    let promptRow: HTMLElement | undefined
    /** The prompt, while the panel lists the File it annotates. */
    const openPrompt = $derived(
        prompt && prompt.spec.path === source?.selection.path ? prompt : undefined
    )

    /** A function row's label and Listing function, in the Listing listed. */
    function functionOf(symbol: FunctionSymbol) {
        const fn = listing?.functions.find((each) => each.line === symbol.line)
        const label = listing && fn ? ListingIndex.of(listing).label(fn.name, fn.line) : undefined
        return fn && label ? { fn, label } : undefined
    }

    function rename(symbol: FunctionSymbol, row?: HTMLElement) {
        const found = functionOf(symbol)
        if (!annotatable || !listing || !found) return
        open(session.renamePrompt(annotatable, renameTarget(listing, found.label)), row)
    }

    function comment(symbol: FunctionSymbol, row?: HTMLElement) {
        const found = functionOf(symbol)
        if (!annotatable || !listing || !found) return
        const target = {
            kind: 'function comment' as const,
            address: found.fn.address,
            function: found.fn
        }
        open(session.commentPrompt(annotatable, listing, target), row)
    }

    function open(opened: AnnotationPrompt | undefined, row: HTMLElement | undefined) {
        if (!opened) return
        prompt = opened
        promptRow = row
    }

    function closePrompt() {
        prompt = undefined
        promptRow?.focus()
    }

    function functionItems(symbol: FunctionSymbol, row?: HTMLElement): ContextMenuEntry[] {
        const label = functionOf(symbol)?.label
        const disabled = !annotatable
        return [
            {
                label: 'Rename…',
                icon: FaPen,
                disabled,
                onSelect: () => rename(symbol, row)
            },
            {
                label: 'Comment…',
                icon: FaCommentAlt,
                disabled,
                onSelect: () => comment(symbol, row)
            },
            ...(label?.renamed || label?.renameConflict
                ? [
                      {
                          label: 'Reset name',
                          icon: FaUndo,
                          disabled,
                          onSelect: () => {
                              if (annotatable) session.resetName(annotatable, label.address)
                          }
                      }
                  ]
                : [])
        ]
    }

    /**
     * A function row's menu, at the pointer, or under the row when the keyboard opened it (Shift+F10,
     * the Menu key) or its button did.
     */
    function openMenu(event: MouseEvent, symbol: FunctionSymbol, row: HTMLElement) {
        event.preventDefault()
        event.stopPropagation()
        const keyboard = event.button === -1 || (event.clientX === 0 && event.clientY === 0)
        const at = keyboard || event.type === 'click' ? row.getBoundingClientRect() : undefined
        menuFunction = symbol.address
        menu = {
            x: at ? at.left + 16 : event.clientX,
            y: at ? at.bottom : event.clientY,
            items: functionItems(symbol, row)
        }
    }

    function revealFirst() {
        const first = kind === 'functions' ? shownFunctions[0] : shownStrings[0]
        if (first) reveal(first.line)
    }

    function rows(): HTMLButtonElement[] {
        return [...(list?.querySelectorAll<HTMLButtonElement>('button.symbol-row') ?? [])]
    }

    function onFilterKeydown(event: KeyboardEvent) {
        if (event.key === 'Enter') {
            event.preventDefault()
            revealFirst()
        } else if (event.key === 'ArrowDown') {
            event.preventDefault()
            rows()[0]?.focus()
        } else if (event.key === 'Escape' && filter) {
            event.preventDefault()
            event.stopPropagation()
            filter = ''
        }
    }

    /**
     * Up and Down move through the rows, Home and End to the first and last; Up from the first
     * goes back to the filter. F2 renames a function's row.
     */
    function onRowKeydown(event: KeyboardEvent, symbol?: FunctionSymbol) {
        if (event.key === 'F2' && symbol) {
            event.preventDefault()
            rename(symbol, event.currentTarget as HTMLElement)
            return
        }
        const all = rows()
        const index = all.indexOf(event.currentTarget as HTMLButtonElement)
        let next: HTMLElement | undefined
        if (event.key === 'ArrowDown') next = all[Math.min(all.length - 1, index + 1)]
        else if (event.key === 'ArrowUp') next = index > 0 ? all[index - 1] : filterInput
        else if (event.key === 'Home') next = all[0]
        else if (event.key === 'End') next = all.at(-1)
        else return
        event.preventDefault()
        next?.focus()
    }
</script>

<section class="symbols" aria-label="Symbols">
    {#if !source}
        <p class="note">
            Open an Executable, or select a Program that runs one, to see its functions and strings.
        </p>
    {:else}
        <div
            class="symbols-file"
            title={source.entry
                ? `${source.selection.path}, the Selected program's Entry file`
                : `${source.selection.path}, shown in the editor`}
        >
            <strong class="ellipsis">{source.selection.path}</strong>
            {#if source.entry}
                <span class="entry-mark">ENTRY</span>
            {/if}
        </div>
        <div class="symbols-controls">
            <SegmentedControl
                ariaLabel="Symbols to list"
                options={KINDS}
                selected={kind}
                onSelect={(id) => (kind = id as Kind)}
                fill
            />
            <div class="filter">
                <span class="filter-icon" aria-hidden="true"><FaFilter /></span>
                <input
                    bind:this={filterInput}
                    bind:value={filter}
                    type="search"
                    spellcheck="false"
                    autocomplete="off"
                    aria-label={kind === 'functions'
                        ? 'Filter the functions'
                        : 'Filter the strings'}
                    placeholder={kind === 'functions'
                        ? 'Filter by name or address'
                        : 'Filter by text or address'}
                    onkeydown={onFilterKeydown}
                />
                {#if filter}
                    <button
                        type="button"
                        class="clear"
                        {@attach tooltip('Clear the filter')}
                        aria-label="Clear the filter"
                        onclick={() => {
                            filter = ''
                            filterInput?.focus()
                        }}
                    >
                        <FaTimes />
                    </button>
                {/if}
            </div>
        </div>
        {#if !listingDocument || listingDocument.status === 'generating'}
            {@const progress = listingDocument?.progress}
            <div class="note" role="status">
                <p>
                    Generating the Listing{progress === undefined
                        ? '…'
                        : `: ${Math.round(progress * 100)}%`}
                </p>
                <progress max="1" value={progress} aria-label="Listing generated so far"></progress>
            </div>
        {:else if listingDocument.status === 'failed'}
            <p class="note">The Listing could not be generated: {listingDocument.error}</p>
        {:else if total === 0}
            <p class="note">
                {kind === 'functions' ? 'No functions found.' : 'No strings found.'}
            </p>
        {:else}
            <p class="count" role="status">
                {count === total ? `${total} ${noun}` : `${count} of ${total} ${noun}`}
            </p>
            {#if count === 0}
                <p class="note">Nothing matches “{filter.trim()}”.</p>
            {/if}
            <ul
                class="symbol-list"
                aria-label={kind === 'functions' ? 'Functions' : 'Strings'}
                bind:this={list}
                style:--address-width="{addressWidth}ch"
                style:--size-width="{sizeWidth}ch"
            >
                {#if kind === 'functions'}
                    {#each shownFunctions as fn (fn.address)}
                        <li class="function-item">
                            <button
                                type="button"
                                class="symbol-row function"
                                class:current={fn.address === current}
                                class:menu-open={menu !== null && menuFunction === fn.address}
                                title={functionTooltip(fn)}
                                onclick={() => reveal(fn.line)}
                                onkeydown={(event) => onRowKeydown(event, fn)}
                                oncontextmenu={(event) =>
                                    openMenu(event, fn, event.currentTarget as HTMLElement)}
                            >
                                <span class="symbol-name">{fn.display}</span>
                                <span class="symbol-address">{symbolAddress(fn.address)}</span>
                                <span class="symbol-size">{fn.size} B</span>
                            </button>
                            {#if !ui.viewport.canHover}
                                <!-- a touch screen has no right click: the row's menu is a button -->
                                <button
                                    type="button"
                                    class="row-menu"
                                    title={`Rename or comment on ${fn.display}`}
                                    aria-label={`Rename or comment on ${fn.display}`}
                                    tabindex="-1"
                                    onclick={(event) => {
                                        const row = event.currentTarget
                                            .previousElementSibling as HTMLElement
                                        openMenu(event, fn, row)
                                    }}
                                >
                                    <FaEllipsisH />
                                </button>
                            {/if}
                        </li>
                    {/each}
                {:else}
                    {#each shownStrings as string (string.address)}
                        <li>
                            <button
                                type="button"
                                class="symbol-row string"
                                class:current={string.address === current}
                                title={`"${string.escaped}" at ${symbolAddress(string.address)}`}
                                onclick={() => reveal(string.line)}
                                onkeydown={onRowKeydown}
                            >
                                <span class="symbol-name"
                                    >"{string.escaped.length > SHOWN_STRING
                                        ? `${string.escaped.slice(0, SHOWN_STRING)}…`
                                        : string.escaped}"</span
                                >
                                <span class="symbol-address">{symbolAddress(string.address)}</span>
                            </button>
                        </li>
                    {/each}
                {/if}
            </ul>
        {/if}
    {/if}
    {#if openPrompt}
        <AnnotationPromptView
            prompt={openPrompt}
            onsave={() => {
                if (openPrompt.save()) closePrompt()
            }}
            onclose={closePrompt}
            onrelease={() => promptRow?.focus()}
        />
    {/if}
    {#if menu}
        <ContextMenu
            x={menu.x}
            y={menu.y}
            items={menu.items}
            arrow
            label="Function actions"
            onClose={() => {
                menu = null
                menuFunction = undefined
            }}
        />
    {/if}
</section>

<style lang="scss">
    .symbols {
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;
        font-size: 0.78rem;
    }

    .note {
        margin: 0;
        padding: 0.8rem;
        font-size: 0.8rem;
        line-height: 1.4;
        color: var(--hint);

        p {
            margin: 0 0 0.5rem;
        }

        progress {
            width: 100%;
            accent-color: var(--accent);
        }
    }

    /* the File's name, in its own case, on the band the Explorer's root row is drawn on */
    .symbols-file {
        display: flex;
        flex: none;
        align-items: center;
        gap: 0.4rem;
        height: 1.8rem;
        padding: 0 0.5rem 0 0.8rem;
        font-size: 0.75rem;
        background: color-mix(in srgb, var(--tertiary) 42%, transparent);
        border-bottom: 1px solid
            var(--wb-line, color-mix(in srgb, var(--tertiary) 70%, transparent));
    }

    .ellipsis {
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    /* the Explorer's mark of an Entry file, in the accent colour of the Selected program's */
    .entry-mark {
        flex: none;
        margin-left: auto;
        padding: 0.02rem 0.3rem;
        color: var(--accent);
        background: color-mix(in srgb, var(--accent) 12%, transparent);
        border: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
        border-radius: 999px;
        font-size: 0.48rem;
        font-weight: 700;
        line-height: 0.72rem;
        letter-spacing: 0.04em;
    }

    .symbols-controls {
        display: flex;
        flex: none;
        flex-direction: column;
        gap: 0.4rem;
        padding: 0.5rem;
    }

    .filter {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        min-height: 2rem;
        padding: 0.25rem 0.3rem 0.25rem 0.6rem;
        border-radius: 0.5rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);

        &:focus-within {
            outline: 2px solid color-mix(in srgb, var(--accent) 60%, transparent);
        }

        input {
            flex: 1;
            min-width: 0;
            padding: 0;
            border: none;
            outline: none;
            background: transparent;
            color: inherit;
            font: inherit;

            &::-webkit-search-cancel-button {
                display: none;
            }
        }
    }

    .filter-icon {
        display: flex;
        flex: none;
        width: 0.75rem;
        height: 0.75rem;
        opacity: 0.7;
    }

    .clear {
        display: grid;
        place-items: center;
        flex: none;
        width: 1.4rem;
        height: 1.4rem;
        padding: 0.32rem;
        border: none;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;

        &:hover {
            opacity: 1;
            background-color: color-mix(in srgb, var(--tertiary-text) 12%, transparent);
        }
    }

    .count {
        flex: none;
        margin: 0;
        padding: 0 0.8rem 0.25rem;
        font-size: 0.7rem;
        opacity: 0.65;
    }

    .symbol-list {
        flex: 1;
        min-height: 0;
        margin: 0;
        padding: 0 0 0.3rem;
        overflow: auto;
        scrollbar-gutter: stable;
        list-style: none;

        li {
            /* a long list lays out and paints only the rows in view */
            content-visibility: auto;
            contain-intrinsic-size: auto 1.55rem;
        }
    }

    /* the Explorer's rows: the name, then the address and the size in columns of their own */
    .symbol-row {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        width: 100%;
        height: 1.55rem;
        padding: 0 0.6rem 0 0.8rem;
        border: 0;
        color: inherit;
        background: transparent;
        font-family: 'Fira Code', monospace;
        font-size: 0.72rem;
        text-align: left;
        cursor: pointer;

        &:hover,
        &:focus-visible {
            background: var(--tertiary);
        }

        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }

        &.current {
            background: color-mix(in srgb, var(--accent) 24%, var(--tertiary));
            box-shadow: inset 2px 0 0 var(--accent);
        }

        &.menu-open {
            outline: 1px solid var(--accent);
            outline-offset: -1px;
        }
    }

    .function-item {
        display: flex;
        align-items: center;

        .symbol-row {
            flex: 1;
            width: auto;
            min-width: 0;
        }
    }

    /* a touch screen's way to a row's menu, beside its size */
    .row-menu {
        display: grid;
        place-items: center;
        flex: none;
        width: 1.9rem;
        height: 1.55rem;
        padding: 0.4rem;
        border: none;
        background: transparent;
        color: inherit;
        opacity: 0.7;
        cursor: pointer;
    }

    .symbol-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .symbol-address,
    .symbol-size {
        flex: none;
        text-align: right;
        white-space: nowrap;
        opacity: 0.65;
    }

    .symbol-address {
        width: var(--address-width);
    }

    .symbol-size {
        width: var(--size-width);
    }
</style>
