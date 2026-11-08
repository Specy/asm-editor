<script lang="ts" module>
    /**
     * One tab: `label` names it, and is what it shows when the host draws no face of its own;
     * `title` is its Tooltip.
     */
    export interface TabStripTab {
        id: string
        label: string
        title?: string
    }
</script>

<script lang="ts" generics="T extends TabStripTab">
    /**
     * A strip of tabs that switches what a panel shows, on the panel's top edge
     * ([design-system.md](../../../../../../docs/design/design-system.md), D14): the editor's open
     * Files, the bottom panel's Terminal · Log · Problems, a Playground's files and the Register
     * files. A choice of a value or a view among a few short options is a `SegmentedControl`
     * instead.
     *
     * It is a `tablist` the Tab key enters once, on the picked tab: the arrow keys then move to the
     * next or the previous tab, wrapping at the ends, Home and End go to the first and the last, and
     * Delete closes a closable one. With `activation` `automatic` (the default) the tab the keys
     * reach is picked at once; with `manual` they only move the focus, and Enter or Space picks it,
     * for a strip whose tabs are slow to show, as the editor's are. With `onclose` every tab has a close button,
     * which the Tab key reaches after the tab it belongs to, and a middle click closes a tab as in
     * an IDE; a tab closed while it had the keyboard hands it to the tab picked after it.
     *
     * Two looks. `strip` is the Workbench's: a band a shade darker than the panel (`--wb-strip`),
     * ruled underneath, each tab ruled on its right, the picked one in the panel's own colour and
     * open at the bottom onto it, the others dimmed; its height is `--tab-strip-height`, 2rem
     * unless the host sets it. `panel` is the Register files': a bar outlined above the panel, its
     * tabs sharing its width, the picked one a raised piece of the bar the panel below belongs to;
     * its top corners are `--tab-strip-radius`, 0.5rem unless the host sets it.
     */
    import { tick, type Snippet } from 'svelte'
    import type { HTMLButtonAttributes } from 'svelte/elements'
    import FaTimes from '~icons/fa-solid/times'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import IconButton from '#cmp/shared/button/IconButton.svelte'

    interface Props {
        tabs: readonly T[]
        /** The id of the tab whose content the panel shows. */
        selected: string | undefined
        /** A tab picked by a click, Enter or Space, or by the arrow keys reaching it. */
        onselect: (id: string) => void
        /**
         * Whether the arrow keys, Home and End pick the tab they reach (`automatic`, the default), or
         * only move the focus to it, leaving Enter or Space to pick it (`manual`).
         */
        activation?: 'automatic' | 'manual'
        /** Makes every tab closable: its close button, Delete, or a middle click. */
        onclose?: (id: string) => void
        /** Names the strip as a whole, such as "Open files", for a reader of the page. */
        ariaLabel: string
        look?: 'strip' | 'panel'
        /**
         * The `strip`'s tabs scroll sideways when they do not all fit (the default). Off, they keep
         * their width, and what follows them in the strip gives way first.
         */
        scroll?: boolean
        /** Draws a tab's face in place of its label, in the host's own scoped styles. */
        tab?: Snippet<[T, boolean]>
        /**
         * More attributes for a tab's button, such as a native `title` or drag handlers. The strip's
         * own (its role, focus, click and keys) come after them and win.
         */
        tabAttributes?: (tab: T) => HTMLButtonAttributes
        /** The id of the element each tab shows, for `aria-controls`. */
        panelId?: (id: string) => string
        /** What the strip holds after its tabs, such as a toolbar or a picker, on the strip's rule. */
        children?: Snippet
        style?: string
    }

    let {
        tabs,
        selected,
        onselect,
        activation = 'automatic',
        onclose,
        ariaLabel,
        look = 'strip',
        scroll = true,
        tab,
        tabAttributes,
        panelId,
        children,
        style = ''
    }: Props = $props()

    let list: HTMLDivElement | undefined = $state()
    /** The tab the keyboard is on while it is in the strip. */
    let focusedId: string | undefined = $state(undefined)

    //the one tab the Tab key stops at: the one the keyboard is on, or else the picked one
    const rovingId = $derived(
        focusedId !== undefined && tabs.some((item) => item.id === focusedId)
            ? focusedId
            : tabs.some((item) => item.id === selected)
              ? selected
              : tabs[0]?.id
    )

    function tabButtons(): HTMLButtonElement[] {
        if (!list) return []
        return [...list.querySelectorAll<HTMLButtonElement>(':scope > .tab > [role="tab"]')]
    }

    function moveTo(index: number) {
        const target = tabs[index]
        if (!target) return
        focusedId = target.id
        if (activation === 'automatic') onselect(target.id)
        tabButtons()[index]?.focus()
    }

    function keydown(event: KeyboardEvent, index: number) {
        if (event.altKey || event.ctrlKey || event.metaKey) return
        const last = tabs.length - 1
        let next: number
        switch (event.key) {
            case 'ArrowRight':
                next = index === last ? 0 : index + 1
                break
            case 'ArrowLeft':
                next = index === 0 ? last : index - 1
                break
            case 'Home':
                next = 0
                break
            case 'End':
                next = last
                break
            case 'Delete':
                if (!onclose) return
                event.preventDefault()
                void close(tabs[index].id)
                return
            default:
                return
        }
        event.preventDefault()
        moveTo(next)
    }

    async function close(id: string) {
        const hadFocus = !!list && list.contains(document.activeElement)
        onclose?.(id)
        if (!hadFocus) return
        await tick()
        //the keyboard was on the tab that went: it goes on to the one picked now
        if (!list?.isConnected || list.contains(document.activeElement)) return
        focusedId = undefined
        const index = tabs.findIndex((item) => item.id === selected)
        tabButtons()[Math.max(index, 0)]?.focus()
    }

    function focusin(event: FocusEvent) {
        const element = (event.target as Element | null)?.closest('.tab')
        const index = element ? [...(list?.children ?? [])].indexOf(element) : -1
        if (index >= 0 && tabs[index]) focusedId = tabs[index].id
    }

    function focusout(event: FocusEvent) {
        if (!list?.contains(event.relatedTarget as Node | null)) focusedId = undefined
    }
</script>

<div class="tab-strip {look}" class:scroll={scroll && look === 'strip'} {style}>
    <div
        class="tabs"
        role="tablist"
        aria-label={ariaLabel}
        bind:this={list}
        onfocusin={focusin}
        onfocusout={focusout}
    >
        {#each tabs as item, index (item.id)}
            {@const isSelected = item.id === selected}
            <div class="tab" class:selected={isSelected} class:closable={!!onclose} role="none">
                <button
                    {...tabAttributes?.(item)}
                    type="button"
                    class="tab-select"
                    role="tab"
                    aria-selected={isSelected}
                    aria-controls={panelId?.(item.id)}
                    tabindex={item.id === rovingId ? 0 : -1}
                    onclick={() => onselect(item.id)}
                    onkeydown={(event) => keydown(event, index)}
                    onauxclick={(event) => {
                        if (onclose && event.button === 1) void close(item.id)
                    }}
                    {@attach tooltip(item.title)}
                >
                    {#if tab}
                        {@render tab(item, isSelected)}
                    {:else}
                        {item.label}
                    {/if}
                </button>
                {#if onclose}
                    <IconButton
                        size="sm"
                        quiet
                        class="tab-close"
                        tabindex={item.id === rovingId ? 0 : -1}
                        label="Close {item.label}"
                        {@attach tooltip(`Close ${item.label}`)}
                        onClick={() => void close(item.id)}
                    >
                        <FaTimes />
                    </IconButton>
                {/if}
            </div>
        {/each}
        {#if look === 'strip'}
            <!-- the rest of the strip's rule, after the last tab -->
            <div class="rest" role="none"></div>
        {/if}
    </div>
    {@render children?.()}
</div>

<style lang="scss">
    @use '../../../styles/focus.scss' as *;
    @use '../../../styles/radius.scss' as *;

    .tab-strip {
        display: flex;
        align-items: stretch;
        flex: none;
        min-width: 0;
    }

    .tabs {
        display: flex;
        flex: 1 0 auto;
    }

    .tab {
        display: flex;
        align-items: center;
        flex: none;
        min-width: 0;
    }

    .tab-select {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 0.4rem;
        height: 100%;
        min-width: 0;
        padding: 0;
        border: 0;
        background: transparent;
        color: inherit;
        font-family: var(--font-ui);
        font-size: var(--fs-small);
        white-space: nowrap;
        cursor: pointer;
        // the strip clips what is outside it, so the ring is drawn inside the tab
        @include focus-ring($inset: true);
    }

    /* a closable tab's close, a little apart from its name */
    .tab :global(.tab-close) {
        margin-left: 0.3rem;
    }

    /* the Workbench's strip: a band a shade darker than the panel, ruled underneath, each tab ruled
       on its right, and the picked tab in the panel's colour, open at the bottom onto it. The rule
       is each part's own bottom border rather than the strip's with the tabs laid over it, which at
       a fractional screen scale could land a pixel apart and draw it twice */
    .strip {
        height: var(--tab-strip-height, 2rem);
        //the Workbench's strip colour, which a page outside it has not got
        background-color: var(
            --wb-strip,
            color-mix(in srgb, var(--background) 65%, var(--secondary))
        );
        color: var(--secondary-text);

        > :global(*:not(.tabs)),
        .tab,
        .rest {
            border-bottom: 1px solid var(--line);
        }

        .rest {
            flex: 1;
            min-width: 0;
        }

        .tab {
            border-right: 1px solid var(--line);

            &:not(.selected) .tab-select {
                color: var(--text-muted);
            }

            &:not(.selected):hover .tab-select {
                color: inherit;
            }

            &.selected {
                background-color: var(--secondary);
                border-bottom-color: var(--secondary);
            }
        }

        .tab-select {
            padding: 0 1rem;
        }

        /* the name is the tab's own button up to its close button, which ends the tab */
        .closable {
            max-width: 14rem;
            gap: 0.2rem;

            .tab-select {
                padding: 0 0 0 0.9rem;
            }

            /* its close fills the tab's height at the tab's end, square-cornered, its hover running
               from the strip's top to the tab's rule, as the editor's own end of the strip does */
            :global(.tab-close) {
                align-self: stretch;
                width: 1.9rem;
                height: auto;
                margin-left: 0;
                border-radius: 0;
            }
        }
    }

    /* tabs that do not all fit scroll sideways, on the app's scrollbar (global.css) made thinner and
       on the strip's own colour, since it takes its height out of the tabs. No `scrollbar-width`
       here: Chrome drops the ::-webkit-scrollbar rules on an element that sets it, and draws its
       native bar with arrows */
    .scroll .tabs {
        flex: 1 1 auto;
        min-width: 0;
        overflow-x: auto;

        &::-webkit-scrollbar {
            height: 0.25rem;
            background: transparent;
        }
    }

    /* the Register files' bar: the page's own colour warmed towards the panel it sits on, outlined
       so it reads as the band the tabs belong to rather than as part of the registers. Its top
       corners are 0.5rem, the panel's own radius when nothing squares it (`--panel-radius`), and
       stay so where a host squares the panel, as the Workbench does; a host whose bar sits at the
       top of something rounded gives it that corner instead (`--tab-strip-radius`) */
    $panel-radius: var(--tab-strip-radius, 0.5rem);

    .panel {
        flex-wrap: nowrap;
        overflow: hidden;
        background-color: color-mix(in srgb, var(--background) 85%, var(--secondary));
        border: 1px solid var(--wb-line, var(--tertiary));
        border-bottom: 0;
        border-radius: $panel-radius $panel-radius 0 0;

        .tabs {
            flex: 1;
            min-width: 0;
        }

        .tab {
            flex: 1;
            align-items: stretch;
        }

        .tab-select {
            flex: 1;
            padding: 0.25rem 0.45rem;
            //a tab that is not the picked one has no fill of its own, so the bar carries that colour
            //rather than sitting on it as a block of buttons
            color: var(--secondary-text);
            transition: background-color var(--dur-fast);
        }

        .tab:not(.selected) .tab-select:hover:not(:active) {
            background-color: var(--hover-bg);
        }

        //the picked tab curves at the top, inside the bar's border, and runs square into whatever
        //is under it. It is tertiary and not the accent the option strips use: an accent tab would
        //read as a highlight sitting on the bar, where a tab is meant to read as the piece of the
        //bar that the panel below belongs to
        .selected .tab-select,
        .tab-select:active {
            border-radius: nested-radius($panel-radius, $border: 1px)
                nested-radius($panel-radius, $border: 1px) 0 0;
            transition: background-color 0s;
            background-color: var(--tertiary);
            color: var(--tertiary-text);
        }

        //at the bar's ends the bar's own corner, which clips it, rounds it
        .selected:first-child .tab-select {
            border-top-left-radius: 0;
        }

        .selected:last-child .tab-select {
            border-top-right-radius: 0;
        }
    }
</style>
