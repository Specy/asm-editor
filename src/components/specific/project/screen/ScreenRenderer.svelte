<script lang="ts">
    import { onMount, untrack, type Snippet } from 'svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaDesktop from '~icons/fa-solid/desktop'
    import FaExpand from '~icons/fa-solid/expand'
    import FaCompress from '~icons/fa-solid/compress'
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
        /** Where phase 7 hangs the MIPS and RISC-V display configuration popover. */
        configuration?: Snippet
    }

    let { screen, keyboard, mouse, name = 'Screen', style = '', configuration }: Props = $props()

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

    let context: CanvasRenderingContext2D | null = null
    let image: ImageData | null = null
    //-1 rather than 0: a Screen that has never changed is still at version 0 and must be painted once
    let paintedVersion = -1

    /**
     * Integer scaling while the Screen fits the panel, so a logical pixel stays a square block of
     * screen pixels; a fractional one only when the Screen is larger than the panel, where the
     * alternative is showing part of the image.
     */
    let zoom = $derived.by(() => {
        if (!fitToPanel) return 1
        if (viewportWidth <= 0 || viewportHeight <= 0) return 1
        const scale = Math.min(viewportWidth / logicalWidth, viewportHeight / logicalHeight)
        return scale >= 1 ? Math.floor(scale) : scale
    })

    let zoomLabel = $derived(zoom >= 1 ? `×${zoom}` : `${Math.round(zoom * 100)}%`)

    function paint() {
        if (!canvas) return
        if (canvas.width !== screen.width || canvas.height !== screen.height) {
            //the backing store is one texel per logical pixel; the zoom is CSS, so putImageData
            //never scales and the panel's size never costs the emulator anything
            canvas.width = screen.width
            canvas.height = screen.height
            logicalWidth = screen.width
            logicalHeight = screen.height
            //resizing a canvas clears it, so whatever was painted has to be painted again
            paintedVersion = -1
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
     */
    function routeKey(event: KeyboardEvent) {
        event.stopPropagation()
        if (!event.ctrlKey && !event.metaKey) event.preventDefault()
    }

    function handleKeyDown(event: KeyboardEvent) {
        //every other key belongs to the program while this panel has focus, so Escape is the one
        //way back out for someone working without a mouse
        if (event.code === 'Escape') {
            canvas?.blur()
            return
        }
        keyboard.keyDown(event)
        routeKey(event)
    }

    function handleKeyUp(event: KeyboardEvent) {
        if (event.code === 'Escape') return
        keyboard.keyUp(event)
        routeKey(event)
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

<div class="screen-panel" {style}>
    <div class="screen-header">
        <Icon size={0.9}>
            <FaDesktop />
        </Icon>
        <span class="screen-name ellipsis">{name}</span>
        <span class="screen-size">{logicalWidth} × {logicalHeight}</span>
        <div class="screen-actions">
            {@render configuration?.()}
            <button
                class="screen-zoom"
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
        </div>
    </div>
    <div
        class="screen-viewport"
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

    .screen-zoom {
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

    /* a scroll container, so the canvas never widens the column it sits in and an actual-size
       Screen larger than the panel can be reached by scrolling */
    .screen-viewport {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        padding: 0.3rem;
        overflow: auto;
    }

    canvas {
        margin: auto;
        /* logical pixels are meant to be seen as blocks, not smoothed into each other */
        image-rendering: pixelated;
        background-color: #000;
        outline: none;
    }

    /* the ring follows focus itself, not :focus-visible: a click is how most users hand the
       keyboard to the program, and they have to see that the editor's shortcuts are now off */
    canvas.focused {
        outline: 0.15rem solid var(--accent);
        outline-offset: 0.1rem;
    }
</style>
