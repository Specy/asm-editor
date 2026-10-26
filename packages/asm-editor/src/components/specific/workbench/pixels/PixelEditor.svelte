<script lang="ts">
    import { onDestroy, tick, untrack } from 'svelte'
    import { fileBytes, type ProjectFile } from '#lib/projectFiles.ts'
    import type { CellGrid } from '#lib/Project.svelte.ts'
    import type { ByteRun } from '#lib/languages/peripherals/FileSystem.ts'
    import { describeLayout, resizeBmp, rgba, PIXEL_LIMIT } from '#lib/pixels/bmp.ts'
    import {
        PixelDocument,
        TRANSPARENT,
        type Bounds,
        type Ink,
        type PixelViewState
    } from '#lib/pixels/pixelDocument.ts'
    import {
        brushLineRuns,
        brushRuns,
        circleCorner,
        ellipseRuns,
        floodFill,
        plotRectangle,
        plotRuns,
        snapLine,
        BRUSH_SIZE_MAX,
        TOOL_KEYS,
        type BrushShape,
        type PixelTool,
        type Point,
        type Run
    } from '#lib/pixels/tools.ts'
    import {
        clampZoom,
        fitZoom,
        wheelZoom,
        zoomPercent,
        PIXEL_GRID_ZOOM,
        ZOOM_FACTOR
    } from '#lib/pixels/zoom.ts'
    import { CELL_GRID_MAX } from '#lib/Project.svelte.ts'
    import SegmentedControl from '#cmp/specific/project/cpu/SegmentedControl.svelte'
    import { ScopedTheme, ThemeStore, themeCssVariables } from '#stores/themeStore.svelte.ts'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import NumberStepper from '#cmp/shared/input/NumberStepper.svelte'
    import FileStatusLine from '../FileStatusLine.svelte'
    import FaPencilAlt from '~icons/fa-solid/pencil-alt'
    import FaSlash from '~icons/fa-solid/slash'
    import FaVectorSquare from '~icons/fa-solid/vector-square'
    import FaSquare from '~icons/fa-solid/square'
    import FaCircle from '~icons/fa-solid/circle'
    import FaChevronDown from '~icons/fa-solid/chevron-down'
    import FaRegularCircle from '~icons/fa-regular/circle'
    import FaFillDrip from '~icons/fa-solid/fill-drip'
    import FaEyeDropper from '~icons/fa-solid/eye-dropper'
    import FaEraser from '~icons/fa-solid/eraser'
    import FaSearchPlus from '~icons/fa-solid/search-plus'
    import FaSearchMinus from '~icons/fa-solid/search-minus'
    import FaCompress from '~icons/fa-solid/compress'
    import FaBorderAll from '~icons/fa-solid/border-all'
    import FaCropAlt from '~icons/fa-solid/crop-alt'
    import FaUndo from '~icons/fa-solid/undo'
    import FaRedo from '~icons/fa-solid/redo'

    /**
     * The **Pixel editor** ([pixel-editor.md](../../../../../../../docs/design/pixel-editor.md)): a
     * BMP's pixels drawn on in the layout the File has, every stroke saved when the pointer comes up
     * as an Edit step of the Workbench's Edit journal, which Undo takes back, as the Hex editor's
     * typing. One
     * finger or the mouse draws, two fingers or the wheel move and zoom; a picture with a palette is
     * drawn in its palette's colours, which can be recoloured, and one with an alpha channel can be
     * erased to transparent.
     */
    interface Props {
        path: string
        file: ProjectFile
        /** Why the pixels cannot be drawn on now, or undefined when they can. */
        readOnly?: string
        /** The cell grid the Project saved for the picture. */
        cellGrid?: CellGrid
        /** A stroke's runs, overwritten as one Edit step labelled `label`; false when refused. */
        onEditRuns: (path: string, runs: readonly ByteRun[], label: string) => boolean
        /** Undo, or Redo, of the File's newest Edit step; false when there was none or it was refused. */
        onUndoEdit: (path: string, redo: boolean) => boolean
        /**
         * Whether the File has an Edit step to take back, and one to put back, which turn the
         * toolbar's Undo and Redo on; a host that cannot tell leaves them on.
         */
        canUndo?: boolean
        canRedo?: boolean
        /** Canvas size: the resized picture's bytes, as an Edit step that replaces the content. */
        onResize: (path: string, bytes: Uint8Array, label: string) => boolean
        onCellGrid: (path: string, grid: CellGrid | undefined) => void
        /** Where this pane was in the picture and what it drew with, kept up to date. */
        viewState?: PixelViewState
        /** Whether the execution dock floats over the pane's bottom edge, which the canvas leaves room for. */
        dockInset?: boolean
    }

    let {
        path,
        file,
        readOnly,
        cellGrid: savedGrid,
        onEditRuns,
        onUndoEdit,
        canUndo = true,
        canRedo = true,
        onResize,
        onCellGrid,
        viewState = { tool: 'pencil', filled: false },
        dockInset = false
    }: Props = $props()

    //the pane keys the editor by its File, so the path never changes under it
    const ownPath = untrack(() => path)
    const view = untrack(() => viewState)

    let doc = $state.raw<PixelDocument>()
    /** Bumped whenever the document's pixels change, to draw them again. */
    let version = $state(0)
    /**
     * The File as this editor's own last change left it, which the document already holds and
     * needs no reading back: compared by identity, so any other change, even one in the same
     * moment, is read.
     */
    let ownFile: ProjectFile | undefined
    /**
     * Whether two records of the File hold the same bytes: a comment, or a write of the bytes it
     * already holds, makes a new record, which must not make the picture be read and drawn again.
     */
    function sameBytes(left: ProjectFile, right: ProjectFile | undefined) {
        return !!right && left.encoding === right.encoding && left.content === right.content
    }
    /** The canvas holding the picture a pixel for a pixel, which the view draws scaled. */
    let picture: HTMLCanvasElement | undefined
    let canvas = $state<HTMLCanvasElement>()
    let root = $state<HTMLDivElement>()
    let probes = $state<HTMLDivElement>()
    let viewWidth = $state(0)
    let viewHeight = $state(0)

    let zoom = $state(view.zoom ?? 1)
    let centre = $state<[number, number]>(view.centre ?? [0, 0])
    /** Whether the zoom fits the picture to the pane once the pane has a size. */
    let fitPending = view.zoom === undefined
    let tool = $state<PixelTool>(view.tool)
    let filled = $state(view.filled)
    let brushSize = $state(view.brushSize ?? 1)
    let brushShape = $state<BrushShape>(view.brushShape ?? 'round')
    let lineWidth = $state(view.lineWidth ?? 1)
    let circle = $state(view.circle ?? false)
    let ink = $state.raw<Ink | undefined>(view.ink)
    /**
     * The cell grid drawn, the Project's own until this pane changes it: one that cannot save it,
     * a read-only Project, still shows it.
     */
    let grid = $state.raw<CellGrid | undefined>(untrack(() => savedGrid))
    /** The cell grid last drawn, which turning the lines on again draws. */
    let lastGrid = $state.raw<CellGrid>(untrack(() => savedGrid) ?? { width: 16, height: 16 })
    $effect(() => {
        grid = savedGrid
    })
    let hover = $state.raw<Point>()
    let usedColours = $state.raw<number[]>([])
    /** Colours added to the row from an empty slot, kept there before the picture uses them. */
    let addedColours = $state.raw<number[]>(view.addedColours ?? [])
    let addInput = $state<HTMLInputElement>()
    /** Whether Canvas size is open, and the size typed into it. */
    let canvasWidth = $state(0)
    let canvasHeight = $state(0)

    const locked = $derived(readOnly !== undefined)
    const palette = $derived(version >= 0 && doc?.layout.palette ? doc.palette : undefined)
    const offersErase = $derived(!!doc?.alpha)
    //a tool kept from a picture with an alpha channel, or from before the File changed, erases
    //nothing on one without
    $effect(() => {
        if (tool === 'erase' && doc && !offersErase) tool = 'pencil'
    })
    const currentInk = $derived(ink && doc?.fits(ink) ? ink : defaultInk())

    /** White, the far end of black, which a new picture starts as: the last palette entry or opaque white. */
    function defaultInk(): Ink {
        if (doc?.layout.palette) return { index: doc.palette.length - 1 }
        return { colour: rgba(255, 255, 255) }
    }

    //the document follows the File: read again on any change but this editor's own, which it
    //already holds
    $effect(() => {
        const current = file
        untrack(() => {
            if (sameBytes(current, ownFile)) {
                ownFile = current
                return
            }
            ownFile = current
            const next = PixelDocument.read(fileBytes(current))
            //a picture of a new size fits the pane again; the first keeps where the pane left it
            const resized =
                !!doc && !!next && (next.width !== doc.width || next.height !== doc.height)
            gesture = cancelGesture(gesture)
            doc = next
            paintPicture()
            if (resized && viewWidth) fit()
            else if (resized) fitPending = true
            countColours()
            version++
        })
    })

    $effect(() => {
        view.zoom = zoom
        view.centre = centre
        view.tool = tool
        view.filled = filled
        view.brushSize = brushSize
        view.brushShape = brushShape
        view.lineWidth = lineWidth
        view.circle = circle
        view.ink = ink
        view.addedColours = addedColours
    })

    //the pane's size known, a picture opened afresh fits it
    $effect(() => {
        if (!viewWidth || !viewHeight || !fitPending || !doc) return
        untrack(fit)
    })

    /** Fits the picture to the pane, sliding there with `glide`, as Fit and 0 do. */
    function fit(glide = false) {
        if (!doc) return
        fitPending = false
        const next = fitZoom(doc.width, doc.height, {
            width: viewWidth - 16,
            height: viewHeight - 16
        })
        const middle: [number, number] = [doc.width / 2, doc.height / 2]
        if (glide) glideZoom(next, middle)
        else {
            stopGlide()
            zoom = next
            centre = middle
        }
    }

    /** How long a zoom by the buttons or the keys slides, in milliseconds. */
    const GLIDE_MS = 160
    /** A zoom sliding to `target`, and the frame that moves it next. */
    let glide: { frame: number; target: number } | undefined

    /**
     * Zooms to `next` about the pane's middle, or with `centreTo` moving there too, sliding over a
     * few frames as a drawing program does; at once where motion is reduced.
     */
    function glideZoom(next: number, centreTo?: [number, number]) {
        next = clampZoom(next)
        stopGlide()
        const reduced =
            typeof requestAnimationFrame === 'undefined' ||
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        if (reduced) {
            zoom = next
            if (centreTo) centre = centreTo
            return
        }
        const [from, fromCentre, start] = [zoom, centre, performance.now()]
        const step = (now: number) => {
            const progress = Math.min(1, (now - start) / GLIDE_MS)
            const eased = 1 - (1 - progress) ** 3
            //evenly in scale, so zooming in and out move at the same pace
            zoom = from * (next / from) ** eased
            if (centreTo)
                centre = [
                    fromCentre[0] + (centreTo[0] - fromCentre[0]) * eased,
                    fromCentre[1] + (centreTo[1] - fromCentre[1]) * eased
                ]
            glide = progress < 1 ? { frame: requestAnimationFrame(step), target: next } : undefined
        }
        glide = { frame: requestAnimationFrame(step), target: next }
    }

    /** Stops a sliding zoom where it is: the wheel, a pinch or a drag takes over. */
    function stopGlide() {
        if (glide) cancelAnimationFrame(glide.frame)
        glide = undefined
    }

    /** Zoom in, or out with `out`, from where a slide is heading, so presses add up. */
    function zoomStep(out = false) {
        const from = glide?.target ?? zoom
        glideZoom(out ? from / ZOOM_FACTOR : from * ZOOM_FACTOR)
    }

    /** The picture into its canvas a pixel for a pixel: all of it, or the part a stroke changed. */
    function paintPicture(bounds?: Bounds) {
        if (!doc || typeof document === 'undefined') return
        picture ??= document.createElement('canvas')
        if (picture.width !== doc.width || picture.height !== doc.height) {
            picture.width = doc.width
            picture.height = doc.height
            bounds = undefined
        }
        const context = picture.getContext('2d')
        if (!context) return
        const image = new ImageData(doc.pixels, doc.width, doc.height)
        if (bounds)
            context.putImageData(
                image,
                0,
                0,
                bounds.left,
                bounds.top,
                bounds.right - bounds.left + 1,
                bounds.bottom - bounds.top + 1
            )
        else context.putImageData(image, 0, 0)
    }

    /** What the stroke changed since it was last drawn, into the picture and onto the view. */
    function flushChanged() {
        if (!doc?.changed) return
        paintPicture(doc.changed)
        doc.changed = undefined
        version++
    }

    /**
     * How many of the colours a picture without a palette uses its colour row shows: it keeps a
     * slot for each, filled or not, so that a colour coming or going moves nothing beside it.
     */
    const USED_COLOUR_SLOTS = 16
    let colourTimer: ReturnType<typeof setTimeout> | undefined
    /**
     * The colour row, counted a moment after the picture changes rather than at every stroke: the
     * most used colours, those shown already where they were, so that a swatch about to be clicked
     * does not move, and new ones after them.
     */
    function countColours() {
        clearTimeout(colourTimer)
        colourTimer = setTimeout(() => {
            if (!doc || doc.layout.palette) {
                usedColours = []
                return
            }
            const counted = doc.usedColours(USED_COLOUR_SLOTS)
            //the colours added stay whether drawn with or not
            const kept = usedColours.filter(
                (colour) => counted.includes(colour) || addedColours.includes(colour)
            )
            for (const colour of addedColours) if (!kept.includes(colour)) kept.push(colour)
            usedColours = [...kept, ...counted.filter((colour) => !kept.includes(colour))].slice(
                0,
                USED_COLOUR_SLOTS
            )
        }, 150)
    }
    onDestroy(() => {
        clearTimeout(colourTimer)
        cancelAnimationFrame(frame)
        stopGlide()
    })

    //drawing ---------------------------------------------------------------------------------

    let frame = 0
    function schedule() {
        if (!frame && typeof requestAnimationFrame !== 'undefined')
            frame = requestAnimationFrame(() => {
                frame = 0
                draw()
            })
    }
    $effect(() => {
        void [
            canvas,
            version,
            zoom,
            centre,
            viewWidth,
            viewHeight,
            hover,
            shape,
            grid,
            tool,
            brush,
            lineWidth,
            themeKey,
            pixelRatio
        ]
        schedule()
    })

    /**
     * The theme's colours as a key, which changes when another theme is chosen or a language's
     * own is put on, so that the picture's lines and checkerboard are drawn again in the new ones.
     */
    const themeKey = $derived(
        `${ScopedTheme.id ?? ''}${themeCssVariables(ThemeStore.theme, ThemeStore.meta)}`
    )
    /** The screen's pixels to a CSS pixel, which moving the window to another screen changes. */
    let pixelRatio = $state(typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1)
    $effect(() => {
        //a query true at the present ratio, which stops being true when it changes
        const query = window.matchMedia?.(`(resolution: ${pixelRatio}dppx)`)
        if (!query) return
        const changed = () => (pixelRatio = window.devicePixelRatio || 1)
        query.addEventListener('change', changed)
        return () => query.removeEventListener('change', changed)
    })

    /** The picture's point at the view's top-left corner. */
    function origin(): [number, number] {
        return [centre[0] - viewWidth / (2 * zoom), centre[1] - viewHeight / (2 * zoom)]
    }

    /**
     * The colours the theme gives the lines and the checkerboard, as the browser resolves them,
     * read again when the theme changes, and at most twice a second besides rather than at every
     * frame of a stroke, for a change no key tells of.
     */
    let colours: {
        line: string
        accent: string
        light: string
        dark: string
        at: number
        key: string
    }
    function themeColours() {
        const now = performance.now()
        if (colours && colours.key === themeKey && now - colours.at < 500) return colours
        const read = (name: string) => {
            const probe = probes?.querySelector<HTMLElement>(`.${name}`)
            return probe ? getComputedStyle(probe).color : '#888'
        }
        colours = {
            line: read('probe-line'),
            accent: read('probe-accent'),
            light: read('probe-check-light'),
            dark: read('probe-check-dark'),
            at: now,
            key: themeKey
        }
        return colours
    }

    /**
     * The checkerboard under transparent pixels: a tile of the theme's two shades, 8 CSS pixels a
     * square, at the screen's own pixels, made again when either changes. Filling with it costs one
     * call where drawing the squares cost one each, ten thousand on a large pane at every frame.
     */
    let checker: { pattern: CanvasPattern; light: string; dark: string; ratio: number } | undefined
    function checkerPattern(
        context: CanvasRenderingContext2D,
        theme: { light: string; dark: string },
        ratio: number
    ): CanvasPattern | undefined {
        if (
            checker?.light === theme.light &&
            checker.dark === theme.dark &&
            checker.ratio === ratio
        )
            return checker.pattern
        const tile = document.createElement('canvas')
        const size = Math.round(16 * ratio)
        tile.width = size
        tile.height = size
        const paint = tile.getContext('2d')
        if (!paint) return undefined
        paint.fillStyle = theme.light
        paint.fillRect(0, 0, size, size)
        paint.fillStyle = theme.dark
        paint.fillRect(0, 0, size / 2, size / 2)
        paint.fillRect(size / 2, size / 2, size / 2, size / 2)
        const pattern = context.createPattern(tile, 'repeat')
        if (!pattern) return undefined
        checker = { pattern, light: theme.light, dark: theme.dark, ratio }
        return pattern
    }

    function draw() {
        if (!canvas || !doc || !picture) return
        const context = canvas.getContext('2d')
        if (!context) return
        const ratio = pixelRatio
        const [width, height] = [Math.round(viewWidth * ratio), Math.round(viewHeight * ratio)]
        if (canvas.width !== width) canvas.width = width
        if (canvas.height !== height) canvas.height = height
        context.setTransform(1, 0, 0, 1, 0, 0)
        context.clearRect(0, 0, width, height)
        context.setTransform(ratio, 0, 0, ratio, 0, 0)
        const theme = themeColours()
        const [ox, oy] = origin()
        const left = -ox * zoom
        const top = -oy * zoom
        //the part of the picture in view, so a picture at 64× is never drawn 65,536 pixels wide
        const sx = Math.max(0, Math.floor(ox))
        const sy = Math.max(0, Math.floor(oy))
        const ex = Math.min(doc.width, Math.ceil(ox + viewWidth / zoom))
        const ey = Math.min(doc.height, Math.ceil(oy + viewHeight / zoom))
        if (ex <= sx || ey <= sy) return
        //a pixel's edges on the screen, on whole device pixels: at a zoom between whole numbers
        //pixels are a device pixel wider or narrower, and what is drawn over them keeps to theirs
        const snap = (value: number) => Math.round(value * ratio) / ratio
        const at = (x: number, y: number): [number, number] => [
            snap(left + x * zoom),
            snap(top + y * zoom)
        ]
        const [vx, vy] = at(sx, sy)
        const [vw, vh] = ((end) => [end[0] - vx, end[1] - vy])(at(ex, ey))
        context.imageSmoothingEnabled = false
        if (doc.alpha) {
            //transparent pixels over a checkerboard in the theme's shades, as the Preview shows
            //them: its tile drawn a screen pixel for one of its own, a dark square at the picture's
            //top-left corner
            const pattern = checkerPattern(context, theme, ratio)
            pattern?.setTransform?.(new DOMMatrix([1 / ratio, 0, 0, 1 / ratio, left, top]))
            context.fillStyle = pattern ?? theme.light
            context.fillRect(vx, vy, vw, vh)
        }
        context.drawImage(picture, sx, sy, ex - sx, ey - sy, vx, vy, vw, vh)
        context.lineWidth = 1
        if (zoom >= PIXEL_GRID_ZOOM) {
            context.strokeStyle = theme.line
            context.globalAlpha = 0.5
            context.beginPath()
            for (let x = sx; x <= ex; x++) {
                const [lx] = at(x, 0)
                context.moveTo(Math.round(lx) + 0.5, vy)
                context.lineTo(Math.round(lx) + 0.5, vy + vh)
            }
            for (let y = sy; y <= ey; y++) {
                const [, ly] = at(0, y)
                context.moveTo(vx, Math.round(ly) + 0.5)
                context.lineTo(vx + vw, Math.round(ly) + 0.5)
            }
            context.stroke()
            context.globalAlpha = 1
        }
        if (grid) {
            context.strokeStyle = theme.accent
            context.beginPath()
            for (let x = Math.ceil(sx / grid.width) * grid.width; x <= ex; x += grid.width) {
                const [lx] = at(x, 0)
                context.moveTo(Math.round(lx) + 0.5, vy)
                context.lineTo(Math.round(lx) + 0.5, vy + vh)
            }
            for (let y = Math.ceil(sy / grid.height) * grid.height; y <= ey; y += grid.height) {
                const [, ly] = at(0, y)
                context.moveTo(vx, Math.round(ly) + 0.5)
                context.lineTo(vx + vw, Math.round(ly) + 0.5)
            }
            context.stroke()
        }
        const fillRun = (y: number, x0: number, x1: number) => {
            const [cx, cy] = at(x0, y)
            const [nx, ny] = at(x1 + 1, y + 1)
            context.fillRect(cx, cy, nx - cx, ny - cy)
        }
        //the line, rectangle or ellipse being drawn, in the colour it will be
        if (shape) {
            context.fillStyle = cssColour(doc.inkColour(shape.ink), true)
            if (shape.tool !== 'rectangle')
                for (const [y, x0, x1] of shapeRuns(shape)) fillRun(y, x0, x1)
            else {
                const [l, r] = [
                    Math.min(shape.from[0], shape.to[0]),
                    Math.max(shape.from[0], shape.to[0])
                ]
                const [t, b] = [
                    Math.min(shape.from[1], shape.to[1]),
                    Math.max(shape.from[1], shape.to[1])
                ]
                const [cx, cy] = at(l, t)
                const [endX, endY] = at(r + 1, b + 1)
                const [w, h] = [endX - cx, endY - cy]
                if (shape.filled) context.fillRect(cx, cy, w, h)
                else {
                    //the four sides, each a pixel thick
                    const [innerX, innerY] = at(l + 1, t + 1)
                    const [lastX, lastY] = at(r, b)
                    context.fillRect(cx, cy, w, innerY - cy)
                    context.fillRect(cx, lastY, w, endY - lastY)
                    context.fillRect(cx, cy, innerX - cx, h)
                    context.fillRect(lastX, cy, endX - lastX, h)
                }
            }
        }
        context.strokeStyle = theme.line
        context.strokeRect(left - 0.5, top - 0.5, doc.width * zoom + 1, doc.height * zoom + 1)
        if (hover && inside(hover)) {
            //what a brush wider than a pixel would cover, under the pointer
            const footprint =
                tool === 'pencil' || tool === 'erase'
                    ? brush
                    : tool === 'line' && !shape
                      ? brushRuns(lineWidth, 'round')
                      : undefined
            if (footprint && footprint.length > 1) {
                context.fillStyle = theme.accent
                context.globalAlpha = 0.45
                for (const [dy, dx0, dx1] of footprint)
                    fillRun(hover[1] + dy, hover[0] + dx0, hover[0] + dx1)
                context.globalAlpha = 1
            } else {
                const [hx, hy] = at(hover[0], hover[1])
                const [nx, ny] = at(hover[0] + 1, hover[1] + 1)
                context.strokeStyle = theme.accent
                context.lineWidth = 2
                context.strokeRect(hx - 1, hy - 1, nx - hx + 2, ny - hy + 2)
            }
        }
    }

    function cssColour(colour: number, opaque = false) {
        const alpha = opaque ? 1 : (colour & 0xff) / 255
        return `rgb(${colour >>> 24} ${(colour >>> 16) & 0xff} ${(colour >>> 8) & 0xff} / ${alpha})`
    }
    const hex = (colour: number) => `#${(colour >>> 8).toString(16).padStart(6, '0')}`

    //pointing --------------------------------------------------------------------------------

    type Gesture =
        | {
              kind: 'stroke'
              ink: Ink
              last: Point
              pointer: number
              label: string
              brush: readonly Run[]
          }
        | { kind: 'shape'; pointer: number }
        | { kind: 'pick'; pointer: number; before: Ink | undefined }
        | { kind: 'fill'; pointer: number; point: Point }
        | { kind: 'pan'; pointer: number; x: number; y: number; centre: [number, number] }
        | { kind: 'pinch'; distance: number; zoom: number; anchor: [number, number] }
    let gesture: Gesture | undefined
    /**
     * The line, rectangle or ellipse being dragged out, drawn over the picture until it is let go:
     * where it was begun, where it is, and what it draws with then.
     */
    type Shape = {
        tool: 'line' | 'rectangle' | 'ellipse'
        from: Point
        to: Point
        filled: boolean
        /** An ellipse that is a circle. */
        circle: boolean
        /** A line's thickness, as a brush. */
        brush: readonly Run[]
        ink: Ink
    }
    let shape = $state.raw<Shape>()

    /** The runs of a line or an ellipse, which are drawn and plotted a run at a time. */
    function shapeRuns(drawn: Shape): Run[] {
        if (drawn.tool === 'line') return brushLineRuns(drawn.from, drawn.to, drawn.brush)
        const to = drawn.circle ? circleCorner(drawn.from, drawn.to) : drawn.to
        return ellipseRuns(drawn.from, to, drawn.filled)
    }

    /** The brush the Pencil and the Eraser draw with. */
    const brush = $derived(brushRuns(brushSize, brushShape))
    // eslint-disable-next-line svelte/prefer-svelte-reactivity -- The fingers on the canvas, read by the pointer handlers alone; nothing tracks them.
    const pointers = new Map<number, { x: number; y: number }>()

    function inside([x, y]: Point) {
        return !!doc && x >= 0 && y >= 0 && x < doc.width && y < doc.height
    }

    /** The picture's coordinates under a point of the screen, in fractions of a pixel. */
    function pictureAt(clientX: number, clientY: number): [number, number] {
        const rect = canvas!.getBoundingClientRect()
        const [ox, oy] = origin()
        return [ox + (clientX - rect.left) / zoom, oy + (clientY - rect.top) / zoom]
    }
    function pixelAt(event: PointerEvent): Point {
        const [x, y] = pictureAt(event.clientX, event.clientY)
        return [Math.floor(x), Math.floor(y)]
    }

    /** Drops what a gesture was doing: a stroke's pixels go back, a shape is not drawn. */
    function cancelGesture(current: Gesture | undefined): undefined {
        //a colour picked by the finger a pinch began with is not the one meant
        if (current?.kind === 'pick') ink = current.before
        if (current?.kind === 'stroke' && doc) {
            doc.cancelStroke()
            paintPicture()
            version++
        }
        shape = undefined
        return undefined
    }

    function onpointerdown(event: PointerEvent) {
        if (!doc || !canvas) return
        //a drag or a pinch takes over from a sliding zoom, where it is
        stopGlide()
        root?.focus({ preventScroll: true })
        canvas.setPointerCapture?.(event.pointerId)
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (pointers.size === 2) {
            //a second finger turns whatever the first began into a pinch, leaving no mark
            gesture = cancelGesture(gesture)
            startPinch()
            return
        }
        if (pointers.size > 2) return
        const panning = event.pointerType === 'mouse' && event.button === 1
        if (event.button !== 0 && !panning) return
        if (panning || (locked && !event.altKey && tool !== 'eyedropper')) {
            gesture = {
                kind: 'pan',
                pointer: event.pointerId,
                x: event.clientX,
                y: event.clientY,
                centre
            }
            return
        }
        const point = pixelAt(event)
        const using = event.altKey ? 'eyedropper' : tool
        if (using === 'eyedropper') {
            const before = ink
            pick(point)
            gesture = { kind: 'pick', pointer: event.pointerId, before }
            return
        }
        if (using === 'line' || using === 'rectangle' || using === 'ellipse') {
            shape = {
                tool: using,
                from: point,
                to: point,
                //Shift fills a rectangle, or not, the other way, and makes an ellipse a circle
                filled: filled !== (using === 'rectangle' && event.shiftKey),
                circle: circle !== (using === 'ellipse' && event.shiftKey),
                brush: brushRuns(lineWidth, 'round'),
                ink: currentInk
            }
            gesture = { kind: 'shape', pointer: event.pointerId }
            return
        }
        if (using === 'fill') {
            //a touch fills as it lifts, so that a second finger landing makes it a pinch instead
            if (event.pointerType === 'touch')
                gesture = { kind: 'fill', pointer: event.pointerId, point }
            else fill(point)
            return
        }
        const strokeInk = using === 'erase' ? TRANSPARENT : currentInk
        const target = doc
        doc.beginStroke()
        plotRuns(brushLineRuns(point, point, brush), (x, y) => target.plot(x, y, strokeInk))
        flushChanged()
        gesture = {
            kind: 'stroke',
            ink: strokeInk,
            last: point,
            pointer: event.pointerId,
            label: using === 'erase' ? 'Erase' : 'Pencil',
            brush
        }
    }

    function onpointermove(event: PointerEvent) {
        if (!doc) return
        if (pointers.has(event.pointerId))
            pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
        if (event.pointerType !== 'touch') {
            const point = pixelAt(event)
            if (!hover || hover[0] !== point[0] || hover[1] !== point[1]) hover = point
        }
        const current = gesture
        if (!current) return
        if (current.kind === 'pinch') return movePinch()
        if (current.pointer !== event.pointerId) return
        if (current.kind === 'pan') {
            centre = bounded([
                current.centre[0] - (event.clientX - current.x) / zoom,
                current.centre[1] - (event.clientY - current.y) / zoom
            ])
            return
        }
        const point = pixelAt(event)
        if (current.kind === 'pick') return pick(point)
        if (current.kind === 'shape' && shape) {
            const to = shape.tool === 'line' && event.shiftKey ? snapLine(shape.from, point) : point
            shape = {
                ...shape,
                to,
                filled: filled !== (shape.tool === 'rectangle' && event.shiftKey),
                circle: circle !== (shape.tool === 'ellipse' && event.shiftKey)
            }
            return
        }
        if (current.kind === 'stroke') {
            const target = doc
            plotRuns(brushLineRuns(current.last, point, current.brush), (x, y) =>
                target.plot(x, y, current.ink)
            )
            current.last = point
            flushChanged()
        }
    }

    function onpointerup(event: PointerEvent) {
        pointers.delete(event.pointerId)
        const current = gesture
        if (current?.kind === 'pinch') {
            if (pointers.size < 2) gesture = undefined
            return
        }
        if (!current || current.pointer !== event.pointerId) return
        gesture = undefined
        if (current.kind === 'stroke') commitStroke(current.label)
        else if (current.kind === 'fill') fill(current.point)
        else if (current.kind === 'shape' && shape && doc) {
            const drawn = shape
            shape = undefined
            const target = doc
            const plot = (x: number, y: number) => target.plot(x, y, drawn.ink)
            target.beginStroke()
            if (drawn.tool === 'rectangle')
                plotRectangle(drawn.from, drawn.to, drawn.filled, plot, target)
            else plotRuns(shapeRuns(drawn), plot, target)
            commitStroke(SHAPE_LABELS[drawn.tool])
        }
    }

    function onpointercancel(event: PointerEvent) {
        pointers.delete(event.pointerId)
        gesture = cancelGesture(gesture)
    }

    function onpointerleave(event: PointerEvent) {
        if (event.pointerType !== 'touch' && !pointers.has(event.pointerId)) hover = undefined
    }

    function startPinch() {
        const [a, b] = [...pointers.values()]
        const middle = pictureAt((a.x + b.x) / 2, (a.y + b.y) / 2)
        gesture = {
            kind: 'pinch',
            distance: Math.hypot(a.x - b.x, a.y - b.y) || 1,
            zoom,
            anchor: middle
        }
    }

    /** Two fingers: the picture's point first between them stays between them, scaled by their spread. */
    function movePinch() {
        if (gesture?.kind !== 'pinch' || pointers.size < 2 || !canvas) return
        const [a, b] = [...pointers.values()]
        const distance = Math.hypot(a.x - b.x, a.y - b.y) || 1
        const next = clampZoom(gesture.zoom * (distance / gesture.distance))
        const rect = canvas.getBoundingClientRect()
        const [mx, my] = [(a.x + b.x) / 2 - rect.left, (a.y + b.y) / 2 - rect.top]
        zoom = next
        centre = bounded([
            gesture.anchor[0] - mx / next + viewWidth / (2 * next),
            gesture.anchor[1] - my / next + viewHeight / (2 * next)
        ])
    }

    /** A line of wheel turning, in pixels. */
    const LINE_PIXELS = 16

    /**
     * The wheel moves the picture, and with Ctrl or Cmd zooms smoothly at the pointer: a trackpad's
     * pinch sends many small turns, a mouse's notch one large one.
     */
    function onwheel(event: WheelEvent) {
        if (!doc) return
        event.preventDefault()
        const unit =
            event.deltaMode === WheelEvent.DOM_DELTA_LINE
                ? LINE_PIXELS
                : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
                  ? viewHeight
                  : 1
        if (event.ctrlKey || event.metaKey) {
            zoomAt(wheelZoom(zoom, event.deltaY * unit), event.clientX, event.clientY)
            return
        }
        const [dx, dy] = event.shiftKey
            ? [event.deltaY, event.deltaX]
            : [event.deltaX, event.deltaY]
        centre = bounded([centre[0] + (dx * unit) / zoom, centre[1] + (dy * unit) / zoom])
    }

    /** A centre that keeps the middle of the pane on the picture, so it can never be lost. */
    function bounded([x, y]: [number, number]): [number, number] {
        if (!doc) return [x, y]
        return [Math.min(doc.width, Math.max(0, x)), Math.min(doc.height, Math.max(0, y))]
    }

    /** A new zoom that keeps the picture's point under the screen's point where it is. */
    function zoomAt(next: number, clientX?: number, clientY?: number) {
        if (!canvas) return
        stopGlide()
        const rect = canvas.getBoundingClientRect()
        const [x, y] = [clientX ?? rect.left + viewWidth / 2, clientY ?? rect.top + viewHeight / 2]
        const [px, py] = pictureAt(x, y)
        const [mx, my] = [x - rect.left, y - rect.top]
        zoom = next
        centre = bounded([
            px - mx / next + viewWidth / (2 * next),
            py - my / next + viewHeight / (2 * next)
        ])
    }

    /** A flood fill from `point` with the ink, saved as one change. */
    function fill(point: Point) {
        if (!doc || !inside(point)) return
        const fillInk = currentInk
        const target = doc
        target.beginStroke()
        floodFill(
            target.width,
            target.height,
            point,
            (x, y) => target.kindAt(x, y),
            (x, y) => target.plot(x, y, fillInk)
        )
        commitStroke('Fill')
    }

    function pick(point: Point) {
        if (doc && inside(point)) ink = doc.inkAt(point[0], point[1])
    }

    //saving ----------------------------------------------------------------------------------

    /** The stroke's runs saved as one change, recorded for Undo; refused, the File is read again. */
    function commitStroke(label: string) {
        if (!doc) return
        const runs = doc.endStroke()
        flushChanged()
        if (!runs.length) return
        save(runs, label)
    }

    function save(runs: ByteRun[], label: string) {
        if (onEditRuns(ownPath, runs, label)) {
            //the File the save made, read at once, before anything else can change it
            ownFile = file
            countColours()
        } else {
            doc = PixelDocument.read(fileBytes(file))
            paintPicture()
            version++
        }
    }

    function undo(redo = false) {
        if (locked) return
        gesture = cancelGesture(gesture)
        onUndoEdit(ownPath, redo)
    }

    /** Recolours a palette entry, every pixel that uses it with it, as one change (design decision 6). */
    function recolour(index: number, colour: number) {
        if (!doc || locked) return
        const run = doc.recolour(index, colour)
        paintPicture()
        version++
        save([run], `Recolour palette entry ${index}`)
    }

    let recolourInput = $state<HTMLInputElement>()
    let recolouring: number | undefined
    function startRecolour(index: number) {
        if (!palette || locked || !recolourInput) return
        recolouring = index
        recolourInput.value = hex(palette[index])
        try {
            recolourInput.showPicker()
        } catch {
            recolourInput.click()
        }
    }
    /**
     * A long press on a palette entry recolours it, the picker opening as the finger lifts: a
     * touch only counts as the person's own act once it ends, and a browser opens no picker before.
     */
    let pressTimer: ReturnType<typeof setTimeout> | undefined
    let pressed: number | undefined
    function swatchDown(event: PointerEvent, index: number) {
        if (event.pointerType !== 'touch') return
        clearTimeout(pressTimer)
        pressed = undefined
        pressTimer = setTimeout(() => (pressed = index), 500)
    }
    function swatchUp(event: PointerEvent) {
        clearTimeout(pressTimer)
        const index = pressed
        pressed = undefined
        if (index !== undefined && event.type === 'pointerup') startRecolour(index)
    }

    function parseHex(value: string): number {
        const bits = Number.parseInt(value.slice(1), 16)
        return rgba((bits >> 16) & 0xff, (bits >> 8) & 0xff, bits & 0xff)
    }

    /**
     * The largest side Canvas size takes: 1024, as a new picture's, or a larger picture's own, so
     * one opened at 1500 pixels can still be cropped.
     */
    const canvasLimit = $derived(Math.max(1024, doc?.width ?? 0, doc?.height ?? 0))
    const canvasProblem = $derived.by(() => {
        const valid = (side: number) => Number.isInteger(side) && side >= 1 && side <= canvasLimit
        if (!valid(canvasWidth) || !valid(canvasHeight))
            return `Width and height must be whole numbers from 1 to ${canvasLimit} pixels.`
        if (canvasWidth * canvasHeight > PIXEL_LIMIT)
            return `The canvas cannot exceed ${PIXEL_LIMIT.toLocaleString()} pixels in total.`
        return undefined
    })
    /** Whether the size typed is the picture's own, which would change nothing. */
    const canvasUnchanged = $derived(
        !!doc && canvasWidth === doc.width && canvasHeight === doc.height
    )

    function applyCanvasSize() {
        if (!doc || dropdown !== 'canvas' || locked || canvasProblem || canvasUnchanged) return
        const [width, height] = [canvasWidth, canvasHeight]
        const valid = (side: number) => Number.isInteger(side) && side >= 1 && side <= canvasLimit
        if (!valid(width) || !valid(height) || width * height > PIXEL_LIMIT) return
        const resized = resizeBmp(doc.bytes, doc.layout, width, height)
        if (onResize(ownPath, resized, `Resize canvas to ${width} × ${height}`)) closeCanvasForm()
    }

    /** Closes Canvas size, the keys going back to the editor its button took them from. */
    function closeCanvasForm() {
        closeDropdown()
        root?.focus({ preventScroll: true })
    }

    function setGrid(width: number, height: number) {
        const side = (value: number) => Math.min(CELL_GRID_MAX, Math.max(1, Math.round(value) || 1))
        chooseGrid({ width: side(width), height: side(height) })
    }

    function chooseGrid(next: CellGrid | undefined) {
        grid = next
        if (next) lastGrid = next
        onCellGrid(ownPath, next)
    }

    let toolSet = $state<HTMLDivElement>()
    let colourSet = $state<HTMLDivElement>()
    /**
     * Whether the colours went to a line under the tools, too narrow a pane for both, where the
     * rule between them would end a line. It is then only unseen, keeping its room, so that hiding
     * it never lets the two fit on one line again and the rule come back.
     */
    let wrapped = $state(false)
    $effect(() => {
        const [tools, colours] = [toolSet, colourSet]
        //jsdom, which the component tests run in, has no ResizeObserver
        if (!tools || !colours || typeof ResizeObserver === 'undefined') return
        const check = () => {
            wrapped = colours.offsetTop >= tools.offsetTop + tools.offsetHeight
        }
        check()
        const observer = new ResizeObserver(check)
        observer.observe(tools)
        observer.observe(colours)
        observer.observe(tools.parentElement!)
        return () => observer.disconnect()
    })

    /** An empty slot of the colour row: the browser's colour picker, for a colour to add there. */
    function startAdding() {
        if (!addInput) return
        addInput.value = hex(inkColour)
        try {
            addInput.showPicker()
        } catch {
            addInput.click()
        }
    }

    /** A colour picked for an empty slot: drawn with, and kept in the row in that slot. */
    function addColour(colour: number) {
        const opaque = (colour | 0xff) >>> 0
        ink = { colour: opaque }
        if (usedColours.includes(opaque)) return
        addedColours = [...addedColours, opaque]
        usedColours = [...usedColours, opaque].slice(0, USED_COLOUR_SLOTS)
    }

    /** The tools that have settings, which open under their button. */
    const SETTINGS_TOOLS: readonly PixelTool[] = ['pencil', 'line', 'rectangle', 'ellipse', 'erase']
    /** What a card opens under: a tool's settings, the cell grid's or Canvas size. */
    type Dropdown = PixelTool | 'grid' | 'canvas'
    /** The card open under its button, if any. */
    let dropdown = $state<Dropdown>()
    let dropdownCard = $state<HTMLDivElement>()
    let dropdownPlace = $state({ top: 0, left: 0 })
    /** The button each card opens under; read when it is placed. */
    const anchors: Partial<Record<Dropdown, HTMLElement>> = {}

    /** A tool's button: chooses the tool, or for the one chosen already opens or closes its settings. */
    function pressTool(next: PixelTool) {
        if (next === tool && SETTINGS_TOOLS.includes(next)) return toggleSettings(next)
        setTool(next)
    }

    /** Opens a tool's settings under its button, choosing it, or closes them when open. */
    function toggleSettings(of: PixelTool) {
        if (dropdown === of) return closeDropdown()
        setTool(of)
        if (tool === of) void openDropdown(of)
    }

    /** Opens the cell grid's card or Canvas size under its button, or closes it when open. */
    function toggleViewCard(of: 'grid' | 'canvas') {
        if (dropdown === of) return of === 'canvas' ? closeCanvasForm() : closeDropdown()
        if (of === 'canvas') {
            if (!doc) return
            canvasWidth = doc.width
            canvasHeight = doc.height
        }
        void openDropdown(of).then(() => {
            //Canvas size is for typing a size into
            if (of === 'canvas') dropdownCard?.querySelector<HTMLInputElement>('input')?.select()
        })
    }

    async function openDropdown(of: Dropdown) {
        dropdown = of
        await tick()
        if (dropdown !== of || !dropdownCard?.isConnected) return
        dropdownCard.showPopover?.()
        placeDropdown()
    }

    function closeDropdown() {
        dropdown = undefined
    }

    /**
     * The card under its button, kept inside the window: from the button's left edge, or for one
     * at the toolbar's right end, which a card would run off, to its right edge.
     */
    function placeDropdown() {
        const anchor = dropdown && anchors[dropdown]
        if (!anchor || !dropdownCard) return
        const rect = anchor.getBoundingClientRect()
        const margin = 8
        const width = dropdownCard.offsetWidth
        const left = rect.left + width > window.innerWidth - margin ? rect.right - width : rect.left
        dropdownPlace = { top: rect.bottom + 4, left: Math.max(margin, left) }
    }

    //settings of tools that cannot draw now are of no use, nor Canvas size; the cell grid still is
    $effect(() => {
        if (locked && untrack(() => dropdown) !== 'grid') untrack(closeDropdown)
    })

    function setTool(next: PixelTool) {
        if (next === 'erase' && !offersErase) return
        if (dropdown !== next) closeDropdown()
        gesture = cancelGesture(gesture)
        tool = next
    }

    function onkeydown(event: KeyboardEvent) {
        if (event.key === 'Escape' && dropdown) {
            closeDropdown()
            root?.focus({ preventScroll: true })
            event.stopPropagation()
            return
        }
        //typing a size into the toolbar's fields, whose own Undo is the field's
        if ((event.target as HTMLElement).closest?.('input, select, textarea')) return
        const command = event.ctrlKey || event.metaKey
        const key = event.key.toLowerCase()
        if (command && (key === 'z' || key === 'y')) {
            event.preventDefault()
            event.stopPropagation()
            undo(key === 'y' || event.shiftKey)
            return
        }
        if (command || event.altKey) return
        if (event.key === 'Escape') {
            gesture = cancelGesture(gesture)
            return
        }
        const handled = (() => {
            //a tool is its plain key: Shift with it is the Workbench's, as Shift+B builds
            if (!event.shiftKey && key in TOOL_KEYS) {
                setTool(TOOL_KEYS[key])
                return true
            }
            if (event.key === '+' || event.key === '=') zoomStep()
            else if (event.key === '-') zoomStep(true)
            else if (event.key === '0') fit(true)
            else if (event.key === '1') glideZoom(1)
            else return false
            return true
        })()
        if (handled) {
            event.preventDefault()
            event.stopPropagation()
        }
    }

    const TOOLS: {
        tool: PixelTool
        label: string
        description: string
        key: string
        icon: typeof FaPencilAlt
    }[] = [
        {
            tool: 'pencil',
            label: 'Pencil',
            description: 'Draw freehand with the current colour',
            key: 'B',
            icon: FaPencilAlt
        },
        {
            tool: 'line',
            label: 'Line',
            description: 'Draw a straight line',
            key: 'L',
            icon: FaSlash
        },
        {
            tool: 'rectangle',
            label: 'Rectangle',
            description: 'Draw a rectangle',
            key: 'U',
            icon: FaVectorSquare
        },
        {
            tool: 'ellipse',
            label: 'Ellipse',
            description: 'Draw an ellipse or circle',
            key: 'O',
            icon: FaRegularCircle
        },
        {
            tool: 'fill',
            label: 'Fill',
            description: 'Fill a connected area with the current colour',
            key: 'G',
            icon: FaFillDrip
        },
        {
            tool: 'eyedropper',
            label: 'Eyedropper',
            description: 'Pick a drawing colour from the image',
            key: 'I',
            icon: FaEyeDropper
        },
        {
            tool: 'erase',
            label: 'Eraser',
            description: 'Make pixels transparent',
            key: 'E',
            icon: FaEraser
        }
    ]
    const DRAWING_TOOLS: readonly PixelTool[] = [
        'pencil',
        'line',
        'rectangle',
        'ellipse',
        'fill',
        'erase'
    ]
    /** How the Edit history names a shape's step. */
    const SHAPE_LABELS: Record<Shape['tool'], string> = {
        line: 'Line',
        rectangle: 'Rectangle',
        ellipse: 'Ellipse'
    }
    /** The Pencil's and the Eraser's brush shapes, as the switch shows them. */
    const BRUSH_SHAPES = [
        { id: 'round', label: 'Round brush', icon: FaCircle },
        { id: 'square', label: 'Square brush', icon: FaSquare }
    ]
    const GRID_SWITCH = [
        { id: 'off', label: 'Off' },
        { id: 'on', label: 'On' }
    ]
    const FILLS = [
        { id: 'outline', label: 'Outline' },
        { id: 'filled', label: 'Filled' }
    ]
    /** Ellipse's switch, its words drawn short: the labels name the buttons apart from the tool. */
    const ELLIPSE_KINDS = [
        {
            id: 'ellipse',
            label: 'Ellipse',
            title: 'Draw an ellipse. Hold Shift while drawing to make it a circle.'
        },
        {
            id: 'circle',
            label: 'Circle',
            title: 'Draw a circle. Hold Shift while drawing to make it an ellipse.'
        }
    ]

    /** The pixel under the pointer, while it is over the picture. */
    const pointed = $derived(hover && doc && inside(hover) ? hover : undefined)
    /** The colour of the pixel under the pointer, as the status line says it. */
    const pointedColour = $derived.by(() => {
        void version
        if (!pointed || !doc) return undefined
        const colour = doc.colourAt(pointed[0], pointed[1])
        if (doc.layout.palette) {
            const { index } = doc.inkAt(pointed[0], pointed[1]) as { index: number }
            return `palette index ${index}, ${hex(colour)}`
        }
        const alpha = colour & 0xff
        return `${hex(colour)}${doc.alpha && alpha !== 255 ? `, alpha ${alpha}` : ''}`
    })
    /** Whether a colour of the row is the one drawn with, which outlines it. */
    function picked(colour: number) {
        if (!('colour' in currentInk)) return false
        //a transparent colour of the row is drawn with as TRANSPARENT, whose colour is 0
        const transparent = (colour & 0xff) === 0 && offersErase
        return currentInk.colour === (transparent ? 0 : (colour | 0xff) >>> 0)
    }
    const inkColour = $derived(doc ? doc.inkColour(currentInk) : 0)
</script>

<svelte:window
    onpointerdown={(event) => {
        if (!dropdown) return
        const target = event.target as Node | null
        const anchor = anchors[dropdown]
        if (!dropdownCard?.contains(target) && !anchor?.contains(target)) closeDropdown()
    }}
    onresize={() => dropdown && placeDropdown()}
/>
<!-- capture, so a scroll inside any container moves the settings with their tool -->
<svelte:document onscrollcapture={() => dropdown && placeDropdown()} />

<!-- the region takes the keys while the focus is anywhere in it, the canvas or the toolbar: tools,
     zoom, Undo and Redo, as a drawing program's window does -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
    class="pixel-editor"
    class:dock-inset={dockInset}
    role="region"
    aria-label="Pixel editor for {path}"
    tabindex="0"
    bind:this={root}
    {onkeydown}
>
    <FileStatusLine class="pixel-status">
        {#snippet facts()}
            {#if doc}
                <span class="fact">{doc.width} × {doc.height} px</span>
                <span class="fact" {@attach tooltip('Pixel format and row order in the BMP file')}
                    >{describeLayout(doc.layout)}</span
                >
                <!-- the numbers that change as the pointer moves and the zoom slides keep their room,
                     up to four digits, so nothing after them moves -->
                <span class="fact number zoom" {@attach tooltip('Zoom level')}
                    >{zoomPercent(zoom)}</span
                >
                <span
                    class="fact position"
                    {@attach tooltip(
                        'Pixel coordinates, starting at (0, 0) in the top-left corner'
                    )}
                >
                    <span class="axis">X</span>
                    <span class="number coordinate">{pointed?.[0] ?? ''}</span>
                    <span class="axis">Y</span>
                    <span class="number coordinate">{pointed?.[1] ?? ''}</span>
                </span>
                {#if pointedColour}
                    <span class="fact number">{pointedColour}</span>
                {/if}
            {/if}
            {#if readOnly}
                <span class="fact badge read-only" {@attach tooltip(readOnly)}>read-only</span>
            {/if}
        {/snippet}
    </FileStatusLine>
    <!-- Undo and Redo at the left, the tools and colours in the middle, the view at the right,
     as a drawing program's toolbar has them -->
    <div class="pixel-toolbar" role="toolbar" aria-label="Pixel tools">
        <div class="toolbar-row">
            <div class="group history">
                <button
                    type="button"
                    class="tool"
                    {@attach tooltip('Undo', { shortcut: 'Mod+KeyZ' })}
                    aria-label="Undo"
                    disabled={locked || !canUndo}
                    onclick={() => undo()}><FaUndo /></button
                >
                <button
                    type="button"
                    class="tool"
                    {@attach tooltip('Redo', { shortcut: 'Mod+Shift+KeyZ' })}
                    aria-label="Redo"
                    disabled={locked || !canRedo}
                    onclick={() => undo(true)}><FaRedo /></button
                >
            </div>
            <!-- a palette too large for the row puts the colours under the tools rather than
                 wrapping, and a rule between the two would then end a line -->
            <div class="middle" class:stacked={palette && palette.length > 16}>
                <div class="tool-set" bind:this={toolSet}>
                    <div class="group">
                        {#each TOOLS as entry (entry.tool)}
                            {#if entry.tool !== 'erase' || offersErase}
                                {@const Icon = entry.icon}
                                {@const drawing = DRAWING_TOOLS.includes(entry.tool)}
                                {#if SETTINGS_TOOLS.includes(entry.tool)}
                                    <!-- the tool and its settings, one button split in two: the
                                         settings open from the arrow, or from the tool once chosen -->
                                    <div
                                        class="split"
                                        class:pressed={tool === entry.tool}
                                        class:open={dropdown === entry.tool}
                                        bind:this={anchors[entry.tool]}
                                    >
                                        <button
                                            type="button"
                                            class="tool"
                                            {@attach tooltip(
                                                `${entry.label}: ${entry.description}.${tool === entry.tool ? ' Click again for settings.' : ''}`,
                                                { shortcut: entry.key }
                                            )}
                                            aria-label={entry.label}
                                            aria-pressed={tool === entry.tool}
                                            disabled={locked && drawing}
                                            onclick={() => pressTool(entry.tool)}
                                        >
                                            <Icon />
                                        </button>
                                        <button
                                            type="button"
                                            class="caret"
                                            {@attach tooltip(`${entry.label} settings`)}
                                            aria-label="{entry.label} settings"
                                            aria-haspopup="dialog"
                                            aria-expanded={dropdown === entry.tool}
                                            disabled={locked && drawing}
                                            onclick={() => toggleSettings(entry.tool)}
                                        >
                                            <FaChevronDown />
                                        </button>
                                    </div>
                                {:else}
                                    <button
                                        type="button"
                                        class="tool"
                                        {@attach tooltip(`${entry.label}: ${entry.description}.`, {
                                            shortcut: entry.key
                                        })}
                                        aria-label={entry.label}
                                        aria-pressed={tool === entry.tool}
                                        disabled={locked && drawing}
                                        onclick={() => pressTool(entry.tool)}
                                    >
                                        <Icon />
                                    </button>
                                {/if}
                            {/if}
                        {/each}
                    </div>
                </div>
                {#if !(palette && palette.length > 16)}
                    <span class="divider" class:unseen={wrapped} aria-hidden="true"></span>
                {/if}
                <div class="colour-set" bind:this={colourSet}>
                    <!-- the colour pickers open under the colour drawn with, whichever slot or entry
                         asked for one -->
                    <div class="current-colour">
                        {#if palette}
                            {@const entry = 'index' in currentInk ? currentInk.index : 0}
                            <button
                                type="button"
                                class="swatch current-swatch"
                                aria-label="Drawing colour: palette entry {entry}, {hex(
                                    palette[entry]
                                )}"
                                {@attach tooltip(
                                    `Change palette entry ${entry} (${hex(palette[entry])}) and every pixel that uses it`
                                )}
                                style:--swatch={cssColour(palette[entry])}
                                disabled={locked}
                                onclick={() => startRecolour(entry)}
                            ></button>
                        {:else}
                            <label class="current" {@attach tooltip('Choose the drawing colour')}>
                                <input
                                    type="color"
                                    aria-label="Drawing colour"
                                    value={hex(inkColour)}
                                    oninput={(event) =>
                                        (ink = { colour: parseHex(event.currentTarget.value) })}
                                />
                            </label>
                        {/if}
                        {#if palette}
                            <input
                                type="color"
                                class="hidden-picker"
                                tabindex="-1"
                                aria-hidden="true"
                                bind:this={recolourInput}
                                onchange={(event) => {
                                    if (recolouring !== undefined)
                                        recolour(recolouring, parseHex(event.currentTarget.value))
                                    recolouring = undefined
                                }}
                            />
                        {:else}
                            <input
                                type="color"
                                class="hidden-picker"
                                tabindex="-1"
                                aria-hidden="true"
                                bind:this={addInput}
                                onchange={(event) => addColour(parseHex(event.currentTarget.value))}
                            />
                        {/if}
                    </div>
                    <span class="divider" aria-hidden="true"></span>
                    <div class="group colours">
                        {#if palette}
                            <div
                                class="palette"
                                role="listbox"
                                aria-label="Palette"
                                class:large={palette.length > 16}
                            >
                                {#each palette as colour, index (index)}
                                    <button
                                        type="button"
                                        class="swatch"
                                        role="option"
                                        aria-selected={'index' in currentInk &&
                                            currentInk.index === index}
                                        aria-label="Palette entry {index}, {hex(colour)}"
                                        {@attach tooltip(
                                            `Select palette entry ${index} (${hex(colour)}). Double-click or long-press to change it for every pixel that uses it.`,
                                            //a long press recolours the entry
                                            { touch: false }
                                        )}
                                        style:--swatch={cssColour(colour)}
                                        onclick={() => (ink = { index })}
                                        ondblclick={() => startRecolour(index)}
                                        onpointerdown={(event) => swatchDown(event, index)}
                                        onpointerup={swatchUp}
                                        onpointerleave={swatchUp}
                                    ></button>
                                {/each}
                            </div>
                        {:else}
                            <!-- every slot drawn, an empty one too, so the row keeps its width -->
                            {#each { length: USED_COLOUR_SLOTS }, slot (slot)}
                                {@const colour = usedColours[slot]}
                                {#if colour === undefined}
                                    <button
                                        type="button"
                                        class="swatch empty"
                                        aria-label="Add a colour"
                                        {@attach tooltip(
                                            'Choose a colour, add it to the swatches and use it for drawing'
                                        )}
                                        onclick={startAdding}
                                    ></button>
                                {:else}
                                    <button
                                        type="button"
                                        class="swatch"
                                        aria-label="Use {hex(colour)}{(colour & 0xff) === 0
                                            ? ', transparent'
                                            : ''}"
                                        {@attach tooltip(
                                            (colour & 0xff) === 0
                                                ? 'Draw transparent pixels'
                                                : `Draw with ${hex(colour)}`
                                        )}
                                        aria-pressed={picked(colour)}
                                        style:--swatch={cssColour(colour)}
                                        onclick={() =>
                                            (ink =
                                                (colour & 0xff) === 0 && offersErase
                                                    ? TRANSPARENT
                                                    : { colour: (colour | 0xff) >>> 0 })}
                                    ></button>
                                {/if}
                            {/each}
                        {/if}
                    </div>
                </div>
            </div>
            <div class="group view">
                <button
                    type="button"
                    class="tool"
                    {@attach tooltip('Zoom out', { shortcut: '-' })}
                    aria-label="Zoom out"
                    onclick={() => zoomStep(true)}><FaSearchMinus /></button
                >
                <button
                    type="button"
                    class="tool"
                    {@attach tooltip('Zoom in', { shortcut: '+' })}
                    aria-label="Zoom in"
                    onclick={() => zoomStep()}><FaSearchPlus /></button
                >
                <button
                    type="button"
                    class="tool"
                    {@attach tooltip('Fit the whole image in the editor', { shortcut: '0' })}
                    aria-label="Fit image"
                    onclick={() => fit(true)}><FaCompress /></button
                >
                <!-- pressed while its lines are drawn; its card turns them on and off and sizes them -->
                <button
                    type="button"
                    class="tool"
                    {@attach tooltip('Configure the grid for sprite frames or tiles')}
                    aria-label="Cell grid"
                    aria-pressed={!!grid}
                    aria-haspopup="dialog"
                    aria-expanded={dropdown === 'grid'}
                    bind:this={anchors.grid}
                    onclick={() => toggleViewCard('grid')}><FaBorderAll /></button
                >
                <button
                    type="button"
                    class="tool"
                    {@attach tooltip(
                        'Crop or expand the canvas, keeping existing pixels at the top left'
                    )}
                    aria-label="Canvas size"
                    aria-haspopup="dialog"
                    aria-expanded={dropdown === 'canvas'}
                    disabled={locked || !doc}
                    bind:this={anchors.canvas}
                    onclick={() => toggleViewCard('canvas')}><FaCropAlt /></button
                >
            </div>
        </div>
    </div>
    <div class="pixel-body" bind:clientWidth={viewWidth} bind:clientHeight={viewHeight}>
        {#if doc}
            <canvas
                bind:this={canvas}
                class:drawing={!locked && tool !== 'eyedropper'}
                style:width="{viewWidth}px"
                style:height="{viewHeight}px"
                {onpointerdown}
                {onpointermove}
                {onpointerup}
                {onpointercancel}
                {onpointerleave}
                {onwheel}
                oncontextmenu={(event) => event.preventDefault()}
            ></canvas>
        {:else}
            <p class="notice">This image can no longer be edited because its BMP format changed.</p>
        {/if}
    </div>
    {#if dropdown}
        {@const of = dropdown}
        <!-- a manual popover, in the browser's top layer, so neither the pane nor the canvas clips
             it; a pointer anywhere else, Escape or another tool closes it -->
        <div
            class="tool-settings"
            popover="manual"
            role="dialog"
            aria-label={of === 'grid'
                ? 'Cell grid'
                : of === 'canvas'
                  ? 'Canvas size'
                  : `${TOOLS.find((entry) => entry.tool === of)?.label} settings`}
            bind:this={dropdownCard}
            style:top="{dropdownPlace.top}px"
            style:left="{dropdownPlace.left}px"
        >
            {#if of === 'pencil' || of === 'erase'}
                <div class="setting">
                    <span>Size (px)</span>
                    <NumberStepper
                        min={1}
                        max={BRUSH_SIZE_MAX}
                        ariaLabel="Brush size"
                        bind:value={brushSize}
                    />
                </div>
                <div class="setting">
                    <span>Shape</span>
                    <SegmentedControl
                        ariaLabel="Brush shape"
                        options={BRUSH_SHAPES}
                        selected={brushShape}
                        onSelect={(id) => (brushShape = id as BrushShape)}
                    >
                        {#snippet face(option)}
                            <span class="shape-face"><option.icon /></span>
                        {/snippet}
                    </SegmentedControl>
                </div>
                <p class="setting-hint">
                    The pencil and eraser share the same brush size and shape.
                </p>
            {:else if of === 'line'}
                <div class="setting">
                    <span>Width (px)</span>
                    <NumberStepper
                        min={1}
                        max={BRUSH_SIZE_MAX}
                        ariaLabel="Line width"
                        bind:value={lineWidth}
                    />
                </div>
                <p class="setting-hint">
                    Hold Shift while drawing to snap the line to horizontal, vertical or 45°.
                </p>
            {:else if of === 'grid'}
                <div class="setting">
                    <span>Grid</span>
                    <SegmentedControl
                        ariaLabel="Grid visibility"
                        options={GRID_SWITCH}
                        selected={grid ? 'on' : 'off'}
                        onSelect={(id) => chooseGrid(id === 'on' ? lastGrid : undefined)}
                    />
                </div>
                <div class="setting">
                    <span>Cell size (px)</span>
                    <span class="size">
                        <NumberStepper
                            min={1}
                            max={CELL_GRID_MAX}
                            ariaLabel="Cell width"
                            value={(grid ?? lastGrid).width}
                            onchange={(width) => setGrid(width, (grid ?? lastGrid).height)}
                        />
                        ×
                        <NumberStepper
                            min={1}
                            max={CELL_GRID_MAX}
                            ariaLabel="Cell height"
                            value={(grid ?? lastGrid).height}
                            onchange={(height) => setGrid((grid ?? lastGrid).width, height)}
                        />
                    </span>
                </div>
                <p class="setting-hint">
                    Mark sprite frames or tiles with a grid. Changing the cell size turns the grid
                    on.
                </p>
            {:else if of === 'canvas'}
                <form
                    class="canvas-size"
                    onsubmit={(event) => {
                        event.preventDefault()
                        applyCanvasSize()
                    }}
                >
                    <div class="setting">
                        <span>Width (px)</span>
                        <NumberStepper
                            min={1}
                            max={canvasLimit}
                            ariaLabel="Width"
                            bind:value={canvasWidth}
                        />
                    </div>
                    <div class="setting">
                        <span>Height (px)</span>
                        <NumberStepper
                            min={1}
                            max={canvasLimit}
                            ariaLabel="Height"
                            bind:value={canvasHeight}
                        />
                    </div>
                    <p class="setting-hint" role={canvasProblem ? 'alert' : undefined}>
                        {canvasProblem ?? 'Crops or adds space on the right and bottom.'}
                    </p>
                    <div class="card-actions">
                        <button type="button" class="action" onclick={closeCanvasForm}
                            >Cancel</button
                        >
                        <button
                            type="submit"
                            class="action primary"
                            disabled={!!canvasProblem || canvasUnchanged}>Resize</button
                        >
                    </div>
                </form>
            {:else}
                {#if of === 'ellipse'}
                    <div class="setting">
                        <span>Shape</span>
                        <SegmentedControl
                            ariaLabel="Ellipse or circle"
                            options={ELLIPSE_KINDS}
                            selected={circle ? 'circle' : 'ellipse'}
                            onSelect={(id) => (circle = id === 'circle')}
                        >
                            {#snippet face(option)}
                                {option.id === 'circle' ? 'Circle' : 'Ellipse'}
                            {/snippet}
                        </SegmentedControl>
                    </div>
                {/if}
                <div class="setting">
                    <span>Fill</span>
                    <SegmentedControl
                        ariaLabel="Fill"
                        options={FILLS}
                        selected={filled ? 'filled' : 'outline'}
                        onSelect={(id) => (filled = id === 'filled')}
                    />
                </div>
                <p class="setting-hint">
                    {of === 'ellipse'
                        ? 'Hold Shift while drawing to switch between an ellipse and a circle.'
                        : 'Hold Shift while drawing to switch between outline and filled.'}
                </p>
            {/if}
        </div>
    {/if}
    <div class="probes" aria-hidden="true" bind:this={probes}>
        <span class="probe-line"></span>
        <span class="probe-accent"></span>
        <span class="probe-check-light"></span>
        <span class="probe-check-dark"></span>
    </div>
</div>

<style lang="scss">
    .pixel-editor {
        --pixel-line: var(--wb-line, color-mix(in srgb, var(--tertiary) 60%, transparent));
        /* what the toolbar's buttons sit on, which the rule within a split button is cut in */
        --toolbar-surface: var(--secondary);
        --toolbar-pad: 0.3rem;
        --dock-room: 0px;
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
        background: var(--secondary);
        color: var(--secondary-text);
        outline: none;
    }
    .dock-inset {
        --dock-room: calc(var(--wb-control-height, 2.6rem) + 0.75rem);
    }
    /* numbers that change under the pointer, in figures of one width, each with its room */
    .number {
        font-family: 'Fira Code', monospace;
        font-size: 0.75rem;
    }
    .zoom {
        min-width: 5ch;
        text-align: right;
    }
    .position {
        display: flex;
        align-items: baseline;
        gap: 0.3rem;
    }
    .axis {
        opacity: 0.65;
    }
    .coordinate {
        display: inline-block;
        min-width: 4ch;
    }
    /* at the far end, so the facts before it moving never move it */
    .read-only {
        margin-left: auto;
        background: color-mix(in srgb, var(--warning, var(--accent)) 22%, transparent);
    }
    .pixel-toolbar {
        container: pixel-toolbar / inline-size;
        background: var(--toolbar-surface);
        padding: var(--toolbar-pad) 0.4rem;
        border-bottom: 1px solid var(--pixel-line);
        font-size: 0.8rem;
    }
    /* Undo and Redo at the left edge and the view at the right, the tools and colours centred
       between them in the room left, wrapping there rather than scrolling sideways */
    .toolbar-row {
        display: grid;
        grid-template-columns: minmax(max-content, 1fr) auto minmax(max-content, 1fr);
        grid-template-areas: 'history middle view';
        /* level with the tools, which stay the first line when a palette wraps below them */
        align-items: start;
        gap: 0.3rem 0.6rem;
    }
    .history {
        grid-area: history;
        justify-self: start;
    }
    .middle {
        grid-area: middle;
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 0.3rem 0.6rem;
        min-width: 0;
    }
    /* the tools with their options, and the colour drawn with beside those to choose from */
    .tool-set,
    .colour-set {
        display: flex;
        flex-wrap: wrap;
        justify-content: center;
        align-items: center;
        gap: 0.3rem 0.6rem;
    }
    /* the colour drawn with close to those it is chosen from */
    .colour-set {
        column-gap: 0.25rem;

        .divider {
            margin-inline: 0.2rem;
        }
    }
    .middle.stacked {
        flex-direction: column;
    }
    /* a group wrapped onto lines of its own keeps them centred too */
    .middle .group {
        justify-content: center;
    }
    /* the tools, the colour drawn with and the colours to choose from, ruled apart */
    .divider {
        align-self: stretch;
        width: 1px;
        margin: 0.2rem 0.35rem;
        background: color-mix(in srgb, var(--secondary-text) 30%, transparent);

        &.unseen {
            visibility: hidden;
        }
    }
    /* a tool with settings: the tool and the arrow that opens them, one button ruled in two */
    .split {
        display: flex;
        border-radius: 0.3rem;

        .tool {
            border-radius: 0.3rem 0 0 0.3rem;
        }
        &.pressed .tool,
        &.pressed .caret {
            background: var(--accent);
            color: var(--accent-text);
        }
    }
    .caret {
        display: grid;
        place-items: center;
        width: 0.95rem;
        height: 1.9rem;
        padding: 0;
        border: none;
        border-left: 1px solid var(--toolbar-surface);
        border-radius: 0 0.3rem 0.3rem 0;
        background: transparent;
        color: inherit;
        cursor: pointer;

        :global(svg) {
            width: 0.45rem;
            height: 0.45rem;
            transition: transform 0.15s;
        }
        &:hover:not(:disabled) {
            background: color-mix(in srgb, var(--tertiary) 55%, transparent);
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
        &:disabled {
            opacity: 0.4;
            cursor: default;
        }
    }
    /* the chosen tool keeps its colour under the pointer, its arrow too */
    .split.pressed .caret:hover:not(:disabled) {
        background: var(--accent);
    }
    /* the tools as buttons on the toolbar, so that a split one reads as one button cut in two */
    .tool-set .tool:not([aria-pressed='true']),
    .tool-set .split:not(.pressed) .caret {
        background: var(--tertiary);
        color: var(--tertiary-text);

        &:hover:not(:disabled) {
            background: color-mix(in srgb, var(--tertiary) 82%, var(--tertiary-text));
        }
    }
    .split.open .caret :global(svg) {
        transform: rotate(180deg);
    }
    .tool-settings {
        position: fixed;
        inset: auto;
        z-index: 100;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 13rem;
        margin: 0;
        padding: 0.6rem 0.7rem;
        /* the raised colour of the tools' buttons, which it opens from */
        border: 1px solid color-mix(in srgb, var(--tertiary-text) 15%, transparent);
        border-radius: 0.5rem;
        background: var(--tertiary);
        color: var(--tertiary-text);
        box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
        font-size: 0.8rem;
    }
    .setting {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.8rem;
    }
    .setting-hint {
        margin: 0;
        max-width: 15rem;
        font-size: 0.72rem;
        line-height: 1.35;
        color: var(--hint);
    }
    .shape-face {
        display: grid;
        place-items: center;
        padding: 0 0.15rem;

        :global(svg) {
            width: 0.75rem;
            height: 0.75rem;
        }
    }
    .current-swatch {
        width: 1.6rem;
        height: 1.6rem;
    }
    .view {
        grid-area: view;
        justify-self: end;
    }
    /* too narrow for one row, as on a phone: Undo and the view above, the tools and colours below,
       on lines of their own, where a rule between them would start a line */
    @container pixel-toolbar (max-width: 40rem) {
        .toolbar-row {
            grid-template-columns: auto 1fr;
            grid-template-areas:
                'history view'
                'middle middle';
        }
        .divider {
            display: none;
        }
    }
    /* the buttons as far apart as the toolbar's edge is from them */
    .group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: var(--toolbar-pad);
    }
    .tool {
        display: grid;
        place-items: center;
        width: 1.9rem;
        height: 1.9rem;
        border-radius: 0.3rem;
        background: transparent;
        color: inherit;
        cursor: pointer;

        :global(svg) {
            width: 0.85rem;
            height: 0.85rem;
        }
        &:hover:not(:disabled) {
            background: color-mix(in srgb, var(--tertiary) 55%, transparent);
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
            outline-offset: -2px;
        }
        /* the tool chosen keeps its colour under the pointer too */
        &[aria-pressed='true'],
        &[aria-pressed='true']:hover:not(:disabled) {
            background: var(--accent);
            color: var(--accent-text);
        }
        &:disabled {
            opacity: 0.4;
            cursor: default;
        }
    }
    .size {
        display: flex;
        align-items: center;
        gap: 0.2rem;
    }
    .colours {
        gap: 0.25rem;
    }
    .current {
        display: flex;
        align-items: center;
        gap: 0.3rem;
        cursor: pointer;

        input {
            width: 2rem;
            height: 1.6rem;
            padding: 0;
            border: none;
            background: none;
            cursor: pointer;
        }
    }
    .palette {
        display: flex;
        flex-wrap: wrap;
        gap: 2px;
        max-width: 100%;
    }
    .palette.large {
        display: grid;
        grid-template-columns: repeat(32, 0.9rem);
        max-width: 100%;
    }
    .swatch {
        --check: color-mix(in srgb, var(--secondary-text) 12%, var(--secondary));
        width: 1.25rem;
        height: 1.25rem;
        padding: 0;
        border: 1px solid var(--pixel-line);
        border-radius: 0.2rem;
        background:
            linear-gradient(var(--swatch), var(--swatch)),
            conic-gradient(
                    var(--check) 25%,
                    var(--secondary) 0 50%,
                    var(--check) 0 75%,
                    var(--secondary) 0
                )
                0 0 / 0.5rem 0.5rem;
        cursor: pointer;

        /* the palette's entry, or the row's colour, drawn with */
        &[aria-selected='true'],
        &[aria-pressed='true'] {
            outline: 2px solid var(--accent);
            outline-offset: 1px;
        }
        &:focus-visible {
            outline: 2px solid var(--accent);
        }
    }
    /* a slot the picture has no colour for yet: its room, which adds one */
    .swatch.empty {
        border: 1px dashed color-mix(in srgb, var(--secondary-text) 28%, transparent);
        background: none;

        &:hover {
            border-color: color-mix(in srgb, var(--secondary-text) 60%, transparent);
        }
    }
    .palette.large .swatch {
        width: 0.9rem;
        height: 0.9rem;
        border-radius: 0.1rem;
    }
    /* a 256-colour palette in rows of 32 is wider than a phone: rows of 16 there */
    @container pixel-toolbar (max-width: 32rem) {
        .palette.large {
            grid-template-columns: repeat(16, 0.9rem);
        }
    }
    /* a line along the bottom of the colour drawn with, which the browser opens its picker under */
    .current-colour {
        position: relative;
        display: flex;
        align-items: center;
    }
    .hidden-picker {
        position: absolute;
        left: 0;
        bottom: 0;
        width: 100%;
        height: 1px;
        opacity: 0;
        pointer-events: none;
    }
    /* Canvas size, in its card: a field a line, then its buttons at the right */
    .canvas-size {
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .card-actions {
        display: flex;
        justify-content: flex-end;
        gap: 0.4rem;
    }
    .action {
        height: 1.8rem;
        padding: 0 0.8rem;
        border: 1px solid var(--pixel-line);
        border-radius: 0.35rem;
        background: var(--primary);
        color: var(--primary-text);
        font: inherit;
        cursor: pointer;
    }
    .action:disabled {
        opacity: 0.5;
        cursor: default;
    }
    .action.primary {
        border-color: transparent;
        background: var(--accent);
        color: var(--accent-text);
    }
    .pixel-body {
        position: relative;
        flex: 1;
        min-height: 0;
        overflow: hidden;
        margin-bottom: var(--dock-room);
    }
    canvas {
        position: absolute;
        inset: 0;
        display: block;
        /* the editor's own gestures, never the page's scroll or zoom */
        touch-action: none;
    }
    canvas.drawing {
        cursor: crosshair;
    }
    .notice {
        margin: 2rem auto;
        max-width: 26rem;
        text-align: center;
        opacity: 0.8;
    }
    .probes {
        display: none;
    }
    .probe-line {
        color: var(--pixel-line);
    }
    .probe-accent {
        color: var(--accent);
    }
    .probe-check-light {
        color: var(--secondary);
    }
    .probe-check-dark {
        color: color-mix(in srgb, var(--secondary-text) 12%, var(--secondary));
    }
</style>
