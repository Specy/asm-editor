<script lang="ts">
    import { clamp, createDebouncer } from '$lib/utils'

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
    }

    function onMouseMove(e: PointerEvent) {
        if (moving) {
            left += e.movementX
            top += e.movementY
            if (clampPosition) {
                top = clamp(top, 6, window.innerHeight - bounds.height - 6)
                left = clamp(left, 6, window.innerWidth - bounds.width - 6)
            }
        }
    }
</script>

<div
    style={`left: ${left}px; top: ${top}px; --hidden-on-mobile: ${hiddenOnMobile ? 'none' : 'block'}`}
    class="draggable"
    bind:this={ref}
>
    <div class="row" onpointerdown={onPointerDown} style="cursor: move; user-select: none;">
        {@render header?.()}
    </div>
    {@render children?.()}
</div>

<svelte:window onpointerup={() => (moving = false)} onpointermove={onMouseMove} />

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
