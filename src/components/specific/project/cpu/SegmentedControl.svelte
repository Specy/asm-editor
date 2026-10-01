<script lang="ts">
    /**
     * The choice of one of a few options, drawn as a pill whose highlight slides to the one picked,
     * after genshin-music's `MultipleOptionSlider`. It is every such choice in the editor: the
     * Testcases' memory form, the choices in Settings, and the strips of the Register file panel's
     * header, where `SizeSelector` is this control with the Target's widths baked in, so every strip
     * there is the same control at the same size. `tabs` draws the Register file panel's tabs
     * instead, where the picked option is a tab running into the panel under it.
     */
    import type { Component } from 'svelte'

    interface Props {
        /**
         * `title` is the button's tooltip, for a label too short to read on its own; `icon` is drawn
         * before the label, in the colour the option gives it.
         */
        options: {
            id: string
            label: string
            title?: string
            icon?: Component
            iconColor?: string
        }[]
        selected: string
        onSelect: (id: string) => void
        style?: string
        /**
         * Draws the strip as the tabs of what is under it: the picked button keeps its bottom square
         * so it runs into the panel below instead of ending in a corner of its own.
         */
        tabs?: boolean
    }

    let { options, selected, onSelect, style = '', tabs = false }: Props = $props()

    let root: HTMLDivElement | undefined = $state()
    /** Where the highlight sits, under the picked button: unknown until that button has a box. */
    let highlight = $state<{ left: number; width: number } | null>(null)

    $effect(() => {
        const index = options.findIndex((option) => option.id === selected)
        if (tabs || !root) return
        const control = root
        const buttons = [...control.querySelectorAll<HTMLButtonElement>(':scope > button')]
        const button = buttons[index]
        if (!button) {
            highlight = null
            return
        }
        const place = () => {
            //a control in a hidden panel has no box, and keeps its last place until it shows again
            if (button.offsetWidth === 0) return
            highlight = { left: button.offsetLeft, width: button.offsetWidth }
        }
        place()
        //jsdom, which the component tests run in, has no ResizeObserver
        if (typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(place)
        observer.observe(control)
        for (const element of buttons) observer.observe(element)
        return () => observer.disconnect()
    })
</script>

<div
    class="segmented-control"
    class:tabs
    class:slider={!tabs}
    class:measured={highlight !== null}
    {style}
    bind:this={root}
>
    {#each options as option (option.id)}
        <button
            type="button"
            onclick={() => onSelect(option.id)}
            class="segmented-control-button"
            class:segmented-control-button-selected={selected === option.id}
            aria-pressed={selected === option.id}
            title={option.title ?? ''}
        >
            {#if option.icon}
                <span class="segmented-control-icon" style:color={option.iconColor}>
                    <option.icon />
                </span>
            {/if}
            {option.label}
        </button>
    {/each}
    {#if !tabs && highlight}
        <span
            class="segmented-control-highlight"
            style:left="calc({highlight.left}px + 0.1rem)"
            style:width="calc({highlight.width}px - 0.2rem)"
        ></span>
    {/if}
</div>

<style lang="scss">
    .segmented-control {
        height: fit-content;
    }

    .segmented-control-button {
        display: flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        font-family: Rubik;
        font-size: 0.8rem;
        white-space: nowrap;
    }

    .segmented-control-icon {
        display: flex;
        flex: none;
        width: 0.7rem;
        height: 0.7rem;
        margin-right: 0.35rem;
    }

    // the pill: each option as wide as its label, sharing whatever room the pill is given beyond
    // that, and the highlight slides under them to the one picked, resizing as it goes, inside a
    // border of its colour
    .slider {
        position: relative;
        display: grid;
        grid-auto-flow: column;
        grid-auto-columns: auto;
        width: fit-content;
        border: 0.1rem solid var(--accent2);
        border-radius: 3rem;
        background-color: var(--primary);
        isolation: isolate;

        .segmented-control-button {
            position: relative;
            z-index: 1;
            padding: 0.25rem 0.6rem;
            border-radius: 3rem;
            color: color-mix(in srgb, var(--primary-text) 70%, transparent);
            background-color: transparent;
            transition: color 0.2s;

            &:hover {
                color: var(--primary-text);
            }
        }

        .segmented-control-button-selected,
        .segmented-control-button-selected:hover {
            color: var(--accent2-text);
        }

        // until the highlight has a place, before the first layout or in a panel never shown, the
        // picked option wears its colour itself
        &:not(.measured) .segmented-control-button-selected {
            background-color: var(--accent2);
        }
    }

    .segmented-control-highlight {
        position: absolute;
        top: 0.1rem;
        bottom: 0.1rem;
        border-radius: 3rem;
        background-color: var(--accent2);
        pointer-events: none;
        transition:
            left 0.15s ease-out,
            width 0.15s ease-out;

        @media (prefers-reduced-motion: reduce) {
            transition: none;
        }
    }

    //the strip of tabs is its own bar: the page's own colour warmed towards the panel it sits on,
    //outlined so it reads as the band the tabs belong to rather than as part of the registers. Its
    //corners follow the panel's, which the bar is the top of
    .tabs {
        display: flex;
        //a strip stays whole: the header around it is what wraps
        flex-wrap: nowrap;
        overflow: hidden;
        background-color: color-mix(in srgb, var(--background) 85%, var(--secondary));
        border: 0.1rem solid var(--wb-line, var(--tertiary));
        border-bottom: 0;
        border-radius: 0.5rem 0.5rem 0 0;

        .segmented-control-button {
            flex: 1;
            padding: 0.25rem 0.45rem;
            //a tab that is not the picked one has no fill of its own, so the strip carries that
            //colour rather than sitting on it as a block of buttons
            background-color: transparent;
            color: var(--secondary-text);
            transition: background-color 0.2s;
        }

        .segmented-control-button:hover:not(.segmented-control-button-selected):not(:active) {
            background-color: rgba(var(--RGB-tertiary), 0.4);
        }

        //the picked tab curves at the top and runs square into whatever is under it. It is
        //tertiary and not the accent the option strips use: an accent tab would read as a
        //highlight sitting on the bar, where a tab is meant to read as the piece of the bar that
        //the panel below belongs to
        .segmented-control-button-selected,
        .segmented-control-button:active {
            border-radius: 0.4rem 0.4rem 0 0;
            transition: background-color 0s;
            background-color: var(--tertiary);
            color: var(--tertiary-text);
        }

        .segmented-control-button-selected:first-child {
            border-top-left-radius: 0;
        }

        .segmented-control-button-selected:last-child {
            border-top-right-radius: 0;
        }
    }
</style>
