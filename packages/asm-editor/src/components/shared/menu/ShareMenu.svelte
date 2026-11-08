<script lang="ts">
    /**
     * The Share button's dropdown: two switches for what the link does when it is opened, both off
     * by default, and a Copy link button under them. Running needs a Build, so turning Run on turns
     * Build on, and turning Build off turns Run off. Placed and drawn as ContextMenu is: a manual
     * popover in the top layer, with an arrow pointing at the button, closed by Escape, a press
     * outside it, or the page scrolling or resizing under it.
     */
    import type { Snippet } from 'svelte'
    import PopoverOutline from '#cmp/shared/floating/PopoverOutline.svelte'
    import { AnchoredPopover } from '#cmp/shared/floating/anchoredPopover.svelte.ts'
    import Switch from '#cmp/shared/input/Switch.svelte'
    import type { ShareStartAction } from '#lib/shareStart.ts'

    let {
        onShare,
        trigger
    }: {
        onShare: (action?: ShareStartAction) => void
        trigger: Snippet<[{ open: (event: MouseEvent) => void; expanded: boolean }]>
    } = $props()

    let at = $state<{ x: number; y: number } | null>(null)
    let triggerElement: HTMLElement | undefined
    let build = $state(false)
    let run = $state(false)

    //placed, focused and closed as every Popover opened at a point is; its button toggles it
    const popover = new AnchoredPopover({
        point: () => at!,
        onClose: () => (at = null),
        trigger: () => triggerElement
    })

    function open(event: MouseEvent) {
        if (at) {
            at = null
            return
        }
        triggerElement = event.currentTarget as HTMLElement
        const bounds = triggerElement.getBoundingClientRect()
        at = { x: bounds.left + 16, y: bounds.bottom + 4 }
    }

    function copy() {
        popover.close()
        onShare(run ? 'buildAndRun' : build ? 'build' : undefined)
    }
</script>

{@render trigger({ open, expanded: at !== null })}
{#if at}
    <div
        class="share-menu"
        role="dialog"
        tabindex="-1"
        aria-label="Share options"
        popover="manual"
        style:left="{popover.left}px"
        style:top="{popover.top}px"
        {@attach popover.attach}
        onkeydown={(event) => {
            if (event.key !== 'Escape') return
            event.preventDefault()
            popover.close()
        }}
    >
        <PopoverOutline
            width={popover.width}
            height={popover.height}
            side={popover.side}
            at={popover.at}
        />
        <label class="row">
            <span>Build on open</span>
            <Switch
                bind:checked={build}
                size="sm"
                onChange={(on) => {
                    if (!on) run = false
                }}
            />
        </label>
        <label class="row">
            <span>Run after building</span>
            <Switch
                bind:checked={run}
                size="sm"
                onChange={(on) => {
                    if (on) build = true
                }}
            />
        </label>
        <button type="button" class="copy" onclick={copy}>Copy link</button>
    </div>
{/if}

<style lang="scss">
    @use '../../../styles/popover.scss';

    /* a Popover, as ContextMenu is (popover.anchored): the outline draws the tint, edge, shadow
       and arrow as one shape */
    .share-menu {
        @include popover.anchored;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
        min-width: 13rem;
        padding: 0.6rem;
        font-size: var(--fs-small);
        outline: none;
    }
    .row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        cursor: pointer;
    }
    .copy {
        margin-top: 0.2rem;
        padding: 0.45rem 0.8rem;
        border: 0;
        /* as far in from the Popover's edge as its corner is round, so clear of the curve: a
           control's own corner (D12) */
        border-radius: var(--r-control);
        background-color: var(--accent);
        color: var(--accent-text);
        font: inherit;
        cursor: pointer;
        /* the primary Button's hover, which the look decision keeps (D5) */
        &:hover {
            background-color: color-mix(in srgb, var(--accent) 85%, white);
        }
    }
</style>
