<script lang="ts">
    import { clamp } from '#lib/utils.ts'
    import { createDebouncer } from '#lib/debounce.ts'

    let ref: HTMLElement | undefined = $state()

    interface Props {
        left?: number
        top?: number
        hiddenOnMobile?: boolean
        clampPosition?: boolean
        header?: import('svelte').Snippet
        children?: import('svelte').Snippet
    }

    let {
        left = $bindable(300),
        top = $bindable(16),
        hiddenOnMobile = false,
        clampPosition = true,
        header,
        children
    }: Props = $props()

    let moving = $state(false)
    //where the pointer was at the last move: a touch pointer's own movementX and movementY are not
    //filled in by every browser, so the distance is measured from its positions instead
    let lastX = 0
    let lastY = 0
    let bounds: DOMRect = new DOMRect(0, 0, 0, 0)
    const [debouncer] = createDebouncer(100)
    let observer = new ResizeObserver(() =>
        debouncer(() => {
            if (!ref) return
            bounds = ref.getBoundingClientRect()
        })
    )
    $effect(() => {
        observer.disconnect()
        if (ref) observer.observe(ref)
    })
    function onPointerDown(e: PointerEvent) {
        //a control a caller put in the header bar is not a drag handle: pressing it must work the
        //button, not pick the window up
        if (e.target instanceof Element && e.target.closest('[data-no-drag]')) return
        moving = true
        lastX = e.clientX
        lastY = e.clientY
    }

    /**
     * The gap a drag keeps between the window and the viewport's edges, for the room the window
     * leaves across one axis: it shrinks for a window too large to keep it on both sides, so one
     * as large as the viewport stays inside it rather than being pushed past an edge.
     */
    function edge(room: number) {
        return clamp(room / 2, 0, 6)
    }

    function onMouseMove(e: PointerEvent) {
        if (moving) {
            left += e.clientX - lastX
            top += e.clientY - lastY
            lastX = e.clientX
            lastY = e.clientY
            if (clampPosition) {
                const roomY = window.innerHeight - bounds.height
                const roomX = window.innerWidth - bounds.width
                top = clamp(top, edge(roomY), roomY - edge(roomY))
                left = clamp(left, edge(roomX), roomX - edge(roomX))
            }
        }
    }
</script>

<div
    style={`left: ${left}px; top: ${top}px; --hidden-on-mobile: ${hiddenOnMobile ? 'none' : 'block'}`}
    class="draggable"
    bind:this={ref}
>
    <!-- `touch-action: none`: a finger on the bar drags the window, where the browser would
         otherwise take the gesture over for scrolling a moment in and cancel the drag -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
        class="row"
        onpointerdown={onPointerDown}
        style="cursor: move; user-select: none; touch-action: none;"
    >
        {@render header?.()}
    </div>
    {@render children?.()}
</div>

<svelte:window
    onpointerup={() => (moving = false)}
    onpointercancel={() => (moving = false)}
    onpointermove={onMouseMove}
/>

<style>
    .draggable {
        position: absolute;
        z-index: 10;
    }
    /* a pointer that cannot hover is a touch screen, where a window dragged with a grip is a poor
       gesture: a caller says whether its panel is worth keeping there. `block` rather than any
       other box, because that is what the element is outside this query */
    @media (hover: none) {
        .draggable {
            display: var(--hidden-on-mobile);
        }
    }
</style>
