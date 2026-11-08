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
    <PopoverOutline {width} {height} side="right" at={height / 2} corner="control" solid />
    <div class="value">{@render children()}</div>
</div>

<style lang="scss">
    @use '../../../../styles/popover.scss';
    @use '../../../../styles/type.scss';

    /* PopoverOutline's arrow, which stands out of the card towards the name */
    $arrow: popover.$arrow;

    /* beside the name, as far off it as its arrow stands out, and centred on its row, on a
       control's corner (PopoverOutline's `corner="control"`). The same room above and below the
       value as beside it (owner, 2026-11-08): the value cut to its digits (below), and a padding
       that leaves the card tall enough for the arrow to stand out between its corners (2 ×
       0.4rem and the arrow's base with its rounding), a little more than the other hover cards'
       0.3rem. The padding keeps the room the outline's edge takes too. In Fira Code at the size
       and weight of the register's own digits (MemoryRenderer's .memory-grid) */
    .hover-register-value {
        @include popover.content;
        display: none;
        min-width: 100%;
        position: absolute;
        cursor: text;
        user-select: all;
        @include type.machine-value;
        font-size: var(--fs-body);
        left: calc(100% + 2px + #{$arrow});
        z-index: 3;
        top: 50%;
        transform: translateY(-50%);
        padding: calc(0.5rem + 1px);
        align-items: center;
        font-weight: 400;
        white-space: nowrap;

        /* from a capital's top to the baseline, so that the room the font leaves above and below
           the digits does not add to the padding there */
        .value {
            text-box: trim-both cap alphabetic;
        }

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
