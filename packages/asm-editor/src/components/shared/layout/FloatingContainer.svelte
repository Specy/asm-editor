<script lang="ts">
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import FaTimes from '~icons/fa-solid/times'
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
        <IconButton
            size="lg"
            label="Close {title}"
            onClick={() => {
                visible = !visible
            }}
        >
            <Icon>
                <FaTimes />
            </Icon>
        </IconButton>
    </div>
    {@render children?.()}
</div>

<style lang="scss">
    @use '../button/tray.scss';

    /* its title over the body, raised as a sticky header is */
    .floating-container-header {
        font-weight: bold;
        font-size: 1.2rem;
        padding: 0.6rem;
        gap: 0.4rem;
        padding-left: 1rem;
        justify-content: space-between;
        flex-wrap: wrap;
        background-color: color-mix(in srgb, var(--secondary) 75%, transparent);
        color: var(--secondary-text);
        align-items: center;
        box-shadow: var(--shadow-1);
        z-index: 2;
        border-bottom: 3px solid var(--primary);
    }

    /* a Tray, floating free over the page */
    .floating-container {
        @include tray.surface;
        display: flex;
        flex-direction: column;
        position: fixed;
        width: 30rem;
        overflow: hidden;
        max-width: calc(100vw - 2rem);
        top: calc(var(--screen-height) * 0.5);
        left: 50vw;
        transform: translate(-50%, -50%);
        z-index: 5;
        opacity: 1;
        transition:
            opacity var(--dur-base),
            transform var(--dur-base),
            scale var(--dur-base);
        transform-origin: top left;
        scale: 1;
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
        animation: delayHide var(--dur-base) forwards;
    }
</style>
