<script lang="ts">
    /**
     * The handle between two panes that resizes one of them: dragged with the pointer, or moved with
     * the arrow keys once focused. The size it changes belongs to one pane, the one this handle
     * borders; `direction` says whether moving the handle towards the end (right, or down) grows
     * that pane (`1`, a pane before the handle) or shrinks it (`-1`, a pane after it).
     */
    interface Props {
        /** `vertical` sits between side-by-side panes; `horizontal` between stacked ones. */
        orientation: 'vertical' | 'horizontal'
        /** The pane's size in pixels. */
        size: number
        min: number
        max: number
        direction?: 1 | -1
        /** What the handle resizes, for assistive technology ("Resize the side panel"). */
        label: string
        /** Pixels one arrow key press moves the handle. */
        step?: number
        /** Every change while dragging or typing. */
        onResize: (size: number) => void
        /** The size once a drag is released or a key moved it, which is when it is worth keeping. */
        onCommit?: (size: number) => void
        /** A double click, for going back to the automatic size. */
        onReset?: () => void
        style?: string
    }

    let {
        orientation,
        size,
        min,
        max,
        direction = 1,
        label,
        step = 16,
        onResize,
        onCommit,
        onReset,
        style = ''
    }: Props = $props()

    let dragging = $state(false)
    let origin = 0
    let startSize = 0

    function clamp(value: number) {
        return Math.round(Math.min(max, Math.max(min, value)))
    }

    function position(event: PointerEvent) {
        return orientation === 'vertical' ? event.clientX : event.clientY
    }

    function onpointerdown(event: PointerEvent) {
        if (event.button !== 0) return
        event.preventDefault()
        dragging = true
        origin = position(event)
        startSize = size
        //capture keeps the drag going over Monaco and over panes that would take the events
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    }

    function onpointermove(event: PointerEvent) {
        if (!dragging) return
        const next = clamp(startSize + (position(event) - origin) * direction)
        if (next !== size) onResize(next)
    }

    function finish(event: PointerEvent) {
        if (!dragging) return
        dragging = false
        ;(event.currentTarget as HTMLElement).releasePointerCapture?.(event.pointerId)
        onCommit?.(size)
    }

    function onkeydown(event: KeyboardEvent) {
        const [before, after] =
            orientation === 'vertical' ? ['ArrowLeft', 'ArrowRight'] : ['ArrowUp', 'ArrowDown']
        let next: number | undefined
        if (event.key === before) next = clamp(size - step * direction)
        else if (event.key === after) next = clamp(size + step * direction)
        else if (event.key === 'Home') next = min
        else if (event.key === 'End') next = max
        if (next === undefined) return
        event.preventDefault()
        //the Workbench's own shortcuts must not see keys that moved the handle
        event.stopPropagation()
        if (next !== size) onResize(next)
        onCommit?.(next)
    }
</script>

<!-- A focusable separator with a value is the WAI-ARIA window splitter, an interactive widget; the
     a11y rules only know the static separator, which is why they are quietened here. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
<div
    class="splitter {orientation}"
    class:dragging
    role="separator"
    aria-orientation={orientation}
    aria-label={label}
    aria-valuenow={Math.round(size)}
    aria-valuemin={min}
    aria-valuemax={max}
    tabindex="0"
    {style}
    {onpointerdown}
    {onpointermove}
    onpointerup={finish}
    onpointercancel={finish}
    {onkeydown}
    ondblclick={() => onReset?.()}
></div>

<style lang="scss">
    .splitter {
        position: relative;
        flex: none;
        z-index: 2;
        touch-action: none;
        outline: none;
        background-color: var(--splitter-line, transparent);
        transition: background-color 0.15s;

        //the visible handle is thin; the pointer gets a few pixels more on each side
        &::before {
            content: '';
            position: absolute;
        }

        &:hover,
        &.dragging,
        &:focus-visible {
            background-color: var(--accent);
        }
    }

    .vertical {
        width: var(--splitter-size, 0.4rem);
        cursor: col-resize;

        &::before {
            inset: 0 -0.2rem;
        }
    }

    .horizontal {
        height: var(--splitter-size, 0.4rem);
        cursor: row-resize;

        &::before {
            inset: -0.2rem 0;
        }
    }
</style>
