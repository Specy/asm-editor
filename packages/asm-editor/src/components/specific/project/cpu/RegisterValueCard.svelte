<script lang="ts">
    /**
     * A register's whole value, in a card beside its name while the pointer is on the register:
     * a hover card over data, drawn as the Tooltip is (a solid Popover), its arrow on the name it
     * is about. The register's row shows it, through `.register-wrapper:hover`.
     */
    import type { Snippet } from 'svelte'
    import PopoverOutline from '#cmp/shared/floating/PopoverOutline.svelte'
    import { elementSize } from '#cmp/shared/floating/elementSize.ts'

    let { children }: { children: Snippet } = $props()

    /** The arrow, which stands out of the card towards the name; $arrow in the styles below. */
    const ARROW = 6
    let width = $state(0)
    let height = $state(0)
</script>

<div
    class="hover-register-value"
    use:elementSize={(w, h) => {
        width = w
        height = h
    }}
>
    <PopoverOutline {width} {height} side="right" at={height / 2} arrow={ARROW} solid />
    {@render children()}
</div>

<style lang="scss">
    @use '../../../../styles/popover.scss';

    $arrow: 6px;

    /* beside the name, as far off it as its arrow stands out, and centred on its row: tall enough
       for the arrow to stand out between its 0.6rem corners (2 × 0.6rem and the arrow's 1rem
       base with its rounding), so a little taller than the row. The padding keeps the room the
       outline's edge takes */
    .hover-register-value {
        @include popover.content;
        display: none;
        min-width: 100%;
        min-height: 2.3rem;
        position: absolute;
        cursor: text;
        user-select: all;
        font-family: var(--font-mono);
        font-size: var(--fs-body);
        left: calc(100% + 2px + #{$arrow});
        z-index: 3;
        top: 50%;
        transform: translateY(-50%);
        padding: 1px calc(0.3rem + 1px);
        align-items: center;
        font-weight: 400;
        white-space: nowrap;

        /* the gap to the name, which the pointer crosses to reach the card and stay on it */
        &::before {
            content: '';
            position: absolute;
            top: 0;
            bottom: 0;
            right: 100%;
            width: calc(2px + #{$arrow});
        }
    }
</style>
