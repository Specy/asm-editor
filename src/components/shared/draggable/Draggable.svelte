<script lang="ts">
    import { run } from 'svelte/legacy'

    import { clamp, createDebouncer } from '$lib/utils'

    let ref: HTMLElement = $state()

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
    style={`left: ${left}px; top: ${top}px; --hidden-on-mobile: ${hiddenOnMobile ? 'none' : 'flex'}`}
    class="draggable"
    bind:this={ref}
>
    <div class="row" onpointerdown={() => (moving = true)} style="cursor: move; user-select: none;">
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
    @media (hover: none) {
        .draggable {
            display: var(--hidden-on-mobile);
        }
    }
</style>
