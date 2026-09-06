<script lang="ts">
    import Draggable from '$cmp/shared/draggable/Draggable.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaGripHorizontal from '~icons/fa-solid/grip-horizontal'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaEye from '~icons/fa-solid/eye'
    import FaEyeSlash from '~icons/fa-solid/eye-slash'
    import FaWindowRestore from '~icons/fa-solid/window-restore'
    import { fly } from 'svelte/transition'
    interface Props {
        hidden?: boolean
        title?: string
        hiddenOnMobile?: boolean
        left?: number
        top?: number
        /**
         * Read-only detail belonging with the title, rendered immediately after it on the left of
         * the bar. Deliberately not marked `data-no-drag`: it is text rather than a control, so it
         * is more useful as drag surface, like the title itself.
         */
        headerInfo?: import('svelte').Snippet
        /**
         * Controls of the caller's own, rendered at the right of the header bar, against the
         * button on its end. The bar is the drag handle, so they are marked `data-no-drag`,
         * which is where `Draggable` stops a press on them from picking the window up.
         */
        headerActions?: import('svelte').Snippet
        /**
         * What the button on the right of the header does. Left unset it is an eye that collapses
         * the body and leaves the bar in place, which is what a panel that lives only in this
         * window wants. Given, it closes the whole window through this callback instead — the
         * caller stops rendering the container — for a panel that has somewhere else to be.
         */
        onClose?: () => void
        closeTitle?: string
        children?: import('svelte').Snippet
    }

    let {
        hidden = $bindable(true),
        title = '',
        hiddenOnMobile = true,
        left = $bindable(300),
        top = $bindable(13),
        headerInfo,
        headerActions,
        onClose,
        closeTitle = 'Close',
        children
    }: Props = $props()

    //a window the caller can take away has no collapsed state: its bar goes with its body
    const collapsed = $derived(onClose ? false : hidden)

    let dragStartX = 0
    let dragStartY = 0

    function onHeaderPointerDown(e: PointerEvent) {
        dragStartX = e.clientX
        dragStartY = e.clientY
    }

    function onHeaderClick(e: MouseEvent) {
        //the injected controls sit inside the header, which is itself the collapse button
        if (e.target instanceof Element && e.target.closest('.header-actions')) return
        const dx = e.clientX - dragStartX
        const dy = e.clientY - dragStartY
        if (dx * dx + dy * dy < 25) {
            hidden = !hidden
        }
    }
</script>

{#snippet bar()}
    <Icon
        style="cursor:inherit; padding: 0.2rem 0.4rem; height: 1.4rem; width: 1.6rem; min-width: 1.6rem"
    >
        <FaGripHorizontal />
    </Icon>
    <div class="ellipsis">{title}</div>
    {#if headerInfo}
        <div class="header-info row">
            {@render headerInfo()}
        </div>
    {/if}
    {#if headerActions}
        <div class="header-actions row" data-no-drag>
            {@render headerActions()}
        </div>
    {/if}
    <Button
        style="padding: 0.2rem 0.3rem; height: 1.4rem; border-radius: 0.3rem"
        cssVar="secondary"
        title={onClose ? closeTitle : ''}
        onClick={(e) => {
            e.stopPropagation()
            if (onClose) return onClose()
            hidden = !hidden
        }}
    >
        <Icon size={1.1}>
            {#if onClose}
                <FaWindowRestore />
            {:else if !hidden}
                <FaEye />
            {:else}
                <FaEyeSlash />
            {/if}
        </Icon>
    </Button>
{/snippet}

<Draggable {hiddenOnMobile} bind:left bind:top>
    {#snippet header()}
        {#if onClose}
            <!-- a plain bar: it only drags, and the caller's controls must not nest in a button -->
            <div class="tab-header row">
                {@render bar()}
            </div>
        {:else}
            <button
                class="tab-header row"
                class:hidden
                onpointerdown={onHeaderPointerDown}
                onclick={onHeaderClick}
            >
                {@render bar()}
            </button>
        {/if}
    {/snippet}
        <div
            class="draggable-container-content"
            class:hidden={collapsed}
        >
            {#if !collapsed}
                {@render children?.()}
            {/if}
        </div>
</Draggable>

<style lang="scss">
    .tab-header {
        display: flex;
        min-width: 12rem;
        width: 100%;
        color: var(--secondary-text);
        margin-bottom: -0.1rem;
        box-shadow: 0 3px 10px rgb(0 0 0 / 0.2);
        justify-content: space-between;
        gap: 0.3rem;
        z-index: 2;
        height: 1.6rem;
        transition: all 0.2s cubic-bezier(0, 1, 1, 1);
        align-items: center;
        cursor: move;
        background-color: var(--secondary);
        color: var(--secondary-text);
        font-family: Rubik;
        /* a button's own default, written down so the bar reads the same as a div */
        font-size: 0.85rem;
        position: relative;
        border-top-left-radius: 0.4rem;
        border-top-right-radius: 0.4rem;
        border: 0.1rem solid transparent;
        border-color: var(--accent2);
        &.hidden {
            width: 0;
            min-width: 9rem;
            border-bottom-left-radius: 0.4rem;
            border-bottom-right-radius: 0.4rem;
        }
    }

    .header-info {
        align-items: center;
        gap: 0.3rem;
    }

    .header-actions {
        align-items: center;
        gap: 0.3rem;
        cursor: default;
        /* against the button on the end of the bar, however wide the title and its detail are:
           the bar is `space-between`, which would otherwise strand the controls in the middle */
        margin-left: auto;
    }

    .draggable-container-content {
        interpolate-size: allow-keywords; /* 👈 */
        border: 0.1rem solid var(--accent2);
        border-bottom-left-radius: 0.8rem;
        border-bottom-right-radius: 0.8rem;
        height: auto;
        transition: all 0.2s;
        overflow: hidden;
        &.hidden {
            border: 0.1rem solid transparent;
            height: 0;
            transition: all 0s;
        }
    }

</style>
