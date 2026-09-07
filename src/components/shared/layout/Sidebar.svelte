<script lang="ts">
    import Row from '$cmp/shared/layout/Row.svelte'

    interface Props {
        children?: import('svelte').Snippet
        content?: import('svelte').Snippet
        menuOpen?: boolean
        menuStyle?: string
    }

    let { children, content, menuOpen = $bindable(false), menuStyle }: Props = $props()
</script>

<!-- the drawer's width lives on the wrapper so the menu and the content it leaves room for
     cannot drift apart -->
<Row flex1 style="--side-menu-width: 20rem;">
    <button
        class="side-menu-underlay"
        aria-label="close menu"
        class:side-menu-underlay-open={menuOpen}
        onclick={() => (menuOpen = false)}
    >
    </button>
    <aside class="side-menu column" style={menuStyle} class:menu-open={menuOpen}>
        {@render children?.()}
    </aside>
    <div class="content">
        {@render content?.()}
    </div>
</Row>

<style lang="scss">
    @media print {
        .side-menu {
            display: none;
        }
        .side-menu-underlay {
            display: none;
        }
        .content {
            max-width: 100%;
            height: auto;
            overflow: visible;
        }
    }

    .side-menu {
        background-color: var(--secondary);
        color: var(--secondary-text);
        width: var(--side-menu-width);
        min-width: var(--side-menu-width);
        gap: 1rem;
        top: 3.2rem;
        padding-top: 1rem;
        height: calc(var(--screen-height) - 3.2rem);
        overflow-y: auto;
        position: sticky;
    }

    .mobile-only {
        display: none;
    }

    .content {
        width: 100%;
        display: flex;
        flex: 1;
        max-width: calc(100vw - var(--side-menu-width));
    }

    @media (max-width: 600px) {
        .content {
            max-width: unset;
        }
        .side-menu {
            //a drawer, not a column beside the content: the width the desktop rule asks for would
            //be wider than a narrow phone and would keep the menu on screen when it is closed
            --side-menu-width: calc(100vw - 4rem);
            position: fixed;
            left: 0;
            z-index: 5;
            transition: transform 0.3s;
            background-color: rgba(var(--RGB-secondary), 0.9);
            //its own width, whatever that resolves to, so the drawer always leaves the screen
            //completely
            transform: translateX(-100%);
        }
        .mobile-only {
            display: flex;
        }
        .menu-open {
            transform: translateX(0);
        }
    }

    .instruction-search {
        background-color: var(--tertiary);
        color: var(--tertiary-text);
        padding: 0.6rem;
        border-radius: 0.4rem;
    }

    .icon {
        height: 2.2rem;
        display: flex;
        align-items: center;
        gap: 1rem;

        img {
            height: 100%;
        }

        &:hover {
            color: var(--accent);
        }
    }

    .side-menu-underlay {
        position: fixed;
        top: 3.2rem;
        left: 0;
        width: 100vw;
        height: 100%;
        background-color: rgba(0, 0, 0, 0.5);
        opacity: 0;
        pointer-events: none;
        cursor: pointer;
        z-index: 3;
        transition: opacity 0.3s;
        backdrop-filter: blur(0.2rem);
    }

    .side-menu-underlay-open {
        opacity: 1;
        pointer-events: all;
    }
</style>
