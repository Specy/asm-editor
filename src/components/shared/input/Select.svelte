<script lang="ts" generics="T">
    /**
     * A select styled like the rest of the app's inputs, built on the ARIA select-only combobox
     * pattern rather than a native `<select>`, whose popup cannot be themed.
     *
     * The public API is the native one this replaced — `options`, a bindable `value`, `title`,
     * `style`, `wrapperStyle`, `onChange`, and `disabled` on an option — plus an `item` snippet for
     * rows that want more than a line of text. What a native select gives for free is
     * re-implemented here on purpose: keyboard opening and navigation, Home and End, type ahead,
     * Escape to close without committing, a click outside to dismiss, disabled options skipped
     * rather than merely unclickable, and the label tied to the control. Focus stays on the button
     * and `aria-activedescendant` names the option under the cursor, which is what lets a screen
     * reader follow the highlight without moving focus into the list — and what lets the list live
     * somewhere else in the DOM without breaking the relationship.
     *
     * The list stays where it is written and is positioned `fixed`. An absolutely positioned popup
     * is part of its container's scrollable overflow, so opening one near the bottom of a page grows
     * the document and the body gains a scrollbar; a native select's popup is drawn outside the
     * document and never does that. Fixed takes it out of the scroll box, and `place()` anchors it
     * to the control, flips it above when there is more room there, and caps its height to the space
     * on the side it landed, so it is never larger than the viewport and never extends the page.
     *
     * Fixed resolves against the viewport unless an ancestor has a `transform`, `filter`,
     * `perspective`, `contain` or `will-change`, which would make that ancestor its containing block
     * and leave the list mispositioned. No layout component this is used inside sets one today.
     */
    import { tick, type Snippet } from 'svelte'
    import { cubicOut } from 'svelte/easing'

    type SelectOption = {
        key: string | number
        value: T
        disabled?: boolean
    }

    interface Props {
        options: SelectOption[]
        value: T
        style?: string
        title?: string
        wrapperStyle?: string
        onChange?: (value: T) => void
        /** Renders one row. Without it a row is its `key`, which is what a native select shows. */
        item?: Snippet<[SelectOption, { selected: boolean; active: boolean }]>
    }

    let {
        options,
        value = $bindable(),
        style = '',
        title = '',
        wrapperStyle = '',
        onChange,
        item
    }: Props = $props()

    //SSR safe and unique per instance, so the ids survive hydration
    const instance = $props.id()
    const listId = `${instance}-list`
    const labelId = `${instance}-label`
    const optionId = (index: number) => `${instance}-option-${index}`

    /** How close to the viewport edge the list is allowed to get. */
    const MARGIN = 8

    let open = $state(false)
    let activeIndex = $state(-1)
    let button = $state<HTMLButtonElement | null>(null)
    let list = $state<HTMLUListElement | null>(null)
    let placement = $state({ top: 0, left: 0, width: 0, maxHeight: 0, openUp: false })

    const selectedIndex = $derived(options.findIndex((option) => option.value === value))
    const label = $derived(options[selectedIndex]?.key ?? '')

    function selectable(index: number) {
        return index >= 0 && index < options.length && !options[index].disabled
    }

    /** The next selectable option in `direction`, or the current one when there is none. */
    function step(from: number, direction: 1 | -1) {
        for (let i = from + direction; i >= 0 && i < options.length; i += direction) {
            if (selectable(i)) return i
        }
        return selectable(from) ? from : -1
    }

    function edge(direction: 1 | -1) {
        return direction === 1 ? step(-1, 1) : step(options.length, -1)
    }

    /**
     * Puts the list under the control, or over it when the room below is both too small and smaller
     * than the room above, and caps its height to whichever side it landed on. Runs on open and on
     * every scroll and resize while open, so the list tracks the control the way a native popup does.
     */
    function place() {
        if (!button) return
        const rect = button.getBoundingClientRect()
        const below = window.innerHeight - rect.bottom - MARGIN
        const above = rect.top - MARGIN
        const wanted = list?.scrollHeight ?? 0
        const openUp = below < Math.min(wanted, 160) && above > below

        placement = {
            left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - rect.width - MARGIN)),
            width: rect.width,
            top: openUp
                ? Math.max(MARGIN, rect.top - Math.min(wanted, above) - 4)
                : rect.bottom + 4,
            maxHeight: Math.max(80, openUp ? above : below),
            openUp
        }
    }

    async function openList(startAt = selectedIndex) {
        open = true
        activeIndex = selectable(startAt) ? startAt : edge(1)
        await tick()
        //once with the measured height, since scrollHeight is only knowable after the first render
        place()
        await tick()
        place()
        scrollActiveIntoView()
    }

    function closeList() {
        open = false
        activeIndex = -1
    }

    /**
     * Grows out of the control and shrinks back into it, from whichever edge it opened against.
     * Short on purpose: this sits between a click and a choice, so it has to stay out of the way.
     * Reduced motion collapses the duration rather than skipping the transition, so the open and
     * close paths stay identical.
     */
    function popup(_node: HTMLElement, { duration = 130 }: { duration?: number } = {}) {
        const reduced =
            typeof window !== 'undefined' &&
            window.matchMedia('(prefers-reduced-motion: reduce)').matches
        const from = placement.openUp ? 4 : -4
        return {
            duration: reduced ? 0 : duration,
            easing: cubicOut,
            css: (t: number) =>
                `opacity: ${t}; transform: translateY(${(1 - t) * from}px) scaleY(${0.94 + 0.06 * t});`
        }
    }

    function commit(index: number) {
        //the list is still on screen while it animates away; a click landing then chooses nothing
        if (!open) return
        if (!selectable(index)) return
        value = options[index].value
        onChange?.(options[index].value)
        closeList()
        button?.focus()
    }

    function scrollActiveIntoView() {
        if (activeIndex < 0) return
        list?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({
            block: 'nearest'
        })
    }

    async function moveTo(index: number) {
        activeIndex = index
        await tick()
        scrollActiveIntoView()
    }

    /** Type ahead: letters typed close together jump to the option that starts with them. */
    let typed = ''
    let typedAt = 0
    function typeahead(character: string) {
        const now = Date.now()
        typed = now - typedAt < 600 ? typed + character : character
        typedAt = now
        const match = options.findIndex(
            (option, index) =>
                selectable(index) && String(option.key).toLowerCase().startsWith(typed)
        )
        if (match === -1) return
        if (open) moveTo(match)
        else commit(match)
    }

    function onKeyDown(event: KeyboardEvent) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault()
                if (open) moveTo(step(activeIndex, 1))
                else openList()
                return
            case 'ArrowUp':
                event.preventDefault()
                if (open) moveTo(step(activeIndex, -1))
                else openList()
                return
            case 'Home':
                if (!open) return
                event.preventDefault()
                moveTo(edge(1))
                return
            case 'End':
                if (!open) return
                event.preventDefault()
                moveTo(edge(-1))
                return
            case 'Enter':
            case ' ':
                event.preventDefault()
                if (open) commit(activeIndex)
                else openList()
                return
            case 'Escape':
                if (!open) return
                event.preventDefault()
                closeList()
                return
            case 'Tab':
                //a combobox commits nothing on the way out, the way a native one does not either
                if (open) closeList()
                return
            default:
                if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
                    typeahead(event.key.toLowerCase())
                }
        }
    }
</script>

<svelte:window
    onpointerdown={(event) => {
        if (!open) return
        const target = event.target as Node | null
        if (!button?.contains(target ?? null) && !list?.contains(target ?? null)) closeList()
    }}
    onresize={() => open && place()}
/>
<!-- capture, so a scroll inside any container re-anchors the list and not just a scroll of the page -->
<svelte:document onscrollcapture={() => open && place()} />

<div class="wrapper" style={wrapperStyle}>
    {#if title}
        <div id={labelId}>{title}</div>
    {/if}
    <button
        bind:this={button}
        type="button"
        class="control"
        {style}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={title ? labelId : undefined}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onclick={() => (open ? closeList() : openList())}
        onkeydown={onKeyDown}
    >
        <span class="label">{label}</span>
        <span class="chevron" aria-hidden="true"></span>
    </button>

    {#if open}
        <ul
            bind:this={list}
            id={listId}
            class="list"
            role="listbox"
            aria-labelledby={labelId}
            transition:popup
            style="top: {placement.top}px; left: {placement.left}px; width: {placement.width}px; max-height: {placement.maxHeight}px; transform-origin: {placement.openUp
                ? 'bottom'
                : 'top'};"
        >
            {#each options as option, index (option.key)}
                <li
                    id={optionId(index)}
                    role="option"
                    class="option"
                    class:active={index === activeIndex}
                    class:disabled={option.disabled}
                    aria-selected={index === selectedIndex}
                    aria-disabled={option.disabled}
                    onpointerenter={() => selectable(index) && (activeIndex = index)}
                    onclick={() => commit(index)}
                >
                    {#if item}
                        {@render item(option, {
                            selected: index === selectedIndex,
                            active: index === activeIndex
                        })}
                    {:else}
                        {option.key}
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</div>

<style lang="scss">
    .wrapper {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
    }

    .control {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.75rem;
        width: 100%;
        padding: 0.7rem 1rem;
        border: none;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-family: inherit;
        font-size: inherit;
        text-align: left;
        cursor: pointer;
    }

    .control:hover {
        filter: brightness(1.1);
    }

    .control:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    .label {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }

    .chevron {
        flex-shrink: 0;
        width: 0;
        height: 0;
        border-left: 0.32rem solid transparent;
        border-right: 0.32rem solid transparent;
        border-top: 0.36rem solid currentColor;
        opacity: 0.8;
    }

    /* fixed, not absolute: an absolutely positioned popup is part of the page's scrollable
       overflow and grows the document when it opens near the bottom */
    .list {
        position: fixed;
        z-index: 100;
        overflow-y: auto;
        overscroll-behavior: contain;
        margin: 0;
        padding: 0.25rem;
        list-style: none;
        border-radius: 0.4rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
    }

    .option {
        padding: 0.5rem 0.75rem;
        border-radius: 0.3rem;
        cursor: pointer;
    }

    .option.active {
        background-color: rgba(var(--RGB-accent), 0.25);
    }

    .option[aria-selected='true'] {
        font-weight: bold;
    }

    .option.disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
</style>
