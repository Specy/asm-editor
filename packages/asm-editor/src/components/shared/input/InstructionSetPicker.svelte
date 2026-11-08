<script lang="ts">
    /**
     * The choice of an instruction set as the create page draws it (the owner's mockup of
     * 2026-11-08): a grid of tiles, three to a row or two where three would cut "RISC-V-64", each
     * the set's colour square and its name in Fira Code on a field's fill, the picked one in a tint
     * of the accent inside an edge of it; and under the tiles, the picked set's line, with the
     * simulator it follows. A radio group: the arrows move to the next or previous set and pick it.
     * The create page, the embed builder and the exam builder pick their set with it.
     */
    import { languageLabel } from '#lib/languages/languageLabel.ts'
    import { languageAccent } from '#lib/languages/languageColors.ts'
    import {
        COMPATIBLE_WITH,
        LANGUAGE_DESCRIPTIONS,
        LANGUAGE_ORDER
    } from '#lib/languages/languageCapabilities.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'

    interface Props {
        selected: AvailableLanguages
        onSelect: (language: AvailableLanguages) => void
        /** The sets offered, in the order of their tiles; every set by default. */
        languages?: readonly AvailableLanguages[]
        /** Whether the picked set's line, and the simulator it follows, show under the tiles. */
        description?: boolean
        /** Names the group for a reader of the page. */
        ariaLabel?: string
    }

    let {
        selected,
        onSelect,
        languages = LANGUAGE_ORDER,
        description = true,
        ariaLabel = 'Instruction set'
    }: Props = $props()

    /** The line on the set picked, which its tile is described by, read once it is reached. */
    const aboutId = $props.id()
    const compatible = $derived(COMPATIBLE_WITH[selected])

    /** The tiles, in order, for the arrow keys to move between. */
    const tiles: HTMLButtonElement[] = $state([])

    /** A radio group's keys: the arrows move to the next or previous set and pick it, wrapping
     *  round at the ends, and Home and End go to the first and the last. */
    function onTileKeyDown(event: KeyboardEvent, index: number) {
        const count = languages.length
        let next: number
        if (event.key === 'ArrowRight' || event.key === 'ArrowDown') next = (index + 1) % count
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp')
            next = (index - 1 + count) % count
        else if (event.key === 'Home') next = 0
        else if (event.key === 'End') next = count - 1
        else return
        event.preventDefault()
        onSelect(languages[next])
        tiles[next]?.focus()
    }
</script>

<div class="instruction-set-picker">
    <div class="tiles" role="radiogroup" aria-label={ariaLabel}>
        {#each languages as value, index (value)}
            <button
                bind:this={tiles[index]}
                type="button"
                role="radio"
                class="tile"
                aria-checked={selected === value}
                aria-describedby={description && selected === value ? aboutId : undefined}
                tabindex={selected === value ? 0 : -1}
                onclick={() => onSelect(value)}
                onkeydown={(event) => onTileKeyDown(event, index)}
            >
                <span
                    class="language-square"
                    style:background-color={languageAccent(value)}
                    aria-hidden="true"
                ></span>
                {languageLabel(value)}
            </button>
        {/each}
    </div>
    {#if description}
        <!-- every set's line laid out unseen in the one cell under the picked one's, so the cell is
             as tall as the tallest of them at any width and in any font's line metrics, and what
             is under it stays put whichever set is picked (owner, 2026-11-08) -->
        <div class="about-cell">
            {#each languages as value (value)}
                <div class="about sizer" aria-hidden="true">
                    <p class="language-description">{LANGUAGE_DESCRIPTIONS[value]}</p>
                    {#if COMPATIBLE_WITH[value]}
                        <p class="compatible">
                            Compatible with {COMPATIBLE_WITH[value]}
                        </p>
                    {/if}
                </div>
            {/each}
            <div class="about" id={aboutId}>
                <p class="language-description">{LANGUAGE_DESCRIPTIONS[selected]}</p>
                {#if compatible}
                    <p class="compatible">
                        Compatible with <span class="simulator">{compatible}</span>
                    </p>
                {/if}
            </div>
        </div>
    {/if}
</div>

<style lang="scss">
    @use '../../../styles/field.scss';
    @use '../../../styles/tiles.scss';

    /* the tiles over the set's line, as far apart as the create page's sections space what they
       hold; the box the tiles' columns are counted against */
    .instruction-set-picker {
        display: flex;
        flex-direction: column;
        gap: 0.75rem;
        container-type: inline-size;
    }

    /* three to a row, or two where three would cut "RISC-V-64" (styles/tiles.scss) */
    .tiles {
        @include tiles.grid;
    }

    /* a field's fill and edge (styles/field.scss), as the fields beside it; the picked one in the
       accent, the one you have (D4), a tint of it over the fill inside an edge of it */
    .tile {
        @include field.surface;
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-width: 0;
        padding: tiles.$padding-block 0.8rem;
        font: var(--fs-small) / #{tiles.$line-height} var(--font-mono);
        text-align: left;
        white-space: nowrap;
        cursor: pointer;
        transition:
            background-color var(--dur-fast),
            border-color var(--dur-fast);

        &:hover {
            background-color: color-mix(in srgb, currentColor 8%, field.$fill);
        }

        &[aria-checked='true'] {
            border-color: var(--accent);
            background-color: color-mix(in srgb, var(--accent) 18%, field.$fill);
        }
    }

    /* drawn as the home page's instruction-set bar draws its squares */
    .language-square {
        flex: none;
        width: 0.5rem;
        height: 0.5rem;
        border-radius: 2px;
    }

    /* the picked set's line over the others', unseen: the one grid cell they share takes the
       tallest one's height */
    .about-cell {
        display: grid;
        margin-top: 0.15rem;
    }

    /* what the set is at the left, the simulator it follows at the right, which drops under it
       when the two do not fit on one line; at the cell's top, not stretched to its height, which
       would spread a wrapped line's two rows apart */
    .about {
        grid-area: 1 / 1;
        align-self: start;
        display: flex;
        flex-wrap: wrap;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.25rem 0.75rem;

        p {
            margin: 0;
        }
    }

    .sizer {
        visibility: hidden;
    }

    .language-description {
        font-size: var(--fs-small);
        line-height: 1.45;
    }

    .compatible {
        font: var(--fs-caption) / 1.45 var(--font-mono);
        color: var(--text-muted);
        white-space: nowrap;
    }

    .simulator {
        color: var(--accent);
    }
</style>
