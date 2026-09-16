<script lang="ts">
    /**
     * The strip of buttons the Register file panel puts where the "Registers" title used to be, and
     * again on the right for the Format of the visible file. `SizeSelector` is this control with
     * the Target's widths baked in, so every strip in the panel header is drawn from here and they
     * all share one size and one style.
     */
    interface Props {
        /** `title` is the button's tooltip, for a label too short to read on its own. */
        options: { id: string; label: string; title?: string }[]
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
</script>

<div class="segmented-control" class:tabs {style}>
    {#each options as option (option.id)}
        <button
            onclick={() => onSelect(option.id)}
            class="segmented-control-button"
            class:segmented-control-button-selected={selected === option.id}
            title={option.title ?? ''}
        >
            {option.label}
        </button>
    {/each}
</div>

<style lang="scss">
    .segmented-control {
        border-radius: 0.2rem;
        overflow: hidden;
        display: flex;
        height: fit-content;
        //a strip stays whole: the header around it is what wraps, so the buttons of one control are
        //always read as one strip and never as two ragged rows inside the rounded block
        flex-wrap: nowrap;
    }

    .segmented-control-button {
        display: flex;
        flex: 1;
        justify-content: center;
        cursor: pointer;
        align-items: center;
        font-family: Rubik;
        font-size: 0.8rem;
        padding: 0.25rem 0.45rem;
        background-color: var(--secondary);
        color: var(--secondary-text);
        transition: background-color 0.2s;
    }

    .segmented-control-button:hover:not(.segmented-control-button-selected):not(:active) {
        background-color: rgba(var(--RGB-accent2), 0.3);
    }

    .segmented-control-button:active {
        background-color: var(--accent2);
        color: var(--accent2-text);
    }

    //the picked button is a tab rather than a lit-up slice of a strip: it curves away from the
    //buttons beside it and stays square where it meets the end of the strip, whose own corners the
    //container is already rounding around it
    .segmented-control-button-selected {
        border-radius: 0.2rem;
        transition: background-color 0s;
        background-color: var(--accent2);
        color: var(--accent2-text);
    }

    .segmented-control-button-selected:first-child {
        border-top-left-radius: 0;
        border-bottom-left-radius: 0;
    }

    .segmented-control-button-selected:last-child {
        border-top-right-radius: 0;
        border-bottom-right-radius: 0;
    }

    //the strip of tabs is its own bar: the page's own colour warmed towards the panel it sits on,
    //outlined so it reads as the band the tabs belong to rather than as part of the registers
    .tabs {
        background-color: color-mix(in srgb, var(--background) 85%, var(--secondary));
        border: 0.1rem solid var(--tertiary);
        border-bottom: 0;
        //the bar is the top of the panel, so its own corners follow the panel's rather than being
        //squared off and left to poke through the curve the panel clips them with
        border-radius: 0.5rem 0.5rem 0 0;
    }

    //a tab that is not the picked one has no fill of its own, so the strip carries that colour
    //rather than sitting on it as a block of buttons
    .tabs .segmented-control-button:not(.segmented-control-button-selected) {
        background-color: transparent;
    }

    //the picked tab curves at the top and runs square into whatever is under it. It is tertiary and
    //not the accent the option strips use: an accent tab would read as a highlight sitting on the
    //bar, where a tab is meant to read as the piece of the bar that the panel below belongs to
    .tabs .segmented-control-button-selected,
    .tabs .segmented-control-button:active {
        border-radius: 0.4rem 0.4rem 0 0;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }

    .tabs .segmented-control-button:hover:not(.segmented-control-button-selected):not(:active) {
        background-color: rgba(var(--RGB-tertiary), 0.4);
    }

    .tabs .segmented-control-button-selected:first-child {
        border-top-left-radius: 0;
    }

    .tabs .segmented-control-button-selected:last-child {
        border-top-right-radius: 0;
    }
</style>
