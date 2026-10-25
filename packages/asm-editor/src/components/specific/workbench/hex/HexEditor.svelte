<script lang="ts" module>
    /**
     * Each content's bytes, decoded once: a rename or a comment makes a new File record over the
     * same content, and both panes may show it, so a 16 MiB File is not decoded again for each.
     * Keyed by the content string itself, per encoding, as the ELF analyses are: a key built from
     * it would copy megabytes at every lookup.
     */
    //a cache read while deriving the bytes, which nothing tracks: a module script's Map is no state
    const decoded = {
        plain: new Map<string, Uint8Array>(),
        base64: new Map<string, Uint8Array>()
    }
    //each holds a whole File and its content: the File shown, and the one it was a change ago
    const KEPT_DECODED = 2
</script>

<script lang="ts">
    import { onDestroy, onMount, tick, untrack } from 'svelte'
    import type { ProjectFileKind } from '#lib/fileKinds.ts'
    import { executableAnalysis } from '#lib/executables.ts'
    import { plannedLoadBase } from '#lib/listing/listingPaths.ts'
    import { memoryRegionColor } from '#lib/languages/memoryRegions.ts'
    import { fileBytes, overwriteText, type ProjectFile } from '#lib/projectFiles.ts'
    import ContextMenu, { type ContextMenuEntry } from '#cmp/shared/menu/ContextMenu.svelte'
    import { usesCommandKey } from '#stores/shortcutsStore.ts'
    import { workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
    import { toast } from '#stores/toastStore.ts'
    import FaCopy from '~icons/fa-solid/copy'
    import FaFont from '~icons/fa-solid/font'
    import FaSearch from '~icons/fa-solid/search'
    import FaMapMarkerAlt from '~icons/fa-solid/map-marker-alt'
    import FaListOl from '~icons/fa-solid/list-ol'
    import { INSPECTED_BYTES } from './dataInspector'
    import { elfRegions, regionAt, regionHover, regionSpans, type FileRegion } from './elfRegions'
    import DataInspector from './DataInspector.svelte'
    import HexFindBar, { type FindKind } from './HexFindBar.svelte'
    import HexStatus from './HexStatus.svelte'
    import {
        byteHex,
        byteText,
        bytesAsHex,
        bytesAsText,
        isPrintable,
        moveCaret,
        offsetDigits,
        offsetHex,
        revealRow,
        rowWindow,
        scrollGeometry,
        scrollTopOf,
        selectionRange,
        typeKey,
        virtualTopOf,
        type HexCaret,
        type HexColumn,
        type HexViewState
    } from './hexGrid'
    import {
        countMatches,
        countMatchesAsync,
        findNext,
        findPrevious,
        parseHexPattern,
        parseOffset,
        textPattern,
        type BytePattern
    } from './hexSearch'

    /**
     * The **Hex editor** ([file-views.md](../../../../../../../docs/design/file-views.md), decisions
     * 2, 3, 7, 8 and 9): a File's bytes as rows of hex beside their text, drawn for the rows in
     * sight only, over the File's whole length. A caret moved by the keys overwrites a digit at a
     * time in the hex column or a character in the text column; each run of typing is one **Edit
     * step** of the Workbench's Edit journal, which Undo and Redo take back and put back
     * ([ADR 0063](../../../../../../../docs/adr/0063-a-file-holds-its-current-bytes-and-undo-is-a-journal-beside-it.md)).
     * A File stored as text has its text changed, which must stay UTF-8.
     */
    interface Props {
        path: string
        file: ProjectFile
        /** An Executable's bytes are tinted by what they are, as memory is by its regions. */
        kind: ProjectFileKind
        /** Why the bytes cannot be typed over now, or undefined when they can. */
        readOnly?: string
        /** A notice above the bytes when the browser could not preview the File. */
        notice?: string
        /**
         * Overwrites bytes of the File at `path`, or of a File stored as text its text; false when
         * the edit was refused, which drops what was typed. The path is passed back because what
         * was typed is saved as the editor closes too, when the pane may already show another File.
         */
        onEdit?: (path: string, offset: number, bytes: Uint8Array) => boolean
        /**
         * Undo, or Redo, of the File's newest Edit step, shared by every pane: the offset the
         * change starts at, or undefined when there was none.
         */
        onUndoEdit?: (path: string, redo: boolean) => number | undefined
        /**
         * Hands the Workbench the editor's save of what was typed and not saved yet, which it calls
         * before a Build or a test run locks the Files; returns what takes it back.
         */
        registerFlush?: (flush: () => void) => () => void
        /** Bytes to bring into sight and select, as Show in Hex asks; `onRevealed` once done. */
        reveal?: { offset: number; length: number }
        onRevealed?: () => void
        /** Where the pane was in this File, to restore and keep up to date. */
        viewState?: HexViewState
        /** Whether the execution dock floats over the pane's bottom edge, which the bytes leave room for. */
        dockInset?: boolean
        /** Show in Listing, from a byte of an Executable's code. */
        onShowInListing?: (offset: number) => void
    }

    let {
        path,
        file,
        kind,
        readOnly,
        notice,
        onEdit,
        onUndoEdit,
        registerFlush,
        reveal,
        onRevealed,
        viewState,
        dockInset = false,
        onShowInListing
    }: Props = $props()

    const uid = Math.random().toString(36).slice(2, 10)
    //one editor shows one File for its whole life, and what it saves as it closes goes to that
    //File and its place, whatever the pane shows by then
    const ownPath = untrack(() => path)
    const ownViewState = untrack(() => viewState)
    let currentFile = untrack(() => file)
    $effect.pre(() => {
        currentFile = file
    })
    /** A row's height and a 16-byte row's width before they are measured, as under jsdom. */
    const FALLBACK_ROW_HEIGHT = 24
    /** Room for a vertical scrollbar beside the widest row. */
    const SCROLLBAR = 16
    /** How long typing waits before it is saved as one Edit step. */
    const TYPING_PAUSE = 600

    function bytesOf(file: ProjectFile): Uint8Array {
        const cache = decoded[file.encoding]
        const cached = cache.get(file.content)
        if (cached) return cached
        const bytes = fileBytes(file)
        cache.set(file.content, bytes)
        if (cache.size > KEPT_DECODED) cache.delete(cache.keys().next().value!)
        return bytes
    }

    const bytes = $derived(bytesOf(file))
    const size = $derived(bytes.length)
    const digits = $derived(offsetDigits(size))
    const editable = $derived(readOnly === undefined && !!onEdit)
    /**
     * An Executable's parts, laid flat for looking a byte up: from the ELF analysis the Listing
     * reads, at the addresses the Listing shows. A File only an x86 Project runs has none.
     */
    const spans = $derived.by(() => {
        if (kind !== 'executable') return undefined
        const analysis = executableAnalysis(file)
        return regionSpans(elfRegions(bytes, analysis, plannedLoadBase(analysis.pie)))
    })
    const regionOf = (offset: number): FileRegion | undefined =>
        spans && offset >= 0 && offset < size ? regionAt(spans, offset) : undefined

    /**
     * Bytes typed and not yet saved, by offset: shown at once, saved as one Edit step when the
     * typing pauses or the caret leaves the run. They are always one run, since typing only moves
     * the caret forwards and anything else saves them first.
     */
    let pending = $state.raw<ReadonlyMap<number, number>>(new Map())
    let flushTimer: ReturnType<typeof setTimeout> | undefined
    const byteAt = (offset: number) => pending.get(offset) ?? bytes[offset]

    let caret = $state<HexCaret>(ownViewState?.caret ?? { offset: 0, nibble: 0, column: 'hex' })
    /** Where a selection started; undefined while nothing is selected. */
    let anchor = $state<number | undefined>(ownViewState?.anchor)
    let topRow = $state(ownViewState?.topRow ?? 0)
    const selection = $derived(
        anchor === undefined ? undefined : selectionRange(anchor, caret.offset)
    )

    //measured from the page: the hex editor's width, the scroller's height, a full row's size
    let width = $state(0)
    let scrollerHeight = $state(0)
    let headerHeight = $state(0)
    let probeWidth = $state(0)
    let probeHeight = $state(0)
    let dockRoom = $state(0)
    let scroller = $state<HTMLDivElement>()
    let touchInput = $state<HTMLInputElement>()
    let focused = $state(false)

    let inspectorOpen = $derived(!workbenchLayout.isCollapsed('hex:inspector', false))
    let littleEndian = $state(true)
    const remPx = () =>
        typeof document === 'undefined'
            ? 16
            : parseFloat(getComputedStyle(document.documentElement).fontSize) || 16
    /** The data inspector beside the bytes when a 16-byte row and it both fit, else below them. */
    const inspectorSide = $derived(
        inspectorOpen && probeWidth > 0 && width >= probeWidth + SCROLLBAR + 17 * remPx()
    )
    /** 16 bytes a row where one fits, else 8, as on a phone (an open item the plan left to measure). */
    const bytesPerRow = $derived(
        inspectorSide || probeWidth === 0 || width === 0 || width >= probeWidth + SCROLLBAR ? 16 : 8
    )
    const rows = $derived(Math.ceil(size / bytesPerRow))
    const rowHeight = $derived(probeHeight || FALLBACK_ROW_HEIGHT)
    const geometry = $derived(
        scrollGeometry(rows, rowHeight, scrollerHeight - headerHeight - dockRoom)
    )
    const virtualTop = $derived(topRow * rowHeight)
    const drawn = $derived(rowWindow(virtualTop, geometry))
    const visibleRows = $derived(
        Array.from({ length: drawn.end - drawn.first }, (_, index) => drawn.first + index)
    )
    const columns = $derived(Array.from({ length: bytesPerRow }, (_, index) => index))
    const pageRows = $derived(Math.max(1, Math.floor(geometry.viewport / rowHeight) - 1))

    //the scroll position the bytes last set, which their own scroll event must not read back
    let expectedScrollTop = -1
    $effect(() => {
        const target = scrollTopOf(virtualTop, geometry)
        if (!scroller || Math.abs(scroller.scrollTop - target) < 1) return
        expectedScrollTop = target
        scroller.scrollTop = target
    })
    function onScroll() {
        if (!scroller) return
        hovered = undefined
        if (Math.abs(scroller.scrollTop - expectedScrollTop) < 1) return
        expectedScrollTop = -1
        topRow = virtualTopOf(scroller.scrollTop, geometry) / rowHeight
    }
    /**
     * A scaled scrollbar moves the rows faster than the wheel, so the wheel scrolls the rows by its
     * own distance instead, as it would without the scaling.
     */
    $effect(() => {
        const element = scroller
        if (!element) return
        const wheel = (event: WheelEvent) => {
            if (geometry.virtualHeight <= geometry.scrollHeight || event.ctrlKey) return
            if (Math.abs(event.deltaY) < Math.abs(event.deltaX)) return
            event.preventDefault()
            const unit =
                event.deltaMode === 1 ? rowHeight : event.deltaMode === 2 ? geometry.viewport : 1
            scrollToRow(topRow + (event.deltaY * unit) / rowHeight)
        }
        element.addEventListener('wheel', wheel, { passive: false })
        return () => element.removeEventListener('wheel', wheel)
    })

    function scrollToRow(row: number) {
        const last = Math.max(0, (geometry.virtualHeight - geometry.viewport) / rowHeight)
        topRow = Math.min(last, Math.max(0, row))
    }
    /** Brings the caret's row into sight, moving as little as needed, or centred. */
    let centreWhenMeasured = false
    function revealCaret(centre = false) {
        if (centre && geometry.viewport <= 0) centreWhenMeasured = true
        const row = Math.floor(caret.offset / bytesPerRow)
        scrollToRow(revealRow(row, virtualTop, geometry, centre) / rowHeight)
    }
    //a reveal asked for before the bytes had a height centres once they have one
    $effect(() => {
        if (geometry.viewport > 0 && centreWhenMeasured) {
            centreWhenMeasured = false
            untrack(() => revealCaret(true))
        }
    })
    //a row of another width puts the caret's row somewhere else
    let laidOutRow = untrack(() => bytesPerRow)
    $effect(() => {
        if (bytesPerRow === laidOutRow) return
        laidOutRow = bytesPerRow
        untrack(() => revealCaret(true))
    })

    //a File that shrank, as an upload over it can, keeps the caret and the selection inside it
    $effect(() => {
        const last = Math.max(0, size - 1)
        untrack(() => {
            if (caret.offset > last) caret = { ...caret, offset: last, nibble: 0 }
            if (anchor !== undefined && anchor > last) anchor = last
        })
    })
    $effect(() => {
        if (ownViewState) {
            ownViewState.caret = caret
            ownViewState.anchor = anchor
            ownViewState.topRow = topRow
        }
    })

    /** What was typed and not saved yet, as the one run of bytes it is. */
    function typedRun(): { start: number; run: Uint8Array } {
        const offsets = [...pending.keys()]
        const start = Math.min(...offsets)
        const run = new Uint8Array(Math.max(...offsets) + 1 - start)
        for (const [offset, byte] of pending) run[offset - start] = byte
        return { start, run }
    }
    /** Saves what was typed as one Edit step, which Undo takes back. */
    function flush() {
        clearTimeout(flushTimer)
        flushTimer = undefined
        if (!pending.size) return
        const { start, run } = typedRun()
        pending = new Map()
        onEdit?.(ownPath, start, run)
    }
    function scheduleFlush() {
        clearTimeout(flushTimer)
        flushTimer = setTimeout(() => {
            if (!pending.size) return
            //a character of a text File typed byte by byte in hex is not UTF-8 until its last
            //byte: a pause halfway waits for the rest, and the caret leaving saves it or says why not
            const { start, run } = typedRun()
            const text = currentFile.encoding === 'plain' ? currentFile.content : undefined
            if (text !== undefined && overwriteText(text, start, run) === undefined) return
            flush()
        }, TYPING_PAUSE)
    }
    onMount(() => {
        //a page closed or hidden right after typing still keeps it
        const hide = () => flush()
        addEventListener('pagehide', hide)
        //and so does a Build or a test run started before the typing paused, which the Workbench
        //saves it for first: Safari's Build button takes no focus, so the bytes keep the keyboard
        const unregister = registerFlush?.(flush)
        return () => {
            removeEventListener('pagehide', hide)
            unregister?.()
            flush()
        }
    })
    //what was typed goes once the bytes can no longer be typed over by a lock that did not save
    //it first, as a Build the coding agent starts through the Emulator does
    $effect(() => {
        if (!editable && untrack(() => pending.size)) untrack(() => (pending = new Map()))
    })

    function type(key: string): boolean {
        if (!editable || size === 0) return false
        const typed = typeKey(caret, byteAt(caret.offset), key, size)
        if (!typed) return false
        //a new map each time, as the state is raw: what the grid draws changes with it
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Replaced, never mutated once stored.
        pending = new Map(pending).set(caret.offset, typed.byte)
        anchor = undefined
        caret = typed.caret
        revealCaret()
        scheduleFlush()
        return true
    }

    function undo(redo = false) {
        if (!editable) return
        flush()
        const offset = onUndoEdit?.(ownPath, redo)
        if (offset === undefined) return
        anchor = undefined
        caret = { offset: Math.min(offset, Math.max(0, size - 1)), nibble: 0, column: caret.column }
        revealCaret()
    }

    /** The bytes a copy takes: the selection's, or the caret's byte. */
    function copiedBytes(): Uint8Array {
        const range = selection ?? { start: caret.offset, end: Math.min(size, caret.offset + 1) }
        const copied = bytes.slice(range.start, range.end)
        for (const [offset, byte] of pending)
            if (offset >= range.start && offset < range.end) copied[offset - range.start] = byte
        return copied
    }
    function copy(column: HexColumn) {
        if (!size) return
        const copied = copiedBytes()
        const text = column === 'hex' ? bytesAsHex(copied) : bytesAsText(copied)
        const clipboard = typeof navigator === 'undefined' ? undefined : navigator.clipboard
        if (!clipboard) {
            toast.error("Copying isn't available in this browser.")
            return
        }
        clipboard.writeText(text).then(
            () => {},
            () => toast.error("Couldn't copy to the clipboard.")
        )
    }

    function moveTo(offset: number, column: HexColumn = caret.column, extend = false) {
        flush()
        if (extend) anchor ??= caret.offset
        else anchor = undefined
        caret = { offset, nibble: 0, column }
    }

    function onKeydown(event: KeyboardEvent) {
        //the Workbench's own keys, Shift+B for Build among them, are hex digits and selections
        //here, as they are text in Monaco
        event.stopPropagation()
        if (event.isComposing) return
        const mod = usesCommandKey() ? event.metaKey : event.ctrlKey
        const consume = () => event.preventDefault()
        if (mod && !event.altKey) {
            switch (event.key.toLowerCase()) {
                case 'z':
                    consume()
                    undo(event.shiftKey)
                    return
                case 'y':
                    consume()
                    undo(true)
                    return
                case 'c':
                    consume()
                    copy(caret.column)
                    return
                case 'a':
                    consume()
                    if (!size) return
                    flush()
                    anchor = 0
                    caret = { offset: size - 1, nibble: 0, column: caret.column }
                    return
                case 'f':
                    consume()
                    openBar('find')
                    return
                case 'g':
                    consume()
                    openBar('goto')
                    return
            }
        }
        if (event.key === 'Tab' && !mod && !event.altKey) {
            //Tab goes from the hex column to the text column and Shift+Tab back; from the far one
            //the key leaves the bytes, so the keyboard is never trapped in them
            const column: HexColumn | undefined =
                !event.shiftKey && caret.column === 'hex'
                    ? 'text'
                    : event.shiftKey && caret.column === 'text'
                      ? 'hex'
                      : undefined
            if (column) {
                consume()
                flush()
                caret = { ...caret, nibble: 0, column }
            }
            return
        }
        if (event.key === 'Escape') {
            if (anchor !== undefined) {
                consume()
                anchor = undefined
            }
            return
        }
        if (!size) return
        const moved = moveCaret(caret, event.key, { size, bytesPerRow, pageRows }, mod)
        if (moved) {
            consume()
            flush()
            if (event.shiftKey) anchor ??= caret.offset
            else anchor = undefined
            caret = moved
            revealCaret()
            return
        }
        if (!mod && !event.altKey && type(event.key)) consume()
    }

    /** What a phone's keyboard typed into the input under the caret, which keydown cannot tell. */
    function onTouchInput(event: Event) {
        const input = event.currentTarget as HTMLInputElement
        const text = input.value
        input.value = ''
        for (const character of text) type(character)
    }

    //pointer selection: a press places the caret, a drag or Shift extends the selection from it
    let dragging = false
    let touchStart: { x: number; y: number; offset: number; column: HexColumn } | undefined
    function cellAt(target: EventTarget | null): { offset: number; column: HexColumn } | undefined {
        const cell = (target as HTMLElement | null)?.closest?.<HTMLElement>('[data-offset]')
        if (!cell) return undefined
        return { offset: Number(cell.dataset.offset), column: cell.dataset.column as HexColumn }
    }
    function focusBytes() {
        scroller?.focus({ preventScroll: true })
    }
    function onPointerDown(event: PointerEvent) {
        hovered = undefined
        const cell = cellAt(event.target)
        if (event.pointerType === 'touch') {
            //a touch may be the start of a scroll: the caret moves when it ends without one
            touchStart = cell && { x: event.clientX, y: event.clientY, ...cell }
            return
        }
        if (event.button !== 0 || !cell) return
        event.preventDefault()
        focusBytes()
        moveTo(cell.offset, cell.column, event.shiftKey)
        dragging = true
        scroller?.setPointerCapture?.(event.pointerId)
    }
    function onPointerMove(event: PointerEvent) {
        if (!dragging) {
            if (event.pointerType !== 'touch' && !contextMenu) hover(event)
            return
        }
        const cell = cellAt(document.elementFromPoint?.(event.clientX, event.clientY) ?? null)
        if (!cell || cell.offset === caret.offset) return
        anchor ??= caret.offset
        caret = { offset: cell.offset, nibble: 0, column: caret.column }
    }
    function onPointerUp(event: PointerEvent) {
        dragging = false
        const start = touchStart
        touchStart = undefined
        if (event.pointerType !== 'touch' || !start) return
        if (Math.hypot(event.clientX - start.x, event.clientY - start.y) > 10) return
        moveTo(start.offset, start.column)
        //the input under the caret brings up the phone's keyboard, where the bytes can be typed over
        if (editable) touchInput?.focus({ preventScroll: true })
        else focusBytes()
    }

    //the byte under the pointer, for its hover card: gone while a press drags a selection or the
    //context menu is open, and when Find opens or a key is pressed, so it never stays over the
    //bytes being worked on; the pointer moving on brings it back
    let hovered = $state<{ offset: number; left: number; top: number } | undefined>()
    let root = $state<HTMLDivElement>()
    let area = $state<HTMLDivElement>()
    function hover(event: PointerEvent) {
        const cell = (event.target as HTMLElement | null)?.closest?.<HTMLElement>('[data-offset]')
        if (!cell || !area) {
            hovered = undefined
            return
        }
        const offset = Number(cell.dataset.offset)
        const box = cell.getBoundingClientRect()
        // The card is positioned inside the byte panel, below the status and any notice.
        const frame = area.getBoundingClientRect()
        const left = box.left - frame.left
        const top = box.bottom - frame.top + 2
        if (hovered?.offset === offset && hovered.left === left && hovered.top === top) return
        hovered = { offset, left, top }
    }
    /** What a byte's hover card says: the region it is in, or nothing outside every region. */
    function hoverText(offset: number): string | undefined {
        const region = regionOf(offset)
        return region && regionHover(region)
    }

    /**
     * A byte's tint: its region's colour, and a line on each side where the region ends, as the
     * memory view outlines its regions, so a run of one region reads as one block.
     */
    function tint(offset: number, column: number): string | undefined {
        const region = regionOf(offset)
        if (!region) return undefined
        const edges = [
            regionOf(offset - bytesPerRow) !== region,
            column === bytesPerRow - 1 || regionOf(offset + 1) !== region,
            regionOf(offset + bytesPerRow) !== region,
            column === 0 || regionOf(offset - 1) !== region
        ].map((edge) => (edge ? '1px' : '0'))
        return `--region-color: ${memoryRegionColor(region.kind)}; --region-edges: ${edges.join(' ')}; --bridge-edges: ${edges[0]} 0 ${edges[2]} 0;`
    }
    /** Whether a region runs on across the gap between a row's two halves, which it then fills. */
    const bridged = (offset: number, column: number) =>
        bytesPerRow === 16 &&
        column === 8 &&
        !!regionOf(offset) &&
        regionOf(offset - 1) === regionOf(offset)
    /** Whether Show in Listing can start from a byte: one of an Executable's code. */
    const showsInListing = (offset: number) =>
        !!onShowInListing && regionOf(offset)?.kind === 'code'

    //the context menu, at the pointer, or at the caret when the keyboard opened it
    let contextMenu = $state<{ x: number; y: number } | null>(null)
    function onContextMenu(event: MouseEvent) {
        event.preventDefault()
        hovered = undefined
        const cell = cellAt(event.target)
        if (cell && !(selection && cell.offset >= selection.start && cell.offset < selection.end))
            moveTo(cell.offset, cell.column)
        let { clientX: x, clientY: y } = event
        if (!cell) {
            const box = document
                .getElementById(cellId(caret.column, caret.offset))
                ?.getBoundingClientRect()
            if (box) [x, y] = [box.left, box.bottom]
        }
        contextMenu = { x, y }
    }
    const menuItems = $derived.by((): ContextMenuEntry[] => [
        { label: 'Copy as hex', icon: FaCopy, disabled: !size, onSelect: () => copy('hex') },
        { label: 'Copy as text', icon: FaFont, disabled: !size, onSelect: () => copy('text') },
        { separator: true },
        ...(onShowInListing
            ? [
                  {
                      label: 'Show in Listing',
                      icon: FaListOl,
                      disabled: !showsInListing(caret.offset),
                      onSelect: () => {
                          flush()
                          onShowInListing(caret.offset)
                      }
                  },
                  { separator: true } as const
              ]
            : []),
        { label: 'Go to offset…', icon: FaMapMarkerAlt, onSelect: () => openBar('goto') },
        { label: 'Find…', icon: FaSearch, onSelect: () => openBar('find') }
    ])

    //Find and Go to offset, which keep what was typed into them while the editor is open
    let bar = $state<'find' | 'goto' | undefined>()
    let findBar = $state<HexFindBar>()
    let findQuery = $state('')
    let findKind = $state<FindKind>('hex')
    let gotoQuery = $state('')
    let barMessage = $state<{ text: string; failed: boolean } | undefined>()
    let findResult = $state.raw<{
        bytes: Uint8Array
        query: string
        kind: FindKind
        offset: number
        length: number
        index: number
        total?: number
        /** Navigation since counting began, folded into its starting rank once ready. */
        delta: number
    }>()
    let countController: AbortController | undefined
    onDestroy(() => countController?.abort())
    // A query, byte edit, or manually moved selection invalidates the displayed result. Counting
    // happens on submission only; navigation through the same results reuses the count and rank.
    const currentFindResult = $derived(
        findResult &&
            findResult.bytes === bytes &&
            findResult.query === findQuery &&
            findResult.kind === findKind &&
            !pending.size &&
            selection?.start === findResult.offset &&
            selection.end === findResult.offset + findResult.length
            ? findResult
            : undefined
    )
    const findMessage = $derived(
        currentFindResult ? `Offset 0x${offsetHex(currentFindResult.offset, digits)}` : undefined
    )
    const findCount = $derived(
        currentFindResult?.total === undefined
            ? undefined
            : `${currentFindResult.index} of ${currentFindResult.total}`
    )
    function clearFindResult() {
        countController?.abort()
        findResult = undefined
    }
    $effect(() => {
        if (findResult && !currentFindResult) clearFindResult()
    })
    function openBar(mode: 'find' | 'goto') {
        flush()
        hovered = undefined
        //a short selection is what to look for, as Monaco's Find starts from the selected text
        if (mode === 'find' && selection && selection.end - selection.start <= 64) {
            const selected = copiedBytes()
            if (findKind === 'text' && selected.every(isPrintable))
                findQuery = bytesAsText(selected)
            else {
                findKind = 'hex'
                findQuery = bytesAsHex(selected)
            }
        }
        barMessage = undefined
        clearFindResult()
        if (bar === mode) findBar?.focus()
        bar = mode
    }
    function closeBar() {
        bar = undefined
        barMessage = undefined
        clearFindResult()
        focusBytes()
    }
    function submitBar(backwards: boolean) {
        flush()
        if (bar === 'goto') {
            const parsed = parseOffset(gotoQuery, size)
            if (!parsed.ok) {
                barMessage = { text: parsed.reason, failed: true }
                return
            }
            moveTo(parsed.offset)
            revealCaret(true)
            closeBar()
            return
        }
        const parsed = findKind === 'hex' ? parseHexPattern(findQuery) : textPattern(findQuery)
        if (!parsed.ok) {
            barMessage = { text: parsed.reason, failed: true }
            return
        }
        const previous = currentFindResult
        const from = selection ? selection.start : caret.offset
        const match = backwards
            ? findPrevious(bytes, parsed.pattern, from - 1)
            : findNext(bytes, parsed.pattern, selection ? from + 1 : from)
        if (!match) {
            barMessage = { text: 'No results', failed: true }
            return
        }
        const counts =
            previous?.total !== undefined
                ? {
                      total: previous.total,
                      index: backwards
                          ? previous.index === 1
                              ? previous.total
                              : previous.index - 1
                          : previous.index === previous.total
                            ? 1
                            : previous.index + 1
                  }
                : { index: 0 }
        const end = match.offset + parsed.pattern.length - 1
        anchor = end
        caret = { offset: match.offset, nibble: 0, column: findKind }
        revealCaret(true)
        barMessage = undefined
        findResult = {
            bytes,
            query: findQuery,
            kind: findKind,
            offset: match.offset,
            length: parsed.pattern.length,
            delta:
                previous && previous.total === undefined
                    ? previous.delta + (backwards ? -1 : 1)
                    : 0,
            ...counts
        }
        if (!previous) countFindMatches(parsed.pattern, match.offset)
    }
    function countFindMatches(pattern: BytePattern, offset: number) {
        countController?.abort()
        const controller = new AbortController()
        countController = controller
        const finishCount = (counts: { index: number; total: number } | undefined) => {
            const current = currentFindResult
            if (!counts || !current || controller.signal.aborted) return
            const position = counts.index - 1 + current.delta
            const index = (((position % counts.total) + counts.total) % counts.total) + 1
            findResult = { ...current, ...counts, index, delta: 0 }
        }
        if (bytes.length <= 256 * 1024) finishCount(countMatches(bytes, pattern, offset))
        else void countMatchesAsync(bytes, pattern, offset, controller.signal).then(finishCount)
    }

    //Show in Hex: the bytes asked for, selected and in sight, with the keyboard on them
    $effect(() => {
        const request = reveal
        if (!request) return
        untrack(() => {
            if (size) {
                flush()
                const offset = Math.min(request.offset, size - 1)
                const end = Math.min(size, offset + Math.max(1, request.length)) - 1
                caret = { offset, nibble: 0, column: 'hex' }
                anchor = end > offset ? end : undefined
                revealCaret(true)
                void tick().then(focusBytes)
            }
            onRevealed?.()
        })
    })

    const cellId = (column: HexColumn, offset: number) => `hex-${uid}-${column}-${offset}`
    const inSelection = (offset: number) =>
        !!selection && offset >= selection.start && offset < selection.end
    const inspected = $derived.by(() => {
        const end = Math.min(size, caret.offset + INSPECTED_BYTES)
        const slice = bytes.slice(Math.min(caret.offset, size), end)
        for (const [offset, byte] of pending)
            if (offset >= caret.offset && offset < end) slice[offset - caret.offset] = byte
        return slice
    })
    const caretTop = $derived(
        headerHeight + Math.floor(caret.offset / bytesPerRow) * rowHeight - virtualTop
    )
</script>

<svelte:window onkeydowncapture={() => (hovered = undefined)} />

{#snippet hexCell(offset: number, column: number)}
    {@const byte = byteAt(offset)}
    {@const text = byteHex(byte)}
    {@const atCaret = caret.offset === offset}
    <span
        class="hex-cell"
        class:group-start={bytesPerRow === 16 && column === 8}
        class:zero={byte === 0}
        class:selected={inSelection(offset)}
        class:caret={atCaret && caret.column === 'hex'}
        class:twin={atCaret && caret.column === 'text'}
        class:tinted={!!spans && !!regionOf(offset)}
        class:bridged={!!spans && bridged(offset, column)}
        style={spans ? tint(offset, column) : undefined}
        role="gridcell"
        id={cellId('hex', offset)}
        aria-selected={inSelection(offset)}
        data-offset={offset}
        data-column="hex"
        >{#if atCaret && caret.column === 'hex'}<span class:nibble={caret.nibble === 0}
                >{text[0]}</span
            ><span class:nibble={caret.nibble === 1}>{text[1]}</span>{:else}{text}{/if}</span
    >
{/snippet}

{#snippet textCell(offset: number, column: number)}
    {@const byte = byteAt(offset)}
    {@const atCaret = caret.offset === offset}
    <span
        class="text-cell"
        class:unprintable={!isPrintable(byte)}
        class:selected={inSelection(offset)}
        class:caret={atCaret && caret.column === 'text'}
        class:twin={atCaret && caret.column === 'hex'}
        class:tinted={!!spans && !!regionOf(offset)}
        style={spans ? tint(offset, column) : undefined}
        role="gridcell"
        id={cellId('text', offset)}
        aria-selected={inSelection(offset)}
        data-offset={offset}
        data-column="text">{byteText(byte)}</span
    >
{/snippet}

<div
    class="hex-editor"
    style:--offset-digits={digits}
    class:focused
    class:dock-inset={dockInset}
    bind:this={root}
    bind:clientWidth={width}
    onfocusin={() => (focused = !!scroller?.contains(document.activeElement))}
    onfocusout={(event) => {
        if (!scroller?.contains(event.relatedTarget as Node | null)) {
            focused = false
            flush()
        }
    }}
>
    {#if notice}
        <div class="hex-notice" role="note">{notice}</div>
    {/if}
    <HexStatus
        offset={size ? caret.offset : undefined}
        selection={selection ? selection.end - selection.start : 0}
        {size}
        {digits}
        {readOnly}
        region={regionOf(caret.offset)?.name}
        {inspectorOpen}
        onFind={() => openBar('find')}
        onGoTo={() => openBar('goto')}
        onToggleInspector={() => workbenchLayout.setCollapsed('hex:inspector', inspectorOpen)}
    />
    <div class="hex-body" class:side={inspectorSide}>
        <div class="hex-area" bind:this={area}>
            {#if bar}
                <HexFindBar
                    bind:this={findBar}
                    mode={bar}
                    bind:query={
                        () => (bar === 'find' ? findQuery : gotoQuery),
                        (value) => {
                            if (bar === 'find') findQuery = value
                            else gotoQuery = value
                            barMessage = undefined
                            clearFindResult()
                        }
                    }
                    bind:kind={
                        () => findKind,
                        (value) => {
                            findKind = value
                            barMessage = undefined
                            clearFindResult()
                        }
                    }
                    message={barMessage?.text ?? (bar === 'find' ? findMessage : undefined)}
                    matchCount={bar === 'find' && !barMessage ? findCount : undefined}
                    failed={barMessage?.failed}
                    onSubmit={submitBar}
                    onClose={closeBar}
                />
            {/if}
            <div
                class="hex-scroller"
                bind:this={scroller}
                bind:clientHeight={scrollerHeight}
                tabindex="0"
                role="grid"
                aria-label="Bytes of {path}"
                aria-readonly={!editable}
                aria-multiselectable="true"
                aria-rowcount={rows + 1}
                aria-colcount={bytesPerRow * 2 + 1}
                aria-activedescendant={size ? cellId(caret.column, caret.offset) : undefined}
                onscroll={onScroll}
                onkeydown={onKeydown}
                onpointerdown={onPointerDown}
                onpointermove={onPointerMove}
                onpointerup={onPointerUp}
                onpointercancel={() => {
                    dragging = false
                    touchStart = undefined
                }}
                onpointerleave={() => (hovered = undefined)}
                oncontextmenu={onContextMenu}
            >
                <div
                    class="hex-sizer"
                    style:height="{Math.max(
                        scrollerHeight,
                        headerHeight + geometry.scrollHeight + dockRoom
                    )}px"
                >
                    <div class="hex-window" style:height="{scrollerHeight}px">
                        <div
                            class="hex-row hex-header"
                            role="row"
                            aria-rowindex={1}
                            bind:offsetHeight={headerHeight}
                        >
                            <span class="hex-offset" role="columnheader"
                                ><span class="label">Offset</span></span
                            >
                            <span class="hex-bytes" role="none">
                                {#each columns as column (column)}
                                    <span
                                        class="hex-cell"
                                        class:group-start={bytesPerRow === 16 && column === 8}
                                        role="columnheader">{byteHex(column)}</span
                                    >
                                {/each}
                            </span>
                            <span class="hex-text" role="none">
                                {#each columns as column (column)}
                                    <span class="text-cell" role="columnheader"
                                        >{column.toString(16).toUpperCase()}</span
                                    >
                                {/each}
                            </span>
                        </div>
                        {#each visibleRows as row (row)}
                            {@const start = row * bytesPerRow}
                            <div
                                class="hex-row"
                                role="row"
                                aria-rowindex={row + 2}
                                style:top="{headerHeight + row * rowHeight - virtualTop}px"
                            >
                                <span class="hex-offset" role="rowheader"
                                    >{offsetHex(start, digits)}</span
                                >
                                <span class="hex-bytes" role="none">
                                    {#each columns as column (column)}
                                        {#if start + column < size}
                                            {@render hexCell(start + column, column)}
                                        {:else}
                                            <span
                                                class="hex-cell"
                                                class:group-start={bytesPerRow === 16 &&
                                                    column === 8}
                                                role="none"
                                            ></span>
                                        {/if}
                                    {/each}
                                </span>
                                <span class="hex-text" role="none">
                                    {#each columns as column (column)}
                                        {#if start + column < size}
                                            {@render textCell(start + column, column)}
                                        {/if}
                                    {/each}
                                </span>
                            </div>
                        {/each}
                        {#if !size}
                            <p class="hex-empty" style:top="{headerHeight}px">The File is empty.</p>
                        {/if}
                        <input
                            class="hex-touch-input"
                            bind:this={touchInput}
                            style:top="{caretTop}px"
                            tabindex="-1"
                            aria-hidden="true"
                            inputmode={editable ? 'text' : 'none'}
                            autocomplete="off"
                            autocapitalize="off"
                            spellcheck="false"
                            oninput={onTouchInput}
                        />
                    </div>
                </div>
            </div>
            {#if hovered}
                {@const text = hoverText(hovered.offset)}
                {#if text}
                    <div
                        class="hex-hover"
                        role="tooltip"
                        style:left="{hovered.left}px"
                        style:top="{hovered.top}px"
                    >
                        {text}
                    </div>
                {/if}
            {/if}
        </div>
        {#if inspectorOpen}
            <DataInspector bytes={inspected} bind:littleEndian side={inspectorSide} />
        {/if}
    </div>
    <!-- the measures the layout is worked out from: a whole 16-byte row, and the dock's room -->
    <div class="hex-probe" aria-hidden="true">
        <div class="hex-row" bind:offsetWidth={probeWidth} bind:offsetHeight={probeHeight}>
            <span class="hex-offset">{offsetHex(0, digits)}</span>
            <span class="hex-bytes">
                {#each Array.from({ length: 16 }, (_, index) => index) as column (column)}
                    <span class="hex-cell" class:group-start={column === 8}>00</span>
                {/each}
            </span>
            <span class="hex-text">
                {#each Array.from({ length: 16 }, (_, index) => index) as column (column)}
                    <span class="text-cell">.</span>
                {/each}
            </span>
        </div>
        <div class="dock-room" bind:offsetHeight={dockRoom}></div>
    </div>
    {#if contextMenu}
        <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={menuItems}
            label="Bytes"
            onClose={() => (contextMenu = null)}
        />
    {/if}
</div>

<style lang="scss">
    .hex-editor {
        --cell-pad-x: 0.25rem;
        --hex-line: var(--wb-line, color-mix(in srgb, var(--tertiary) 60%, transparent));
        --hex-gutter: color-mix(in srgb, var(--tertiary) 45%, var(--secondary));
        /* the execution dock's tray and the gap under it, which the bytes scroll clear of */
        --dock-room: 0px;
        position: relative;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
        background: var(--secondary);
        color: var(--secondary-text);
    }
    .dock-inset {
        --dock-room: calc(var(--wb-control-height, 2.6rem) + 0.75rem);
    }
    .hex-notice {
        padding: 0.45rem 0.75rem;
        border-bottom: 1px solid var(--hex-line);
        background: color-mix(in srgb, var(--accent2, var(--accent)) 10%, var(--secondary));
        font-size: 0.8rem;
        overflow-wrap: anywhere;
    }
    .hex-body {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-height: 0;

        &.side {
            flex-direction: row;
        }
        /* below the bytes, the inspector takes no more than a part of a short pane, scrolling
           within it, and keeps out from under the dock */
        &:not(.side) > :global(.data-inspector) {
            max-height: 40%;
            overflow: auto;
            padding-bottom: calc(0.5rem + var(--dock-room));
        }
        &.side > :global(.data-inspector) {
            padding-bottom: calc(0.5rem + var(--dock-room));
        }
    }
    .hex-area {
        position: relative;
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 6rem;
    }
    .hex-scroller {
        flex: 1;
        min-width: 0;
        overflow: auto;
        overscroll-behavior: contain;
        font-family: monospace;
        font-size: 0.875rem;
        user-select: none;
    }
    /* the keyboard reached the bytes: a ring round them, over the header and the offsets */
    .hex-area:has(.hex-scroller:focus-visible)::after {
        content: '';
        position: absolute;
        inset: 0;
        z-index: 3;
        box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 70%, transparent);
        pointer-events: none;
    }
    .hex-sizer {
        position: relative;
        width: max-content;
        min-width: 100%;
    }
    /* the rows in sight, held at the top of the scroller while its content scrolls under them;
       clipped without being a scroll container, so the offsets stay put in a sideways scroll */
    .hex-window {
        position: sticky;
        top: 0;
        overflow: clip;
    }
    .hex-row {
        position: absolute;
        left: 0;
        display: flex;
        width: max-content;
        min-width: 100%;
        white-space: pre;
    }
    .hex-header {
        position: sticky;
        top: 0;
        z-index: 2;
        border-bottom: 1px solid var(--hex-line);
        background: var(--hex-gutter);
        color: color-mix(in srgb, var(--secondary-text) 60%, transparent);
    }
    /* as wide as the largest offset's digits in every row, the header's included */
    .hex-offset {
        position: sticky;
        left: 0;
        z-index: 1;
        flex-shrink: 0;
        width: calc(var(--offset-digits) * 1ch + 1rem);
        padding: 0.25rem 0.5rem;
        background: var(--hex-gutter);
        color: color-mix(in srgb, var(--secondary-text) 60%, transparent);
    }
    .hex-header .hex-offset {
        display: flex;
        align-items: center;

        .label {
            font-family: Rubik, sans-serif;
            font-size: 0.75rem;
        }
    }
    .hex-bytes {
        display: flex;
        padding: 0 0.4rem 0 0.3rem;
    }
    .hex-text {
        display: flex;
        padding: 0 0.5rem;
        border-left: 1px solid var(--hex-line);
    }
    .hex-cell,
    .text-cell {
        position: relative;
        display: inline-block;
        padding: 0.25rem 0;
        text-align: center;
        border-radius: 0.15rem;
    }
    .hex-cell {
        width: calc(2ch + 2 * var(--cell-pad-x));
    }
    .text-cell {
        width: calc(1ch + 0.1rem);
    }
    .group-start {
        margin-left: 0.5rem;
    }
    .hex-header .hex-cell,
    .hex-header .text-cell {
        opacity: 0.8;
    }
    .hex-row:not(.hex-header) {
        .hex-cell[data-offset]:hover,
        .text-cell:hover {
            background: color-mix(in srgb, var(--secondary-text) 12%, transparent);
        }
    }
    /* a region's bytes: tinted with its colour, square so the tint runs on unbroken, and
       outlined where it ends */
    .tinted {
        border-radius: 0;
        background: color-mix(in srgb, var(--region-color) 14%, transparent);

        &::after {
            content: '';
            position: absolute;
            inset: 0;
            border-style: solid;
            border-color: var(--region-color);
            border-width: var(--region-edges);
            pointer-events: none;
        }
    }
    .bridged::before {
        content: '';
        position: absolute;
        top: 0;
        bottom: 0;
        right: 100%;
        width: 0.5rem;
        border-style: solid;
        border-color: var(--region-color);
        border-width: var(--bridge-edges);
        background: color-mix(in srgb, var(--region-color) 14%, transparent);
        pointer-events: none;
    }
    .zero,
    .unprintable {
        color: color-mix(in srgb, var(--secondary-text) 45%, transparent);
    }
    .selected,
    .hex-row:not(.hex-header) .selected:hover {
        background: var(--green);
        color: var(--green-text);
    }
    /* the caret: a frame round its byte, its digit filled, solid while the bytes have the keyboard */
    .caret {
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--secondary-text) 55%, transparent);
    }
    .twin {
        box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--secondary-text) 30%, transparent);
    }
    .focused {
        .caret {
            box-shadow: inset 0 0 0 2px var(--accent);
        }
        .twin {
            box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent) 60%, transparent);
        }
        .caret .nibble {
            background: var(--accent);
            color: var(--accent-text);
            border-radius: 0.1rem;
        }
    }
    .caret .nibble {
        text-decoration: underline;
    }
    .focused .caret .nibble {
        text-decoration: none;
    }
    .hex-empty {
        position: absolute;
        left: 0.6rem;
        padding: 0.5rem 0;
        font-family: Rubik, sans-serif;
        font-size: 0.85rem;
        opacity: 0.7;
    }
    /* what a phone's keyboard types into, under the caret so the page does not jump to it */
    .hex-touch-input {
        position: absolute;
        left: 0;
        width: 1px;
        height: 1px;
        padding: 0;
        border: 0;
        opacity: 0;
        font-size: 16px;
        pointer-events: none;
    }
    .hex-hover {
        position: absolute;
        z-index: 5;
        max-width: min(24rem, 90%);
        padding: 0.2rem 0.4rem;
        border: 1px solid color-mix(in srgb, var(--tertiary-text) 28%, var(--tertiary));
        border-radius: 0.2rem;
        background: var(--tertiary);
        color: var(--tertiary-text);
        box-shadow: rgba(0, 0, 0, 0.4) 0px 2px 2px;
        font-family: monospace;
        font-size: 0.8rem;
        overflow-wrap: anywhere;
        pointer-events: none;
    }
    .hex-probe {
        position: absolute;
        visibility: hidden;
        pointer-events: none;
        font-family: monospace;
        font-size: 0.875rem;
        white-space: pre;

        .hex-row {
            position: static;
            width: max-content;
            min-width: 0;
        }
        .dock-room {
            height: var(--dock-room);
        }
    }
</style>
