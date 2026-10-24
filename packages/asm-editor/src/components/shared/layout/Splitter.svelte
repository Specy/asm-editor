<script lang="ts">
    /**
     * The handle between two panes that resizes one of them: dragged with the pointer, or moved with
     * the arrow keys once focused. The size it changes belongs to one pane, the one this handle
     * borders; `direction` says whether moving the handle towards the end (right, or down) grows
     * that pane (`1`, a pane before the handle) or shrinks it (`-1`, a pane after it).
     *
     * Given `onCollapse`, the pane can also collapse to a strip of its own. A drag that takes it
     * below `collapseBelow` collapses it, back at the size it had when the drag began, so opening it
     * again restores that: its automatic size (`onReset`) when it had that (`automatic`). A drag
     * from the strip past `collapseBelow` opens it at the pointer.
     * Enter collapses or opens it from the keyboard, as the WAI-ARIA window splitter's does, and
     * the arrow that grows the pane opens it too. A collapsed pane reads as size 0.
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
        /** Whether the pane has its automatic size, which `size` only measures. */
        automatic?: boolean
        /** Whether the pane is collapsed to its strip; only read with `onCollapse`. */
        collapsed?: boolean
        /** The size a drag collapses the pane below, which defaults to half of `min`. */
        collapseBelow?: number
        /** The pane collapsing (`true`) or opening again (`false`). */
        onCollapse?: (collapsed: boolean) => void
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
        automatic = false,
        collapsed = false,
        collapseBelow,
        onCollapse,
        style = ''
    }: Props = $props()

    let dragging = $state(false)
    let origin = 0
    let startSize = 0
    let startedAutomatic = false
    const isCollapsed = $derived(!!onCollapse && collapsed)

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
        startSize = isCollapsed ? 0 : size
        startedAutomatic = !isCollapsed && automatic
        //capture keeps the drag going over Monaco and over panes that would take the events
        ;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
    }

    function onpointermove(event: PointerEvent) {
        if (!dragging) return
        const pointed = startSize + (position(event) - origin) * direction
        if (onCollapse) {
            if (pointed < (collapseBelow ?? min / 2)) {
                if (isCollapsed) return
                //the sizes the drag went through on its way down are not the pane's to keep, and
                //an automatic size it began at stays automatic, rather than becoming its measure
                if (startedAutomatic && onReset) onReset()
                else if (startSize && size !== startSize) onResize(startSize)
                onCollapse(true)
                return
            }
            if (isCollapsed) onCollapse(false)
        }
        const next = clamp(pointed)
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
        if (onCollapse) {
            //collapsed, the handle only opens the pane again: with Enter, or the arrow that grows it
            const grows = event.key === (direction === 1 ? after : before)
            if (event.key === 'Enter' || (isCollapsed && grows)) {
                event.preventDefault()
                event.stopPropagation()
                onCollapse(!isCollapsed)
                return
            }
            if (isCollapsed) return
        }
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
    aria-valuenow={isCollapsed ? 0 : Math.round(size)}
    aria-valuemin={onCollapse ? 0 : min}
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

        &::after {
            content: '';
            position: absolute;
            top: 50%;
            left: 50%;
            width: 2px;
            height: 2px;
            border-radius: 50%;
            background-color: currentColor;
            color: var(--background-text);
            opacity: 0.4;
            transform: translate(-50%, -50%);
            pointer-events: none;
            transition: opacity 0.15s;
        }

        &:hover,
        &.dragging,
        &:focus-visible {
            background-color: var(--accent);

            &::after {
                color: var(--accent-text);
                opacity: 1;
            }
        }
    }

    .vertical {
        width: var(--splitter-size, 0.4rem);
        cursor: col-resize;

        &::before {
            inset: 0 -0.2rem;
        }

        &::after {
            box-shadow:
                0 -5px 0 currentColor,
                0 5px 0 currentColor;
        }
    }

    .horizontal {
        height: var(--splitter-size, 0.4rem);
        cursor: row-resize;

        &::before {
            inset: -0.2rem 0;
        }

        &::after {
            box-shadow:
                -5px 0 0 currentColor,
                5px 0 0 currentColor;
        }
    }
</style>
