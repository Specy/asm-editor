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
     * A manual popover puts the list in the browser's top layer, so transformed drawers and
     * clipped settings sections cannot change its coordinates or cover its options. It stays
     * in this DOM subtree, keeping the theme and the parent's outside-click handling intact.
     *
     * An option with `expanded` heads a group the caller can fold, as a tree row does: the caller
     * owns which groups are folded and leaves a folded group's rows out of `options`, and
     * `onToggle` asks it to flip one. A group row is reached by the arrow keys even when it cannot
     * be chosen, Right unfolds it and Left folds it, and Enter, Space or a click toggles one that
     * cannot be chosen; the `item` snippet's `toggle` is for a chevron on one that can.
     */
    import { tick, type Component, type Snippet } from 'svelte'
    import { cubicOut } from 'svelte/easing'
    import type { HTMLButtonAttributes } from 'svelte/elements'
    import Icon from '#cmp/shared/layout/Icon.svelte'

    type SelectOption = {
        key: string | number
        /** Human-readable text for type ahead when the key is a stable identifier. */
        searchText?: string
        value: T
        disabled?: boolean
        /** Whether the group this option heads shows its rows; absent on an option that heads none. */
        expanded?: boolean
    }

    /**
     * The rest goes to the control's button, an attachment such as a Tooltip among them; `title`
     * is the visible label above it, not a tooltip.
     */
    interface Props extends Omit<
        HTMLButtonAttributes,
        'value' | 'style' | 'title' | 'disabled' | 'onchange'
    > {
        options: SelectOption[]
        value: T
        style?: string
        title?: string
        /** Accessible name when the surrounding form already renders the visible label. */
        ariaLabel?: string
        wrapperStyle?: string
        disabled?: boolean
        onChange?: (value: T) => void
        /** What sits above the options, such as a filter: it stays in view as they scroll. */
        popupHeader?: Snippet<[{ focusOptions: () => void; close: () => void }]>
        trigger?: Snippet
        popupWidth?: number
        /** Renders one row. Without it a row is its `key`, which is what a native select shows. */
        item?: Snippet<[SelectOption, { selected: boolean; active: boolean; toggle: () => void }]>
        /** Folds or unfolds the group an option with `expanded` heads. */
        onToggle?: (option: SelectOption) => void
        /** Always opens the list above the control, as one at the bottom of the screen wants. */
        openAbove?: boolean
        /** An icon drawn in place of the triangle, turned over while the list is open. */
        chevron?: Component
        /** Added to the list's own style, such as a border that sets it apart from the panel under it. */
        listStyle?: string
    }

    let {
        options,
        value = $bindable(),
        style = '',
        title = '',
        ariaLabel,
        wrapperStyle = '',
        disabled = false,
        onChange,
        item,
        onToggle,
        popupHeader,
        trigger,
        popupWidth,
        openAbove = false,
        chevron,
        listStyle = '',
        ...rest
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
    let header = $state<HTMLLIElement | null>(null)
    /** The header's height, which an option scrolled into view keeps clear of. */
    let headerHeight = $state(0)

    const selectedIndex = $derived(options.findIndex((option) => option.value === value))
    const label = $derived(options[selectedIndex]?.key ?? '')

    function selectable(index: number) {
        return index >= 0 && index < options.length && !options[index].disabled
    }

    function heading(index: number) {
        return options[index]?.expanded !== undefined
    }

    /** Whether the arrow keys stop at an option: one that can be chosen, or that folds a group. */
    function reachable(index: number) {
        return selectable(index) || heading(index)
    }

    /** The next reachable option in `direction`, or the current one when there is none. */
    function step(from: number, direction: 1 | -1) {
        for (let i = from + direction; i >= 0 && i < options.length; i += direction) {
            if (reachable(i)) return i
        }
        return reachable(from) ? from : -1
    }

    function edge(direction: 1 | -1) {
        return direction === 1 ? step(-1, 1) : step(options.length, -1)
    }

    /**
     * Puts the list under the control, or over it when the room below is both too small and smaller
     * than the room above, or always over it when asked, and caps its height to whichever side it
     * landed on. Runs on open and on
     * every scroll and resize while open, so the list tracks the control the way a native popup does.
     * It measures the header there too, which keeps the same height while the list is open.
     */
    function place() {
        if (!button) return
        const rect = button.getBoundingClientRect()
        headerHeight = header?.offsetHeight ?? 0
        const below = window.innerHeight - rect.bottom - MARGIN
        const above = rect.top - MARGIN
        const wanted = list?.scrollHeight ?? 0
        const openUp = openAbove || (below < Math.min(wanted, 160) && above > below)

        const width = Math.min(popupWidth ?? rect.width, window.innerWidth - MARGIN * 2)
        placement = {
            left: Math.max(MARGIN, Math.min(rect.left, window.innerWidth - width - MARGIN)),
            width,
            top: openUp
                ? Math.max(MARGIN, rect.top - Math.min(wanted, above) - 4)
                : rect.bottom + 4,
            maxHeight: Math.max(80, openUp ? above : below),
            openUp
        }
    }

    async function openList(startAt = selectedIndex) {
        if (disabled) return
        open = true
        activeIndex = selectable(startAt) ? startAt : edge(1)
        await tick()
        if (!open || disabled || !list?.isConnected) return
        list.showPopover()
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

    $effect(() => {
        if (disabled) closeList()
    })

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

    /** Makes an option the value, and says whether it could. */
    function choose(index: number): boolean {
        if (disabled || !selectable(index)) return false
        value = options[index].value
        onChange?.(options[index].value)
        return true
    }

    function commit(index: number) {
        //the list is still on screen while it animates away; a click landing then chooses nothing
        if (!open || !choose(index)) return
        closeList()
        button?.focus()
    }

    /**
     * Folds or unfolds the group an option heads, which stays the active one. Focus goes back to the
     * control, as after a choice, since a click on the list takes it away and the keys work there.
     */
    function toggle(index: number) {
        if (!open || !heading(index)) return
        activeIndex = index
        onToggle?.(options[index])
        button?.focus()
        //the list grew or shrank, so it may have to move to keep clear of the control
        void tick().then(() => {
            if (open) place()
        })
    }

    /** What choosing an option does: a group row that cannot be chosen folds instead. */
    function activate(index: number) {
        if (!selectable(index) && heading(index)) toggle(index)
        else commit(index)
    }

    function scrollActiveIntoView() {
        if (activeIndex < 0) return
        list?.querySelector(`#${CSS.escape(optionId(activeIndex))}`)?.scrollIntoView({
            block: 'nearest'
        })
    }

    function moveTo(index: number) {
        activeIndex = index
        //once the list has drawn it as the active option
        void tick().then(scrollActiveIntoView)
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
                selectable(index) &&
                String(option.searchText ?? option.key)
                    .toLowerCase()
                    .startsWith(typed)
        )
        if (match === -1) return
        if (open) moveTo(match)
        //a closed list chooses at once, as a native select does, and changes nothing it already holds
        else if (match !== selectedIndex) choose(match)
    }

    function onKeyDown(event: KeyboardEvent) {
        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault()
                if (open) moveTo(step(activeIndex, 1))
                else void openList()
                return
            case 'ArrowUp':
                event.preventDefault()
                if (open) moveTo(step(activeIndex, -1))
                else void openList()
                return
            case 'ArrowRight':
                if (!open || options[activeIndex]?.expanded !== false) return
                event.preventDefault()
                toggle(activeIndex)
                return
            case 'ArrowLeft':
                if (!open || options[activeIndex]?.expanded !== true) return
                event.preventDefault()
                toggle(activeIndex)
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
                if (open) activate(activeIndex)
                else void openList()
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
        {...rest}
        {disabled}
        class="control"
        {style}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-labelledby={title ? labelId : undefined}
        aria-label={title ? undefined : ariaLabel}
        aria-activedescendant={open && activeIndex >= 0 ? optionId(activeIndex) : undefined}
        onclick={() => (open ? closeList() : openList())}
        onkeydown={onKeyDown}
    >
        <span class="label"
            >{#if trigger}{@render trigger()}{:else}{label}{/if}</span
        >
        {#if chevron}
            {@const Chevron = chevron}
            <span class="chevron-icon" class:open aria-hidden="true"
                ><Icon size={0.65}><Chevron /></Icon></span
            >
        {:else}
            <span class="chevron" aria-hidden="true"></span>
        {/if}
    </button>

    {#if open}
        <ul
            bind:this={list}
            id={listId}
            class="list"
            popover="manual"
            role="listbox"
            aria-labelledby={title ? labelId : undefined}
            aria-label={title ? undefined : ariaLabel}
            transition:popup
            style="top: {placement.top}px; left: {placement.left}px; width: {placement.width}px; max-height: {placement.maxHeight}px; transform-origin: {placement.openUp
                ? 'bottom'
                : 'top'}; scroll-padding-top: {headerHeight}px; {listStyle}"
        >
            {#if popupHeader}<li role="presentation" class="popup-header" bind:this={header}>
                    {@render popupHeader({
                        focusOptions: () => {
                            button?.focus()
                            moveTo(edge(1))
                        },
                        close: () => {
                            closeList()
                            button?.focus()
                        }
                    })}
                </li>{/if}
            {#each options as option, index (option.key)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <li
                    id={optionId(index)}
                    role="option"
                    class="option"
                    class:active={index === activeIndex}
                    class:disabled={option.disabled}
                    class:heading={option.expanded !== undefined}
                    aria-selected={index === selectedIndex}
                    aria-disabled={option.disabled}
                    onpointerenter={() => reachable(index) && (activeIndex = index)}
                    onclick={() => activate(index)}
                >
                    {#if item}
                        {@render item(option, {
                            selected: index === selectedIndex,
                            active: index === activeIndex,
                            toggle: () => toggle(index)
                        })}
                    {:else}
                        {option.key}
                    {/if}
                    <!-- an option has no aria-expanded of its own, so a screen reader is told in words -->
                    {#if option.expanded !== undefined}<span class="visually-hidden"
                            >{option.expanded ? ', expanded' : ', collapsed'}</span
                        >{/if}
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

    .control:hover:not(:disabled) {
        filter: brightness(1.1);
    }

    .control:disabled {
        opacity: 0.6;
        cursor: default;
    }

    .control:focus-visible {
        outline: 2px solid var(--accent);
        outline-offset: 2px;
    }

    .label {
        min-width: 0;
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

    .chevron-icon {
        display: flex;
        flex-shrink: 0;
        opacity: 0.8;
        transition: transform 0.15s ease;
    }

    .chevron-icon.open {
        transform: rotate(180deg);
    }

    @media (prefers-reduced-motion: reduce) {
        .chevron-icon {
            transition: none;
        }
    }

    /* fixed, not absolute: an absolutely positioned popup is part of the page's scrollable
       overflow and grows the document when it opens near the bottom */
    .list {
        position: fixed;
        inset: auto;
        z-index: 100;
        overflow-y: auto;
        overscroll-behavior: contain;
        margin: 0;
        padding: 0.25rem;
        list-style: none;
        border-radius: 0.4rem;
        border: none;
        background-color: var(--secondary);
        color: var(--secondary-text);
        box-shadow: 0 0.5rem 1.5rem rgba(0, 0, 0, 0.35);
    }

    /* over the options as they scroll past, set apart from them by a line from edge to edge. It
       reaches over the list's padding, which it sticks within, and gives it back to its content */
    .popup-header {
        position: sticky;
        top: -0.25rem;
        z-index: 1;
        margin: -0.25rem -0.25rem 0.25rem;
        padding: 0.25rem 0.25rem 0;
        background-color: var(--secondary);
        border-bottom: 1px solid var(--tertiary);
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

    .option.disabled.heading {
        cursor: pointer;
    }
</style>
