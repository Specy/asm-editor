<script lang="ts">
    import Draggable from '$cmp/shared/draggable/Draggable.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaGripHorizontal from 'svelte-icons/fa/FaGripHorizontal.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaEye from 'svelte-icons/fa/FaEye.svelte'
    import FaEyeSlash from 'svelte-icons/fa/FaEyeSlash.svelte'
    import { fly } from 'svelte/transition'
    interface Props {
        hidden?: boolean
        title?: string
        hiddenOnMobile?: boolean
        left?: number
        top?: number
        children?: import('svelte').Snippet
    }

    let {
        hidden = $bindable(true),
        title = '',
        hiddenOnMobile = true,
        left = 300,
        top = 13,
        children
    }: Props = $props()
</script>

<Draggable {hiddenOnMobile} {left} {top}>
    {#snippet header()}
        <button class="tab-header row" class:hidden ondblclick={() => (hidden = !hidden)}>
            <Icon
                style="cursor:inherit; padding: 0.2rem 0.4rem; height: 1.4rem; width: 1.6rem; min-width: 1.6rem"
            >
                <FaGripHorizontal />
            </Icon>
            <div class="ellipsis">{title}</div>
            <Button
                style="padding: 0.2rem 0.3rem; height: 1.4rem; border-radius: 0.3rem"
                cssVar="secondary"
                onClick={() => (hidden = !hidden)}
            >
                <Icon size={1.1}>
                    {#if !hidden}
                        <FaEye />
                    {:else}
                        <FaEyeSlash />
                    {/if}
                </Icon>
            </Button>
        </button>
    {/snippet}
    {#if !hidden}
        <div in:fly|global={{ x: -10, duration: 500 }} out:fly|global={{ x: -10, duration: 300 }}>
            {@render children?.()}
        </div>
    {/if}
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
        position: relative;
        border-top-left-radius: 0.4rem;
        border-top-right-radius: 0.4rem;
        border: 0.1rem solid transparent;
        &.hidden {
            width: 0;
            min-width: 9rem;
            border-bottom-left-radius: 0.4rem;
            border-color: var(--accent2);
            border-bottom-right-radius: 0.4rem;
        }
    }
</style>
