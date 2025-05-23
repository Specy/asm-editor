<script lang="ts">
    import Button from '$cmp/shared/button/Button.svelte'
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import FaTimes from 'svelte-icons/fa/FaTimes.svelte'
    interface Props {
        visible: boolean
        title: string
        style?: string
        header?: import('svelte').Snippet
        children?: import('svelte').Snippet
    }

    let { visible = $bindable(), title, style = '', header, children }: Props = $props()
</script>

<div class="floating-container" class:hidden={!visible} {style}>
    <div class="row floating-container-header">
        <div style="white-space: nowrap;">{title}</div>
        {@render header?.()}
        <Button
            style="padding: 0.5rem"
            hasIcon
            onClick={() => {
                visible = !visible
            }}
            cssVar="secondary"
        >
            <Icon>
                <FaTimes />
            </Icon>
        </Button>
    </div>
    {@render children?.()}
</div>

<style lang="scss">
    .floating-container-header {
        font-weight: bold;
        font-size: 1.2rem;
        padding: 0.6rem;
        gap: 0.4rem;
        padding-left: 1rem;
        justify-content: space-between;
        flex-wrap: wrap;
        background-color: rgba(var(--RGB-secondary), 0.75);
        color: var(--secondary-text);
        align-items: center;
        box-shadow: -2px -1px 27px 4px #00000057;
        z-index: 2;
        border-bottom: 0.2rem solid var(--primary);
    }

    .floating-container {
        display: flex;
        flex-direction: column;
        position: absolute;
        width: 30rem;
        overflow: hidden;
        max-width: calc(100vw - 2rem);
        top: 50vh;
        left: 50vw;
        transform: translate(-50%, -50%);
        border-radius: 0.8rem;
        z-index: 5;
        background-color: rgba(var(--RGB-tertiary), 0.9);
        color: var(--tertiary-text);
        backdrop-filter: blur(3px);
        opacity: 1;
        transition: all 0.25s;
        transform-origin: top left;
        scale: 1;
        box-shadow: -2px -1px 27px 4px #00000057;
    }
    @keyframes delayHide {
        99% {
        }
        100% {
            visibility: hidden;
        }
    }
    .hidden {
        opacity: 0;
        scale: 1.01;
        transform: translate(-50%, calc(-50% - 1rem));
        animation: delayHide 0.25s forwards;
    }
</style>
