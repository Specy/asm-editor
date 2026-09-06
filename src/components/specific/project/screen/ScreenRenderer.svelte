<script lang="ts">
    import { onMount, tick, untrack, type Snippet } from 'svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaDesktop from '~icons/fa-solid/desktop'
    import FaExpand from '~icons/fa-solid/expand'
    import FaCompress from '~icons/fa-solid/compress'
    import FaWindowMaximize from '~icons/fa-solid/window-maximize'
    import ToggleableDraggable from '$cmp/shared/draggable/DraggableContainer.svelte'
    import { screenZoom, screenZoomLabel } from './screenZoom'
    import { screenWindowGeometry } from './screenWindow'
    import type { Screen } from '$lib/languages/peripherals/screen/Screen'
    import type { Keyboard } from '$lib/languages/peripherals/Keyboard'
    import type { Mouse, MouseButton } from '$lib/languages/peripherals/Mouse'

    /**
     * The Screen panel: the canvas a program's graphical output is painted on, and the only place
     * the Keyboard and Mouse peripherals receive input
     * ([ADR 0008](../../../../../docs/adr/0008-poll-keyboard-and-mouse-input.md)).
     *
     * The Screen is plain TypeScript with no runes, so nothing here can react to it: the canvas is
     * repainted from an animation frame that compares the Screen's version counter, the upstream
     * TRS-80 pattern that keeps the machine from ever waiting for a frame
     * ([ADR 0006](../../../../../docs/adr/0006-screen-double-buffering.md)).
     */

    interface Props {
        screen: Screen
        keyboard: Keyboard
        mouse: Mouse
        /** The environment this Screen belongs to, shown in the header. */
        name?: string
        style?: string
        /** The MIPS and RISC-V display configuration popover, rendered in the header. */
        configuration?: Snippet
        /**
         * What the zoom toggle's actual-size position means. MIPS and RISC-V pass MARS's unit
         * width, whose whole point is how many screen pixels one memory word covered there, so
         * turning the fit off reproduces the tool's own geometry; everything else draws in Screen
         * pixels and leaves it at 1.
         */
        actualSizeZoom?: number
    }

    let {
        screen,
        keyboard,
        mouse,
        name = 'Screen',
        style = '',
        configuration,
        actualSizeZoom = 1
    }: Props = $props()

    const MOUSE_BUTTONS: Record<number, MouseButton> = { 0: 'left', 1: 'middle', 2: 'right' }

    let canvas: HTMLCanvasElement | undefined = $state()
    let viewportWidth = $state(0)
    let viewportHeight = $state(0)
    //the Screen has no runes, so the GUI mirrors what the frame loop reads from it; the values
    //here are only the seed for the first frame
    let logicalWidth = $state(untrack(() => screen.width))
    let logicalHeight = $state(untrack(() => screen.height))
    let fitToPanel = $state(true)
    let focused = $state(false)
    //the floating window is another container for the same canvas, never a second panel: the
    //component that calls `screen.watch()` has to stay mounted exactly once, or the scheduler
    //counts two painters (ADR 0007)
    let expanded = $state(false)
    let windowLeft = $state(0)
    let windowTop = $state(0)
    let windowWidth = $state(0)
    let windowHeight = $state(0)

    let context: CanvasRenderingContext2D | null = null
    let image: ImageData | null = null
    //-1 rather than 0: a Screen that has never changed is still at version 0 and must be painted once
    let paintedVersion = -1

    let zoom = $derived(
        screenZoom({
            fit: fitToPanel,
            viewportWidth,
            viewportHeight,
            logicalWidth,
            logicalHeight,
            actualSizeZoom
        })
    )

    let zoomLabel = $derived(screenZoomLabel(fitToPanel, zoom))

    /**
     * The window's box comes from the viewport (`screenWindow.ts`), because a box the user drags
     * cannot be written as CSS insets the way the in-page panel's height is.
     */
    function fitWindowToViewport(place: 'keep' | 'top right') {
        const root = parseFloat(getComputedStyle(document.documentElement).fontSize)
        const box = screenWindowGeometry({
            viewportWidth: window.innerWidth,
            viewportHeight: window.innerHeight,
            rootFontSize: root,
            left: place === 'keep' ? windowLeft : undefined,
            top: place === 'keep' ? windowTop : undefined
        })
        windowLeft = box.left
        windowTop = box.top
        windowWidth = box.width
        windowHeight = box.height
    }

    async function toggleWindow() {
        const wasFocused = focused
        //opening always starts at the top right, whatever the last drag left behind
        if (!expanded) fitWindowToViewport('top right')
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
        if (paintedVersion === screen.version) return
        context ??= canvas.getContext('2d')
        if (!context) return
        //ImageData wraps the Screen's own array instead of copying it, so it is only rebuilt when
        //that array is replaced: a Build, a resize or a double-buffering change
        if (
            !image ||
            image.data !== screen.visiblePixels ||
            image.width !== screen.width ||
            image.height !== screen.height
        ) {
            //the Screen allocates its images itself, so their buffers are the plain ArrayBuffers
            //the DOM's ImageDataArray asks for
            const pixels = screen.visiblePixels as Uint8ClampedArray<ArrayBuffer>
            image = new ImageData(pixels, screen.width, screen.height)
        }
        context.putImageData(image, 0, 0)
        paintedVersion = screen.version
        //the scheduler shortens its slices while the Screen is dirty (ADR 0007), so telling it the
        //frame reached the GUI is what lets a compute-only run go back to long slices
        screen.markPainted()
    }

    function logicalPosition(event: PointerEvent) {
        const rect = canvas?.getBoundingClientRect()
        if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
        //logical pixels, independent of the GUI zoom; the Mouse floors and clamps them, which is
        //where "coordinates never leave the Screen" lives (ADR 0008)
        return {
            x: ((event.clientX - rect.left) * screen.width) / rect.width,
            y: ((event.clientY - rect.top) * screen.height) / rect.height
        }
    }

    function handlePointerDown(event: PointerEvent) {
        const button = MOUSE_BUTTONS[event.button]
        if (!button) return
        //keeps the browser's gestures off the Screen: text selection, the drag image, and the
        //middle-click autoscroll that would otherwise steal the button from the program
        event.preventDefault()
        //preventDefault also cancels the focus a pointer down would have given the canvas
        canvas?.focus()
        const { x, y } = logicalPosition(event)
        //a drag that started inside keeps reporting until the button comes back up, wherever the
        //pointer goes (ADR 0008)
        canvas?.setPointerCapture(event.pointerId)
        mouse.buttonDown(button, x, y)
    }

    function handlePointerMove(event: PointerEvent) {
        const { x, y } = logicalPosition(event)
        mouse.moveTo(x, y)
    }

    function handlePointerUp(event: PointerEvent) {
        const button = MOUSE_BUTTONS[event.button]
        const { x, y } = logicalPosition(event)
        if (canvas?.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId)
        if (!button) return
        mouse.buttonUp(button, x, y)
    }

    function handlePointerCancel(event: PointerEvent) {
        if (canvas?.hasPointerCapture(event.pointerId))
            canvas.releasePointerCapture(event.pointerId)
        //the gesture was taken away mid-drag, so no button release is coming for it
        mouse.releaseAll()
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

    function handleKeyDown(event: KeyboardEvent) {
        //every other key belongs to the program while this panel has focus, so Escape is the one
        //way back out for someone working without a mouse. It is the panel's own gesture and the
        //page must not see it either: a user who binds an action to Escape would otherwise trigger
        //it from a focused Screen, which ADR 0008 forbids
        if (event.code === 'Escape') {
            event.stopPropagation()
            canvas?.blur()
            return
        }
        keyboard.keyDown(event)
        routeKey(event, true)
    }

    function handleKeyUp(event: KeyboardEvent) {
        if (event.code === 'Escape') return
        keyboard.keyUp(event)
        routeKey(event, false)
    }

    function handlePaste(event: ClipboardEvent) {
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
    }

    function handleBlur() {
        focused = false
        releaseInput()
    }

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
        if (!expanded) return
        //the window's size comes from the viewport, so a resize has to give it back a place inside
        const onResize = () => fitWindowToViewport('keep')
        window.addEventListener('resize', onResize)
        return () => window.removeEventListener('resize', onResize)
    })

    $effect(() => {
        if (!expanded) return
        //Escape closes the floating window, but only once the Screen no longer holds the keyboard:
        //the canvas stops its own Escape from propagating, so the first press releases the input
        //(ADR 0008's way out of a focused Screen) and the next one reaches this listener
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
        return () => {
            cancelAnimationFrame(frame)
            window.removeEventListener('blur', releaseInput)
        }
    })
</script>

{#snippet actions()}
    {@render configuration?.()}
    <button
        class="screen-action"
        title={fitToPanel ? 'Show at actual size' : 'Zoom to fit the panel'}
        onclick={() => (fitToPanel = !fitToPanel)}
    >
        <Icon size={0.8}>
            {#if fitToPanel}
                <FaExpand />
            {:else}
                <FaCompress />
            {/if}
        </Icon>
        {zoomLabel}
    </button>
{/snippet}

<!-- the window's bar reads like the in-page header: what the screen IS on the left, next to the
     title, and what you can DO to it on the right, against the button that puts it back -->
{#snippet windowInfo()}
    <span class="screen-size">{logicalWidth} × {logicalHeight}</span>
{/snippet}

{#snippet windowActions()}
    {@render actions()}
{/snippet}

<!-- the padding is a frame around the stage rather than padding on it, because the stage is what
     is measured: `clientWidth` counts padding, and fitting to a box that is larger than the box
     the canvas actually has is what used to spill the image into a scrollbar -->
{#snippet stage()}
    <div class="screen-viewport">
        <div
            class="screen-stage"
            class:fitting={fitToPanel}
            bind:clientWidth={viewportWidth}
            bind:clientHeight={viewportHeight}
        >
            <canvas
                bind:this={canvas}
                class:focused
                width={logicalWidth}
                height={logicalHeight}
                style="width: {logicalWidth * zoom}px; height: {logicalHeight * zoom}px;"
                tabindex="0"
                aria-label="{name} screen, click to send keyboard and mouse input to the program"
                title="Click to send keyboard and mouse input to the program, Esc to release it"
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
            ></canvas>
        </div>
    </div>
{/snippet}

{#if expanded}
    <!-- a zero-sized fixed layer, so the window inside it is placed in viewport coordinates (which
         is what the draggable's own clamping assumes) without ever covering the page it floats on.
         Its z-index puts it over the page — the editor is 2 and the sidebars are 3 — and under
         everything the app opens *over* a page: the Settings, Documentation and Share drawers at 5,
         the input prompt and the toasts at 20. The window has no backdrop and leaves the page
         interactive on purpose, so a drawer the user just opened has to come out in front of it -->
    <div class="screen-window-layer">
        <ToggleableDraggable
            title={name}
            hiddenOnMobile={false}
            headerInfo={windowInfo}
            headerActions={windowActions}
            closeTitle="Put the screen back in the page (Esc)"
            onClose={toggleWindow}
            bind:left={windowLeft}
            bind:top={windowTop}
        >
            <div
                class="screen-panel screen-window"
                style="width: {windowWidth}px; height: {windowHeight}px;"
            >
                {@render stage()}
            </div>
        </ToggleableDraggable>
    </div>
{:else}
    <div class="screen-panel" {style}>
        <div class="screen-header">
            <Icon size={0.9}>
                <FaDesktop />
            </Icon>
            <span class="screen-name ellipsis">{name}</span>
            <span class="screen-size">{logicalWidth} × {logicalHeight}</span>
            <div class="screen-actions">
                {@render actions()}
                <button
                    class="screen-action"
                    title="Open the screen in a floating window"
                    onclick={toggleWindow}
                >
                    <Icon size={0.8}>
                        <FaWindowMaximize />
                    </Icon>
                </button>
            </div>
        </div>
        {@render stage()}
    </div>
{/if}

<style lang="scss">
    .screen-panel {
        display: flex;
        flex-direction: column;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        border-radius: 0.5rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
    }

    .screen-header {
        display: flex;
        gap: 0.4rem;
        align-items: center;
        padding: 0.2rem 0.3rem 0.2rem 0.5rem;
        font-size: 0.9rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }

    .screen-name {
        font-weight: bold;
    }

    .screen-size {
        color: var(--hint);
        font-family: monospace;
    }

    .screen-actions {
        display: flex;
        gap: 0.3rem;
        align-items: center;
        margin-left: auto;
    }

    .screen-action {
        display: flex;
        gap: 0.3rem;
        align-items: center;
        padding: 0.15rem 0.4rem;
        border: none;
        border-radius: 0.2rem;
        font-family: Rubik;
        font-size: 0.8rem;
        color: inherit;
        background-color: var(--secondary);
        cursor: pointer;

        &:hover {
            filter: brightness(1.2);
        }
    }

    /* only the frame the stage sits in; the stage is the box the canvas is fitted to */
    .screen-viewport {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        padding: 0.3rem;
    }

    /* a scroll container, so the canvas never widens the column it sits in and an actual-size
       Screen larger than the panel can be reached by scrolling */
    .screen-stage {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        overflow: auto;
    }

    /* a fitted Screen is exactly as large as this box, so there is nothing to scroll to; hiding it
       also keeps a sub-pixel rounding from putting a scrollbar on a panel that fits */
    .screen-stage.fitting {
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
        z-index: 4;
    }

    /* the window's body: the draggable's own bar carries the title and the controls, so this is
       the stage alone, and its size is set from the viewport when the window opens */
    .screen-panel.screen-window {
        border-radius: 0 0 0.4rem 0.4rem;
        box-shadow: 0 0.5rem 2rem rgba(0, 0, 0, 0.45);
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
       drawn *inside* the canvas, because the stage around it is a clipping box in both containers —
       hidden while fitting, a scroll container at actual size — and an outward ring loses its
       outer half to it. The alternative was room to draw it in, which is padding the panel has
       nowhere to take from without shrinking the image. */
    canvas.focused {
        outline: 0.15rem solid var(--accent);
        outline-offset: -0.15rem;
    }
</style>
