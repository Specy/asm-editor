<script lang="ts">
    /**
     * A search box's query drawn a second time, under its field, with its Search modifiers in the
     * accent colour, in place in the text ([the design record](../../../../../docs/design/documentation-search.md),
     * Search modifiers). While it draws, the field's own text is transparent (`data-drawn-under`
     * on the field, which SearchField styles), so the caret and the selection stay the field's
     * own. It draws in the field's font, padding, letter spacing and indent, read from the field
     * itself, and follows the field's horizontal scroll. When the two measure differently, or while
     * an input method composes, it is hidden and the field draws its own text, unmarked: no marks
     * rather than misplaced ones. While text is selected the field draws its own text too, so the
     * selection is the browser's own (macOS keeps a selected text's own colour, which is
     * transparent here).
     *
     * The field takes the pointer, so this asks it where the pointer is and shows the Tooltip of the
     * mark under it, saying what that modifier did (`pointTooltip`). Not for a touch: on a phone
     * the colour stands alone. SearchField gives screen readers the same words.
     */
    import type { QueryMark } from '#lib/search/queryModifiers.ts'
    import { pointTooltip, tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'

    interface Props {
        /** The field it draws under, which it reads its look and its scroll from. */
        input: HTMLInputElement | undefined
        value: string
        /** The Search modifiers in `value`, from `readQuery`. */
        marks: QueryMark[]
    }

    let { input, value, marks }: Props = $props()

    /** What sets where the text's glyphs fall, copied from the field as it computes them. */
    const COPIED = [
        'font-family',
        'font-size',
        'font-weight',
        'font-style',
        'font-stretch',
        'font-variant',
        'font-feature-settings',
        'font-variation-settings',
        'font-kerning',
        'font-optical-sizing',
        'font-size-adjust',
        'letter-spacing',
        'word-spacing',
        'text-indent',
        'text-transform',
        'text-rendering',
        'line-height',
        'tab-size',
        'direction',
        'padding-top',
        'padding-right',
        'padding-bottom',
        'padding-left',
        'border-top-width',
        'border-right-width',
        'border-bottom-width',
        'border-left-width'
    ]
    /** How far, in pixels, the field's text and the drawn one may differ in width. */
    const SLACK = 2

    let layer = $state<HTMLElement>()
    let view = $state<HTMLElement>()
    let line = $state<HTMLElement>()
    let aligned = $state(true)
    let composing = $state(false)
    let selecting = $state(false)
    /** The mark the pointer is on, as last reported to its Tooltip. */
    let pointed: HTMLElement | null = null

    const parts = $derived.by(() => {
        const parts: { text: string; mark?: QueryMark }[] = []
        let at = 0
        for (const mark of marks) {
            if (mark.start > at) parts.push({ text: value.slice(at, mark.start) })
            parts.push({ text: value.slice(mark.start, mark.end), mark })
            at = mark.end
        }
        if (at < value.length) parts.push({ text: value.slice(at) })
        return parts
    })
    const drawing = $derived(marks.length > 0 && !composing && !selecting)
    const drawn = $derived(drawing && aligned)

    function copyLook() {
        if (!input || !layer) return
        const style = getComputedStyle(input)
        for (const property of COPIED) {
            layer.style.setProperty(property, style.getPropertyValue(property))
        }
    }

    /** Scrolled as the field is, and drawn only while the two texts are as wide. */
    function follow() {
        if (!input || !line) return
        line.style.translate = `${-input.scrollLeft}px`
        const style = getComputedStyle(input)
        const padding = (parseFloat(style.paddingLeft) || 0) + (parseFloat(style.paddingRight) || 0)
        const width = line.getBoundingClientRect().width
        //the field's scroll width is its text's only once the text overflows it
        aligned =
            input.scrollWidth > input.clientWidth
                ? Math.abs(input.scrollWidth - padding - width) <= SLACK
                : width <= input.clientWidth - padding + SLACK
    }

    function noteSelection() {
        if (!input) return
        selecting = document.activeElement === input && input.selectionStart !== input.selectionEnd
    }

    /** The caret moved or the selection changed: drawn again, or left to the field. */
    function refresh() {
        noteSelection()
        follow()
    }

    $effect(() => {
        void parts
        if (!layer || !line) return
        copyLook()
        follow()
    })

    //the field draws no text of its own while this draws it
    $effect(() => {
        const field = input
        if (!field) return
        field.toggleAttribute('data-drawn-under', drawn)
        return () => field.removeAttribute('data-drawn-under')
    })

    function markAt(x: number): HTMLElement | null {
        if (!drawn || !layer || !view) return null
        const shown = view.getBoundingClientRect()
        if (x < shown.left || x >= shown.right) return null
        for (const mark of layer.querySelectorAll<HTMLElement>('.mark')) {
            const { left, right } = mark.getBoundingClientRect()
            if (x >= left && x < right) return mark
        }
        return null
    }

    function point(mark: HTMLElement | null) {
        if (mark === pointed) return
        if (pointed) pointTooltip(pointed, false)
        pointed = mark
        if (mark) pointTooltip(mark, true)
    }

    /**
     * A press or a keystroke: the reader is using the field, and the explanation has done its work.
     * The card closes and stays closed while the pointer stays on the same mark.
     */
    function putAway() {
        if (pointed) pointTooltip(pointed, false)
    }

    $effect(() => {
        const field = input
        if (!field) return
        const onPointerMove = (event: PointerEvent) => {
            if (event.pointerType !== 'touch') point(markAt(event.clientX))
        }
        const onPointerLeave = (event: PointerEvent) => {
            if (event.pointerType !== 'touch') point(null)
        }
        const listeners: [string, (event: never) => void][] = [
            ['pointermove', onPointerMove],
            ['pointerleave', onPointerLeave],
            ['pointerdown', putAway],
            ['input', putAway],
            //typing replaced the selection; the text is drawn again once it is in the layer
            ['input', noteSelection],
            ['scroll', follow],
            ['scroll', putAway],
            ['select', refresh],
            ['selectionchange', refresh],
            ['keyup', refresh],
            ['pointerup', refresh],
            ['focus', refresh],
            ['blur', refresh],
            [
                'compositionstart',
                () => {
                    composing = true
                    putAway()
                }
            ],
            ['compositionend', () => (composing = false)]
        ]
        for (const [type, listener] of listeners) {
            field.addEventListener(type, listener as EventListener)
        }
        //a field that grows or shrinks (the palette opening, a panel resized) may scroll its text
        const resized =
            typeof ResizeObserver === 'undefined'
                ? null
                : new ResizeObserver(() => {
                      copyLook()
                      follow()
                  })
        resized?.observe(field)
        return () => {
            for (const [type, listener] of listeners) {
                field.removeEventListener(type, listener as EventListener)
            }
            resized?.disconnect()
            point(null)
        }
    })
</script>

{#if drawing}
    <!-- the field's text, which a screen reader has from the field itself -->
    <span class="query-marks" class:hidden={!aligned} aria-hidden="true" bind:this={layer}>
        <span class="view" bind:this={view}
            ><span class="line" bind:this={line}
                >{#each parts as part, index (index)}{#if part.mark}<span
                            class="mark"
                            {@attach tooltip(part.mark.label)}>{part.text}</span
                        >{:else}{part.text}{/if}{/each}</span
            ></span
        >
    </span>
{/if}

<style>
    /* the field's box, under it (the field is positioned after it), its edges and padding the
       field's, its line centred as the field centres its own */
    .query-marks {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        border: 0 solid transparent;
        pointer-events: none;
        user-select: none;
    }

    .query-marks.hidden {
        visibility: hidden;
    }

    /* the field's text box, which clips what is scrolled out of it */
    .view {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        white-space: pre;
    }

    .line {
        display: block;
        width: max-content;
    }

    .mark {
        color: var(--accent);
    }
</style>
