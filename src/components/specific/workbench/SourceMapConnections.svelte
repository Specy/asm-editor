<script lang="ts">
    import type monaco from 'monaco-editor'
    import type { Snippet } from 'svelte'
    import { SOURCE_MAP_CONNECTION_OFFSCREEN_RATIO, SOURCE_MAP_CONNECTION_STYLE } from '$lib/Config'
    import type { ColoredLineRange } from '$lib/monaco/lineColoring'
    import type { SourceMapColoring } from '$lib/sourceCompilation/sourceColoring'
    import type { SourceLocation } from '$lib/sourceCompilation/records'

    interface Props {
        sourceEditor?: monaco.editor.IStandaloneCodeEditor
        assemblyEditor?: monaco.editor.IStandaloneCodeEditor
        sourceOnLeft?: boolean
        sourcePath: string
        coloring: SourceMapColoring
        activeLocation?: SourceLocation
        divider?: Snippet
    }

    let {
        sourceEditor,
        assemblyEditor,
        sourceOnLeft = true,
        sourcePath,
        coloring,
        activeLocation,
        divider
    }: Props = $props()
    let gutter = $state<HTMLDivElement>()
    let schedule = $state.raw<() => void>()

    const connections = $derived.by(() => {
        const sourceRanges = new Map(
            coloring.source.get(sourcePath)?.ranges.map((range) => [range.colorIndex, range])
        )
        return coloring.assembly.ranges.flatMap((assembly) => {
            const source = sourceRanges.get(assembly.colorIndex)
            return source
                ? [{ source, assembly, color: coloring.assembly.colors[assembly.colorIndex] }]
                : []
        })
    })
    const activeColor = $derived(
        activeLocation?.path === sourcePath
            ? coloring.source
                  .get(sourcePath)
                  ?.ranges.find((range) => range.startLine === activeLocation?.line)?.colorIndex
            : undefined
    )

    type Band = { top: number; bottom: number }
    type Ribbon = {
        key: number
        sourceLine: number
        colorIndex: number
        color: string
        path: string
    }
    type Bridge = Band & { key: number; colorIndex: number; color: string }
    type Geometry = {
        width: number
        height: number
        inset: number
        viewportTop: number
        viewportBottom: number
        ribbons: Ribbon[]
        bridges: Bridge[]
    }
    let geometry = $state.raw<Geometry>({
        width: 48,
        height: 0,
        inset: 0,
        viewportTop: 0,
        viewportBottom: 0,
        ribbons: [],
        bridges: []
    })
    const orderedRibbons = $derived(
        [...geometry.ribbons].sort(
            (a, b) => Number(a.colorIndex === activeColor) - Number(b.colorIndex === activeColor)
        )
    )

    function connectionBand(
        editor: monaco.editor.IStandaloneCodeEditor,
        range: ColoredLineRange,
        viewport: Band,
        scrollTop: number
    ): Band | undefined {
        let first = range.startLine + 1
        let last = range.endLine + 1
        const lineTop = (line: number) =>
            viewport.top + editor.getTopForLineNumber(line) - scrollTop
        const lineBottom = (line: number) =>
            viewport.top + editor.getBottomForLineNumber(line) - scrollTop
        const padding =
            (viewport.bottom - viewport.top) * Math.max(0, SOURCE_MAP_CONNECTION_OFFSCREEN_RATIO)
        const retainedTop = viewport.top - padding
        const retainedBottom = viewport.bottom + padding
        //Keep nearby offscreen sections connected. The SVG clips their ribbons at
        //the gutter edges, so scrolling moves them out of view naturally.
        if (lineBottom(last) <= retainedTop || lineTop(first) >= retainedBottom) return
        //Folded lines have zero height; their coordinates refer to a neighboring line.
        //Trim hidden endpoints so a completely folded section has no phantom ribbon.
        while (
            first <= last &&
            editor.getLineHeightForPosition({ lineNumber: first, column: 1 }) === 0
        ) {
            first++
        }
        while (
            last >= first &&
            editor.getLineHeightForPosition({ lineNumber: last, column: 1 }) === 0
        ) {
            last--
        }
        if (first > last) return
        const top = Math.max(retainedTop, lineTop(first))
        const bottom = Math.min(retainedBottom, lineBottom(last))
        return bottom > top ? { top, bottom } : undefined
    }

    function measure(
        root: HTMLDivElement,
        left: monaco.editor.IStandaloneCodeEditor,
        right: monaco.editor.IStandaloneCodeEditor
    ): Geometry {
        const box = root.getBoundingClientRect()
        const empty = {
            width: box.width,
            height: box.height,
            inset: 0,
            viewportTop: 0,
            viewportBottom: box.height,
            ribbons: [],
            bridges: []
        }
        if (!box.width || !box.height || !left.getModel() || !right.getModel()) return empty
        //Containers survive Build/Stop model swaps. Every position uses its editor's own viewport.
        const leftBox = left.getContainerDomNode().getBoundingClientRect()
        const rightBox = right.getContainerDomNode().getBoundingClientRect()
        const leftLayout = left.getLayoutInfo()
        const rightLayout = right.getLayoutInfo()
        const viewport = (bounds: DOMRect, layout: monaco.editor.EditorLayoutInfo): Band => ({
            top: bounds.top - box.top,
            bottom: bounds.top - box.top + layout.height
        })
        const leftViewport = viewport(leftBox, leftLayout)
        const rightViewport = viewport(rightBox, rightLayout)
        const leftScroll = left.getScrollTop()
        const rightScroll = right.getScrollTop()
        //Bridge the source scrollbar area so ribbons meet the existing line backgrounds.
        const inset = Math.max(
            0,
            box.left - (leftBox.left + leftLayout.contentLeft + leftLayout.contentWidth)
        )
        //Run a few pixels under the right editor, which paints above the gutter. The panes have
        //fractional widths, so ending exactly at its edge leaves an antialiased 1px seam.
        const overlap = 0
        const width = box.width + inset + overlap
        const middle = inset + box.width / 2
        //Let the SVG clip the far edge instead of antialiasing a path boundary at the join.
        const end = width + 1
        const ribbons: Ribbon[] = []
        const bridges: Bridge[] = []
        // eslint-disable-next-line svelte/prefer-svelte-reactivity -- Local deduplication during geometry calculation.
        const bridged = new Set<number>()
        for (const connection of connections) {
            const leftRange = sourceOnLeft ? connection.source : connection.assembly
            const rightRange = sourceOnLeft ? connection.assembly : connection.source
            const leftBand = connectionBand(left, leftRange, leftViewport, leftScroll)
            const rightBand = connectionBand(right, rightRange, rightViewport, rightScroll)
            if (!leftBand || !rightBand) continue
            const colorIndex = connection.assembly.colorIndex
            //One bridge per left-side range. With assembly on the left, one color can
            //own several disjoint ranges, so the color alone is not a unique key.
            const bridgeKey = leftRange.startLine
            if (!bridged.has(bridgeKey)) {
                bridged.add(bridgeKey)
                //The scrollbar bridge belongs only to visible source code, not its heading.
                const top = Math.max(leftBand.top, leftViewport.top)
                const bottom = Math.min(leftBand.bottom, leftViewport.bottom)
                if (bottom > top)
                    bridges.push({
                        key: bridgeKey,
                        top,
                        bottom,
                        colorIndex,
                        color: connection.color
                    })
            }
            ribbons.push({
                key: connection.assembly.startLine,
                sourceLine: connection.source.startLine,
                colorIndex,
                color: connection.color,
                path:
                    SOURCE_MAP_CONNECTION_STYLE === 'curved'
                        ? `M ${inset} ${leftBand.top} C ${middle} ${leftBand.top}, ${middle} ${rightBand.top}, ${end} ${rightBand.top} L ${end} ${rightBand.bottom} C ${middle} ${rightBand.bottom}, ${middle} ${leftBand.bottom}, ${inset} ${leftBand.bottom} Z`
                        : `M ${inset} ${leftBand.top} L ${end} ${rightBand.top} L ${end} ${rightBand.bottom} L ${inset} ${leftBand.bottom} Z`
            })
        }
        return {
            width,
            height: box.height,
            inset,
            viewportTop: Math.max(leftViewport.top, rightViewport.top),
            viewportBottom: Math.min(leftViewport.bottom, rightViewport.bottom),
            ribbons,
            bridges
        }
    }

    $effect(() => {
        const root = gutter
        const left = sourceOnLeft ? sourceEditor : assemblyEditor
        const right = sourceOnLeft ? assemblyEditor : sourceEditor
        if (!root || !left || !right) return
        let frame = 0
        const refresh = () => {
            if (frame) return
            frame = requestAnimationFrame(() => {
                frame = 0
                geometry = measure(root, left, right)
            })
        }
        const listeners = [left, right].flatMap((editor) => [
            editor.onDidScrollChange(refresh),
            editor.onDidLayoutChange(refresh),
            editor.onDidContentSizeChange(refresh),
            editor.onDidChangeConfiguration(refresh),
            editor.onDidChangeModel(refresh),
            editor.onDidChangeHiddenAreas(refresh),
            editor.onDidChangeViewZones(refresh)
        ])
        const observer = new ResizeObserver(refresh)
        observer.observe(root)
        observer.observe(left.getContainerDomNode())
        observer.observe(right.getContainerDomNode())
        schedule = refresh
        refresh()
        return () => {
            if (frame) cancelAnimationFrame(frame)
            observer.disconnect()
            listeners.forEach((listener) => listener.dispose())
            schedule = undefined
        }
    })

    $effect(() => {
        void connections
        schedule?.()
    })
</script>

<div class="connector-gutter" bind:this={gutter}>
    <svg
        aria-hidden="true"
        width={geometry.width}
        height={geometry.height}
        viewBox="0 0 {geometry.width} {geometry.height}"
        style:left="{-geometry.inset}px"
        style:clip-path="inset({geometry.viewportTop}px 0 {Math.max(
            0,
            geometry.height - geometry.viewportBottom
        )}px 0)"
    >
        {#each geometry.bridges as bridge (bridge.key)}
            <rect
                class="bridge"
                class:active={bridge.colorIndex === activeColor}
                class:dimmed={activeColor !== undefined && bridge.colorIndex !== activeColor}
                style:color={bridge.color}
                x="0"
                y={bridge.top}
                width={geometry.inset}
                height={bridge.bottom - bridge.top}
            />
        {/each}
        {#each orderedRibbons as ribbon (ribbon.key)}
            <path
                class="ribbon"
                class:active={ribbon.colorIndex === activeColor}
                class:dimmed={activeColor !== undefined && ribbon.colorIndex !== activeColor}
                style:color={ribbon.color}
                data-source-line={ribbon.sourceLine + 1}
                data-assembly-line={ribbon.key + 1}
                d={ribbon.path}
            />
        {/each}
    </svg>
    {#if divider}
        <div class="divider">
            {@render divider()}
        </div>
    {/if}
</div>

<style lang="scss">
    .connector-gutter {
        position: relative;
        flex: 0 0 48px;
        min-height: 0;
        background: var(--secondary);
        z-index: 1;
        pointer-events: none;
        //The part beside the file tabs continues the tab strip, not the editors.
        &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2.25rem;
            box-sizing: border-box;
            border-bottom: 1px solid var(--wb-line);
            background: var(--wb-strip);
        }
    }
    svg {
        position: absolute;
        top: 0;
        overflow: hidden;
    }
    .divider {
        position: absolute;
        //Starts below the band beside the file tabs.
        top: 2.25rem;
        bottom: 0;
        left: 0;
        display: flex;
        box-shadow: inset 1px 0 0 var(--wb-line);
        pointer-events: auto;
        z-index: 2;
    }
    .divider :global(.splitter::before) {
        left: 0;
    }
    .ribbon,
    .bridge {
        fill: currentColor;
        fill-opacity: 0.18;
        stroke: none;
        transition: fill-opacity 120ms ease;
        &.active {
            fill-opacity: 0.24;
        }
        &.dimmed {
            fill-opacity: 0.045;
        }
    }
    @media (max-width: 700px) {
        .connector-gutter {
            display: none;
        }
    }
    @media (prefers-reduced-motion: reduce) {
        .ribbon,
        .bridge {
            transition: none;
        }
    }
</style>
