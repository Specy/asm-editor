<script lang="ts">
    import { onMount, tick, untrack, type Snippet } from 'svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import FaDesktop from '~icons/fa-solid/desktop'
    import FaTh from '~icons/fa-solid/th'
    import FaWindowMaximize from '~icons/fa-solid/window-maximize'
    import FaLayerGroup from '~icons/fa-solid/layer-group'
    import { preferencesStore } from '#stores/preferencesStore.svelte.ts'
    import ToggleableDraggable from '#cmp/shared/draggable/DraggableContainer.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import { screenZoom, screenZoomLabel, snapZoom } from './screenZoom'
    import { bodyZoom, screenWindowGeometry } from './screenWindow'
    import type { Screen } from '#lib/languages/peripherals/screen/Screen.ts'
    import type { Keyboard } from '#lib/languages/peripherals/Keyboard.ts'
    import type { Mouse, MouseButton } from '#lib/languages/peripherals/Mouse.ts'
    import {
        wheelNotches,
        type X86Button,
        type X86Input
    } from '#lib/languages/peripherals/x86Input.ts'
    import type { ScreenHeader } from './screenHeader'

    /**
     * The Screen panel: the canvas a program's graphical output is painted on, and the only place
     * the Keyboard and Mouse peripherals receive input
     * ([ADR 0008](../../../../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)).
     *
     * The Screen is plain TypeScript with no runes, so nothing here can react to it: the canvas is
     * repainted from an animation frame that compares the Screen's version counter, the upstream
     * TRS-80 pattern that keeps the machine from ever waiting for a frame
     * ([ADR 0006](../../../../../../../docs/adr/0006-screen-double-buffering.md)).
     *
     * On x86 the keys and the pointer go to `x86Input` instead, as the Linux input events the
     * program reads from `/dev/input`: physical keys with the browser's repeats, the pointer on
     * whole pixels as QEMU reports it, and the wheel. They never
     * reach the program's standard input, whose Terminal is a serial line apart from the Screen
     * ([ADR 0068](../../../../../../../docs/adr/0068-x86-programs-run-on-a-serial-console.md)).
     * Elsewhere the wheel goes to the Mouse, which MIPS's and RISC-V's Input controller reads; the
     * focused Screen keeps it from scrolling the page on every Target.
     *
     * Every key belongs to the program while the Screen has focus, Escape included, which games and
     * asmOS read. Shift+Tab gives the keyboard back to the page on every Target, as in the Terminal's
     * raw mode, and so does a click outside the Screen
     * ([ADR 0008](../../../../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md), 2026-11-03).
     */

    interface Props {
        screen: Screen
        keyboard: Keyboard
        mouse: Mouse
        /** x86's input devices, which take the keys and the pointer in place of the Keyboard and Mouse. */
        x86Input?: X86Input
        /**
         * What the program waits for that only this Screen can give it, "Waiting for a key", while
         * it waits for nothing else: the unfocused Screen asks to be clicked.
         */
        waitingFor?: string
        /** The environment this Screen belongs to, shown in the header. */
        name?: string
        style?: string
        /** The MIPS and RISC-V display configuration popover, rendered in the header. */
        configuration?: Snippet
        /**
         * The container draws the header, a folding section that already has a title bar: the
         * panel then draws none of its own and hands the size and the controls to `onHeader`.
         */
        headerless?: boolean
        /**
         * Called with what a headerless panel's container shows in its header while the Screen is
         * in the page, and with `undefined` once it goes to the floating window (whose bar has
         * them) or away.
         */
        onHeader?: (header: ScreenHeader | undefined) => void
        /**
         * The panel is at least as tall as the fitted Screen needs to fill its width, for a
         * container that scrolls rather than squeezing the Screen into the height it has left.
         */
        heightFromWidth?: boolean
        /**
         * Opens the floating window as soon as the panel is shown, then calls
         * `onWindowRequestAnswered` so that the host asks only once.
         */
        windowRequested?: boolean
        onWindowRequestAnswered?: () => void
    }

    let {
        screen,
        keyboard,
        mouse,
        x86Input,
        waitingFor,
        name = 'Screen',
        style = '',
        configuration,
        headerless = false,
        onHeader,
        heightFromWidth = false,
        windowRequested = false,
        onWindowRequestAnswered
    }: Props = $props()

    const MOUSE_BUTTONS: Record<number, MouseButton> = { 0: 'left', 1: 'middle', 2: 'right' }
    //x86's tablet has five buttons: the browser's back and forward are BTN_SIDE and BTN_EXTRA
    const X86_BUTTONS: Record<number, X86Button> = { ...MOUSE_BUTTONS, 3: 'side', 4: 'extra' }
    /** The browser's back and forward buttons, which navigate the page on their own. */
    const isHistoryButton = (event: MouseEvent) => event.button === 3 || event.button === 4

    //x86 reads the keys and the pointer as Linux input events, every other Target as its Keyboard
    //and Mouse
    const keys = $derived(x86Input ?? keyboard)
    const pointer = $derived(x86Input ?? mouse)
    //where a focused Screen's input goes, which a learner who clicks the Screen and then types at a
    //`scanf` needs to know on x86 (ADR 0068), and how to get it back: a program reads Escape like
    //any key, so Shift+Tab releases it on every Target, as in the Terminal's raw mode. A program
    //waiting for the Screen's input says so first
    const focusHint = $derived.by(() => {
        const hint = x86Input
            ? {
                  label: 'click to send keyboard and mouse input to the program',
                  title: 'Click to send keyboard and mouse input to the program through /dev/input. Type in the Terminal for standard input. Press Shift+Tab to return keyboard focus to the page.'
              }
            : {
                  label: 'click to send keyboard and mouse input to the program',
                  title: 'Click to send keyboard and mouse input to the program. Press Shift+Tab to return keyboard focus to the page.'
              }
        if (waitingFor === undefined) return hint
        return {
            label: `${waitingFor.toLowerCase()}, ${hint.label}`,
            title: `${waitingFor}. ${hint.title}`
        }
    })

    let canvas: HTMLCanvasElement | undefined = $state()
    //the stage's content box rather than its clientWidth, which counts padding: the padding is the
    //room the focus ring is drawn in, and the canvas is fitted to what is left inside it
    let stageBox: DOMRectReadOnly | undefined = $state()
    let viewportWidth = $derived(stageBox?.width ?? 0)
    let viewportHeight = $derived(stageBox?.height ?? 0)
    //the Screen has no runes, so the GUI mirrors what the frame loop reads from it; the values
    //here are only the seed for the first frame
    let logicalWidth = $state(untrack(() => screen.width))
    let logicalHeight = $state(untrack(() => screen.height))
    //Integer scaling: every Screen pixel the same whole number of the display's pixels, for crisp
    //text and lines, where it is otherwise fitted to fill the room it has (`screenZoom.ts`)
    let integerScaling = $state(false)
    //the display's pixels in a CSS pixel, which Integer scaling counts in; a page zoom or a move to
    //another monitor changes it, and fires the window's resize
    let devicePixelRatio = $state(typeof window === 'undefined' ? 1 : window.devicePixelRatio)
    //the Screen has no runes here either, so what the frame loop last read from it is what decides
    //whether the panel offers the drawing buffer at all
    let doubleBuffering = $state(untrack(() => screen.doubleBuffering))
    let focused = $state(false)
    //a program waiting for what only this Screen can give it, while the Screen does not have the
    //keyboard: the ring the focus would draw, dashed, asks for the click
    const waiting = $derived(waitingFor !== undefined && !focused)
    //the floating window is another container for the same canvas, never a second panel: the
    //component that calls `screen.watch()` has to stay mounted exactly once, or the scheduler
    //counts two painters (ADR 0007)
    let expanded = $state(false)
    let windowLeft = $state(0)
    let windowTop = $state(0)
    let windowWidth = $state(0)
    let windowHeight = $state(0)
    let windowMinWidth = $state(0)
    let windowMinHeight = $state(0)
    //the zoom the size the user resized the window to allows, since it opened: until then it is
    //the largest the viewport allows, through any resize of the browser or the Screen
    let windowZoom: number | undefined

    let context: CanvasRenderingContext2D | null = null
    let image: ImageData | null = null
    //-1 rather than 0: a Screen that has never changed is still at version 0 and must be painted once
    let paintedVersion = -1

    //the page's panel is the size its layout gives it, which the Screen fills exactly; the window
    //picks its own size, so it can pick one with evenly sized pixels
    const pageSnap = $derived(integerScaling ? 'integer' : 'exact')
    const windowSnap = $derived(integerScaling ? 'integer' : 'fine')

    let zoom = $derived(
        screenZoom({
            snap: expanded ? windowSnap : pageSnap,
            viewportWidth,
            viewportHeight,
            logicalWidth,
            logicalHeight,
            devicePixelRatio
        })
    )

    let zoomLabel = $derived(screenZoomLabel(integerScaling, zoom, devicePixelRatio))

    //the stage's width is the one measurement that does not depend on its height, so the height a
    //fitted Screen needs to fill it comes from it alone. It belongs to the page's container: the
    //floating window has a box of its own, and a stage held taller than it would fit the width
    //alone and push the bottom of a tall Screen out of the window
    let widthFitHeight = $derived(
        heightFromWidth && !expanded && viewportWidth > 0 && logicalWidth > 0
            ? Math.floor(
                  logicalHeight * snapZoom(viewportWidth / logicalWidth, pageSnap, devicePixelRatio)
              )
            : 0
    )

    /**
     * The debug view of a double buffered Screen: the image the program is drawing on, which it
     * would normally only show at `present` (ADR 0006). It is the `showDrawingBuffer` Preference,
     * so the panel button and the Settings switch are the one toggle and it survives a reload, and
     * it means nothing on a Screen that is not double buffering — there is only one image then.
     */
    let showDrawingBuffer = $derived(preferencesStore.values.showDrawingBuffer.value)
    let showingDrawingBuffer = $derived(showDrawingBuffer && doubleBuffering)

    const rootFontSize = () => parseFloat(getComputedStyle(document.documentElement).fontSize)

    /**
     * The window's box comes from the viewport and the Screen (`screenWindow.ts`): it hugs the
     * Screen at its zoom, so a box the user drags cannot be written as CSS insets the way the
     * in-page panel's height is. It opens at the top right, and otherwise keeps its top and the
     * edge named, which a corner drag left where it was.
     */
    function placeWindow(place: 'open' | 'left' | 'right') {
        const box = screenWindowGeometry({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            rootFontSize: rootFontSize(),
            devicePixelRatio,
            screenWidth: logicalWidth,
            screenHeight: logicalHeight,
            snap: windowSnap,
            zoom: windowZoom,
            left: place === 'left' ? windowLeft : undefined,
            right: place === 'right' ? windowLeft + windowWidth : undefined,
            top: place === 'open' ? undefined : windowTop
        })
        windowLeft = box.left
        windowTop = box.top
        windowWidth = box.width
        windowHeight = box.height
        windowMinWidth = box.minWidth
        windowMinHeight = box.minHeight
    }

    /**
     * A corner let go: the window followed the pointer while it was dragged, the Screen inside it
     * at the largest zoom its scaling allows there, and it now hugs the Screen at that zoom,
     * keeping the edge the corner did not move.
     */
    function snapResizedWindow(corner: 'start' | 'end') {
        windowZoom = bodyZoom({
            size: { width: windowWidth, height: windowHeight },
            screenWidth: logicalWidth,
            screenHeight: logicalHeight,
            rootFontSize: rootFontSize(),
            devicePixelRatio,
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight
        })
        placeWindow(corner === 'end' ? 'left' : 'right')
    }

    async function toggleWindow() {
        const wasFocused = focused
        //opening always starts at the top right, hugging the Screen at the largest zoom there is
        //room for, whatever the last drag or resize left behind
        if (!expanded) {
            windowZoom = undefined
            placeWindow('open')
        }
        expanded = !expanded
        //the canvas is a new element in the other container, so the program's input follows it
        await tick()
        if (wasFocused) canvas?.focus()
    }

    function paint() {
        if (!canvas) return
        if (canvas.width !== screen.width || canvas.height !== screen.height) {
            //the backing store is one texel per logical pixel; the zoom is CSS, so putImageData
            //never scales and the panel's size never costs the emulator anything. It is set through
            //the width and height attributes and nowhere else: writing `canvas.width` here as well
            //would have Svelte write the attribute again after this frame painted, and a canvas
            //resize clears what is on it, which is what a program's resize command used to do.
            logicalWidth = screen.width
            logicalHeight = screen.height
            //painting is left to the frame that finds the new backing store, since resizing clears
            paintedVersion = -1
            return
        }
        doubleBuffering = screen.doubleBuffering
        const drawingView = showDrawingBuffer && doubleBuffering
        //the version counter moves for the visible image alone, so the drawing buffer — which every
        //operation changes and only `present` copies out — is repainted every frame instead. It is
        //a debug view, and one putImageData a frame costs nothing next to what it is showing
        if (!drawingView && paintedVersion === screen.version) return
        context ??= canvas.getContext('2d')
        if (!context) return
        const source = drawingView ? screen.drawingPixels : screen.visiblePixels
        //what changed since the frame this canvas shows, when the Screen knows it: x86's catch-up
        //names the rows and columns it changed, and a pointer moving over a large Screen is then a
        //few hundred pixels to copy rather than the whole image
        let region = drawingView ? null : screen.changedRegion(paintedVersion)
        //ImageData wraps the Screen's own array instead of copying it, so it is only rebuilt when
        //that array is replaced: a Build, a resize, a double-buffering change or a switch between
        //the two images
        if (
            !image ||
            image.data !== source ||
            image.width !== screen.width ||
            image.height !== screen.height
        ) {
            //the Screen allocates its images itself, so their buffers are the plain ArrayBuffers
            //the DOM's ImageDataArray asks for
            const pixels = source as Uint8ClampedArray<ArrayBuffer>
            image = new ImageData(pixels, screen.width, screen.height)
            region = null
        }
        if (!region) context.putImageData(image, 0, 0)
        else if (region.width > 0 && region.height > 0)
            context.putImageData(image, 0, 0, region.x, region.y, region.width, region.height)
        //the drawing view leaves it at -1 so that going back to the visible image paints it once,
        //however long the program has been sitting on the same frame
        paintedVersion = drawingView ? -1 : screen.version
        //the scheduler shortens its slices while the Screen is dirty (ADR 0007), so telling it the
        //frame reached the GUI is what lets a compute-only run go back to long slices. The drawing
        //view never paints the visible image, so it never claims to have shown it
        if (!drawingView) screen.markPainted()
    }

    function logicalPosition(event: MouseEvent) {
        const rect = canvas?.getBoundingClientRect()
        if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
        //logical pixels, independent of the GUI zoom; the Mouse floors and clamps them, which is
        //where "coordinates never leave the Screen" lives (ADR 0008)
        return {
            x: ((event.clientX - rect.left) * screen.width) / rect.width,
            y: ((event.clientY - rect.top) * screen.height) / rect.height
        }
    }

    /** The button of a pointer event the program's input takes, if it takes it. */
    function buttonOf(event: PointerEvent): X86Button | undefined {
        return x86Input ? X86_BUTTONS[event.button] : MOUSE_BUTTONS[event.button]
    }

    function press(button: X86Button, down: boolean, x: number, y: number) {
        if (x86Input) {
            if (down) x86Input.buttonDown(button, x, y)
            else x86Input.buttonUp(button, x, y)
        } else if (button !== 'side' && button !== 'extra') {
            if (down) mouse.buttonDown(button, x, y)
            else mouse.buttonUp(button, x, y)
        }
    }

    /**
     * The back and forward buttons navigate the page from their release, which a focused Screen
     * keeps them from doing on every Target, as it keeps the wheel from scrolling: on x86 they are
     * the program's, and elsewhere they would take the learner away from a running program.
     */
    function keepHistoryButton(event: MouseEvent) {
        if (focused && isHistoryButton(event)) event.preventDefault()
    }

    function handlePointerDown(event: PointerEvent) {
        const button = buttonOf(event)
        if (!button) return
        //keeps the browser's gestures off the Screen: text selection, the drag image, and the
        //middle-click autoscroll that would otherwise steal the button from the program
        event.preventDefault()
        //where the click landed, before the focus below scrolls a canvas that was partly out of
        //view, which would move it under the pointer
        const { x, y } = logicalPosition(event)
        //preventDefault also cancels the focus a pointer down would have given the canvas
        canvas?.focus()
        //a drag that started inside keeps reporting until the button comes back up, wherever the
        //pointer goes (ADR 0008)
        canvas?.setPointerCapture(event.pointerId)
        press(button, true, x, y)
    }

    function handlePointerMove(event: PointerEvent) {
        const { x, y } = logicalPosition(event)
        //x86's tablet takes the pixel the position is on, as QEMU does (`tabletAxis`)
        pointer.moveTo(x, y)
    }

    function handlePointerUp(event: PointerEvent) {
        keepHistoryButton(event)
        const button = buttonOf(event)
        const { x, y } = logicalPosition(event)
        if (canvas?.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId)
        if (!button) return
        press(button, false, x, y)
    }

    function handlePointerCancel(event: PointerEvent) {
        if (canvas?.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId)
        //the gesture was taken away mid-drag, so no button release is coming for it
        pointer.releaseAll()
    }

    /**
     * The wheel, in notches: a notch at a time to x86's tablet, and elsewhere to the Mouse, at the
     * pointer's position. The focused Screen keeps it from scrolling the page, which is why the
     * listener is not passive; unfocused, the wheel scrolls the page as it always does and the
     * program hears nothing of it, as with keys.
     */
    function handleWheel(event: WheelEvent) {
        if (!focused) return
        event.preventDefault()
        //`deltaMode` before `deltaY`: Firefox reports pixels to a page that reads `deltaY` first
        const deltaMode = event.deltaMode
        const delta = { deltaMode, deltaY: event.deltaY }
        if (x86Input) return x86Input.wheel(delta)
        const { x, y } = logicalPosition(event)
        mouse.wheel(wheelNotches(delta), x, y)
    }

    /**
     * The focused Screen owns the key: without stopping propagation the editor's window-level
     * shortcuts would fire too, and Shift+C would clear execution while a program is reading it
     * (ADR 0008). Ctrl and Meta combinations keep their browser default, which is also where the
     * Keyboard leaves them: they type nothing and stay with the host.
     *
     * Only a key down is stopped. Shortcuts fire on key down, while the project page keeps its own
     * map of the keys it has seen go down and empties it from a `window` key up: swallowing the
     * release of a key that was pressed before the Screen took focus would leave it in that map for
     * good, and the next `r` typed anywhere would run the program as Shift+R. The Keyboard ignores
     * the release of a key it never saw pressed, so nothing is lost by letting it bubble.
     */
    function routeKey(event: KeyboardEvent, stopShortcuts: boolean) {
        if (stopShortcuts) event.stopPropagation()
        if (!event.ctrlKey && !event.metaKey) event.preventDefault()
    }

    /** The key that gives the keyboard back to the page, on every Target: Shift+Tab. */
    function isReleaseKey(event: KeyboardEvent) {
        return event.code === 'Tab' && event.shiftKey
    }

    function handleKeyDown(event: KeyboardEvent) {
        //every other key belongs to the program while this panel has focus, Escape included, which
        //programs read (ADR 0008, 2026-11-03), so the release key is the one way back out for
        //someone working without a mouse. Shift+Tab is left to the browser, which moves the focus
        //back and so releases the Screen; the Shift that came first reached the program, and its
        //release comes with the focus loss, as on x86
        if (isReleaseKey(event)) return
        keys.keyDown(event)
        routeKey(event, true)
    }

    function handleKeyUp(event: KeyboardEvent) {
        keys.keyUp(event)
        routeKey(event, false)
    }

    function handlePaste(event: ClipboardEvent) {
        //evdev carries keys, not text: a paste has nowhere to go on x86
        if (x86Input) return
        const text = event.clipboardData?.getData('text')
        if (!text) return
        event.preventDefault()
        keyboard.typeText(text)
    }

    function releaseInput() {
        //a key or a button still held when the input goes elsewhere would stay down forever, since
        //the release event is delivered to whoever has focus now (ADR 0008)
        keyboard.releaseAll()
        mouse.releaseAll()
        x86Input?.releaseAll()
    }

    function handleBlur() {
        focused = false
        releaseInput()
    }

    $effect(() => {
        if (!windowRequested) return
        untrack(() => {
            if (!expanded) void toggleWindow()
            onWindowRequestAnswered?.()
        })
    })

    $effect(() => {
        if (!headerless || expanded || !onHeader) return
        const handTo = onHeader
        handTo({ info: windowInfo, actions: pageActions })
        return () => handTo(undefined)
    })

    $effect(() => {
        //tells the scheduler that somebody is painting this Screen, so its dirty flag is worth
        //shortening a slice for (ADR 0007); a Screen with no panel would stay dirty for ever
        return screen.watch()
    })

    $effect(() => {
        //the canvas is rebuilt whenever the Screen moves between the page and the floating window:
        //the cached context belongs to the element that went away, and the new one is blank
        if (!canvas) return
        context = null
        paintedVersion = -1
        return () => {
            //a removed element never fires its own blur, so anything held would stay down for ever
            focused = false
            releaseInput()
        }
    })

    $effect(() => {
        //added by hand, because only a listener that is not passive may keep the page from scrolling
        const target = canvas
        if (!target) return
        target.addEventListener('wheel', handleWheel, { passive: false })
        return () => target.removeEventListener('wheel', handleWheel)
    })

    $effect(() => {
        if (!expanded) return
        //the window's size comes from the viewport, so a resize has to give it back a place inside
        const onResize = () => placeWindow('right')
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    })

    $effect(() => {
        if (!expanded) return
        //a Screen of another size, from a Build or the program itself, Integer scaling turned on
        //or off, or another device pixel ratio, and the window hugs the Screen anew, its top right
        //corner where it was
        void [logicalWidth, logicalHeight, integerScaling, devicePixelRatio]
        untrack(() => placeWindow('right'))
    })

    $effect(() => {
        if (!expanded) return
        //Escape closes the floating window, but only once the Screen no longer holds the keyboard:
        //the focused canvas hands Escape to the program and stops it from propagating, so it never
        //reaches this listener; Shift+Tab releases the Screen first, and the next Escape closes it
        function closeOnEscape(event: KeyboardEvent) {
            if (event.code !== 'Escape') return
            expanded = false
        }
        window.addEventListener('keydown', closeOnEscape)
        return () => window.removeEventListener('keydown', closeOnEscape)
    })

    onMount(() => {
        let frame = requestAnimationFrame(function tick() {
            paint()
            frame = requestAnimationFrame(tick)
        })
        //the element keeps focus when the browser window loses it, so its own blur never fires
        window.addEventListener('blur', releaseInput)
        const readPixelRatio = () => (devicePixelRatio = window.devicePixelRatio)
        window.addEventListener('resize', readPixelRatio)
        return () => {
            cancelAnimationFrame(frame)
            window.removeEventListener('blur', releaseInput)
            window.removeEventListener('resize', readPixelRatio)
        }
    })
</script>

{#snippet actions()}
    {@render configuration?.()}
    {#if doubleBuffering}
        <Button
            kind="ghost"
            size="sm"
            class="screen-action"
            active={showingDrawingBuffer}
            aria-pressed={showingDrawingBuffer}
            {@attach tooltip(
                showingDrawingBuffer
                    ? 'Show the visible buffer again'
                    : 'Show the drawing buffer, the frame the program is composing'
            )}
            onClick={() => preferencesStore.setValue('showDrawingBuffer', !showingDrawingBuffer)}
        >
            <Icon size={0.8}>
                <FaLayerGroup />
            </Icon>
            {showingDrawingBuffer ? 'Drawing' : 'Visible'}
        </Button>
    {/if}
    <Button
        kind="ghost"
        size="sm"
        class="screen-action"
        active={integerScaling}
        aria-pressed={integerScaling}
        {@attach tooltip(
            integerScaling
                ? 'Integer scaling is on. Click to turn it off and fill the available space.'
                : 'Turn on integer scaling which improves text and line crispness.'
        )}
        onClick={() => (integerScaling = !integerScaling)}
    >
        <Icon size={0.8}>
            <FaTh />
        </Icon>
        {zoomLabel}
    </Button>
{/snippet}

<!-- the window's bar reads like the in-page header: what the screen IS on the left, next to the
     title, and what you can DO to it on the right, against the button that puts it back -->
{#snippet windowInfo()}
    <span class="screen-size">{logicalWidth} × {logicalHeight}</span>
{/snippet}

{#snippet windowActions()}
    {@render actions()}
{/snippet}

<!-- in the page the controls end with the one that takes the Screen out into a window -->
{#snippet pageActions()}
    {@render actions()}
    <IconButton
        size="sm"
        label="Open in a window"
        {@attach tooltip('Open the screen in a floating window')}
        onClick={toggleWindow}
    >
        <FaWindowMaximize />
    </IconButton>
{/snippet}

<!-- the stage is measured by its content box, so the canvas is never fitted into the stage's own
     padding: that is the room the focus ring is drawn in, inside the box that clips it. The
     viewport's padding is the rest of the frame, and the two add up to the same gap around the
     image whether the ring is showing or not -->
{#snippet stage()}
    <div class="screen-viewport">
        <div
            class="screen-stage"
            style={widthFitHeight > 0
                ? `min-height: calc(${widthFitHeight}px + 2 * var(--focus-ring));`
                : ''}
            bind:contentRect={stageBox}
        >
            <canvas
                bind:this={canvas}
                class:focused
                class:waiting
                width={logicalWidth}
                height={logicalHeight}
                style="width: {logicalWidth * zoom}px; height: {logicalHeight * zoom}px;"
                tabindex="0"
                data-program-screen
                aria-label="{name} screen, {focusHint.label}"
                title={focusHint.title}
                onfocus={() => (focused = true)}
                onblur={handleBlur}
                onkeydown={handleKeyDown}
                onkeyup={handleKeyUp}
                onpaste={handlePaste}
                onpointerdown={handlePointerDown}
                onpointermove={handlePointerMove}
                onpointerup={handlePointerUp}
                onpointercancel={handlePointerCancel}
                oncontextmenu={(e) => e.preventDefault()}
                onauxclick={(e) => e.preventDefault()}
                onmousedown={keepHistoryButton}
                onmouseup={keepHistoryButton}
            ></canvas>
        </div>
    </div>
{/snippet}

{#if expanded}
    <!-- a zero-sized fixed layer, so the window inside it is placed in viewport coordinates (which
         is what the draggable's own clamping assumes) without ever covering the page it floats on.
         Its z-index puts it over the page and over the floating Debug tools at 10, the window the
         program draws in being the one worth keeping in sight, and under everything the app opens
         *over* a page: a maximized side panel at 12, a tablet's backdrop at 11 (after it in the
         page, so in front) and its drawer at 12, the input prompt and the toasts at 20. The window
         has no backdrop and leaves the page interactive on purpose, so a panel the user just
         opened has to come out in front of it -->
    <div class="screen-window-layer">
        <ToggleableDraggable
            title={name}
            hiddenOnMobile={false}
            headerInfo={windowInfo}
            headerActions={windowActions}
            closeTitle="Put the screen back in the page"
            closeShortcut="Escape"
            onClose={toggleWindow}
            resizable
            minWidth={windowMinWidth}
            minHeight={windowMinHeight}
            onResizeEnd={snapResizedWindow}
            bind:left={windowLeft}
            bind:top={windowTop}
            bind:width={windowWidth}
            bind:height={windowHeight}
        >
            <div class="screen-panel screen-window">
                {@render stage()}
            </div>
        </ToggleableDraggable>
    </div>
{:else}
    <div class="screen-panel" {style}>
        {#if !headerless}
            <div class="screen-header">
                <Icon size={0.9}>
                    <FaDesktop />
                </Icon>
                <span class="screen-name ellipsis">{name}</span>
                <span class="screen-size">{logicalWidth} × {logicalHeight}</span>
                <div class="screen-actions">
                    {@render pageActions()}
                </div>
            </div>
        {/if}
        {@render stage()}
    </div>
{/if}

<style lang="scss">
    @use '../../../../styles/radius.scss' as *;

    .screen-panel {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        /* a host that squares its panels, the Workbench's Lines, squares this one too */
        border-radius: var(--panel-radius, 0.5rem);
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    .screen-header {
        display: flex;
        gap: 0.4rem;
        align-items: center;
        padding: 0.2rem 0.3rem 0.2rem 0.5rem;
        font-size: var(--fs-small);
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }

    .screen-name {
        font-weight: bold;
    }

    .screen-size {
        color: var(--hint);
        font-family: var(--font-mono);
    }

    .screen-actions {
        display: flex;
        gap: 0.3rem;
        align-items: center;
        margin-left: auto;
    }

    /* the bar's toggles, small ghost Buttons (D5) that keep the bar's height: a pressed one is the
       accent, as the drawing buffer shown in place of the visible one is */
    :global(.btn.ghost.sm.screen-action) {
        gap: 0.3rem;
        padding: 0.15rem 0.4rem;
    }

    /* only the frame the stage sits in; the stage's content box is the box the canvas is fitted
       to, and its padding is the focus ring's, so the frame is what is left of the gap around the
       image once the ring has its room */
    .screen-viewport {
        --focus-ring: 0.15rem;
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        padding: calc(0.3rem - var(--focus-ring));
    }

    /* the box the canvas is fitted to, never wider than the column it sits in: the Screen always
       fits it, so it clips, which also keeps a sub-pixel rounding from putting a scrollbar on it */
    .screen-stage {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        padding: var(--focus-ring);
        overflow: hidden;
    }

    /* the layer the floating window is dragged around in: no size of its own, so it never covers
       the page, and a positioned ancestor at viewport 0,0 so the window's coordinates are the
       viewport's, which is what the draggable's clamping already assumes */
    .screen-window-layer {
        position: fixed;
        top: 0;
        left: 0;
        width: 0;
        height: 0;
        z-index: 11;
    }

    /* the window's body: the draggable's own bar carries the title and the controls, so this is
       the stage alone, filling the box the container sizes from the viewport and its corner */
    .screen-panel.screen-window {
        height: 100%;
        /* inside the window's 1px edge, its curve parallel to the window's; the window is lifted
           by its own shadow */
        border-radius: 0 0 nested-radius(var(--r-overlay), $border: 1px)
            nested-radius(var(--r-overlay), $border: 1px);
    }

    canvas {
        margin: auto;
        /* logical pixels are meant to be seen as blocks, not smoothed into each other */
        image-rendering: pixelated;
        background-color: #000;
        outline: none;
    }

    /* The ring follows focus itself, not :focus-visible: a click is how most users hand the
       keyboard to the program, and they have to see that the editor's shortcuts are now off. It is
       drawn outside the canvas so it never covers a pixel, in the stage's padding: the stage clips
       in both containers, so that padding is the only room it has, and it is there whether the
       canvas has focus or not, so focusing it moves nothing. */
    canvas.focused {
        outline: var(--focus-ring) solid var(--accent);
    }

    /* the same room, dashed: the program waits for a key or the pointer, and the Screen does not
       have them yet */
    canvas.waiting {
        outline: var(--focus-ring) dashed var(--accent);
    }
</style>
