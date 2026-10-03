<script lang="ts">
    /**
     * The top bar of a phone, on the page's own background: the drawer button (as wide as a rail)
     * and the title with Save. The execution controls have their own bar under the editor. A
     * desktop and a tablet have no top bar: Back and Save are in their rail.
     */
    import Icon from '$cmp/shared/layout/Icon.svelte'
    import Button from '$cmp/shared/button/Button.svelte'
    import FaSave from '~icons/fa-solid/save'
    import FaBars from '~icons/fa-solid/bars'
    import { useWorkbench } from './workbenchContext'

    const context = useWorkbench()
    const { session, ui } = context
</script>

<header class="top-bar">
    <button
        class="icon-button rail-width"
        title="Open the menu"
        aria-label="Open the menu"
        aria-expanded={ui.drawerOpen}
        onclick={() => (ui.drawerOpen = !ui.drawerOpen)}
    >
        <Icon size={1.2}>
            <FaBars />
        </Icon>
    </button>
    <h1 class="title ellipsis" title={context.title}>{context.title}</h1>
    {#if context.onSave && context.unsaved}
        <Button
            cssVar="accent2"
            hasIcon
            style="padding: 0 0.7rem; height: 1.9rem; gap: 0.4rem; flex: none; font-size: 0.9rem;"
            title="Save the Project"
            onClick={() => session.save()}
        >
            <Icon size={0.85}>
                <FaSave />
            </Icon>
            Save
        </Button>
    {/if}
</header>

<style lang="scss">
    .top-bar {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: none;
        height: var(--wb-top-height);
        padding: 0 var(--wb-gap);
        color: var(--background-text);
        border-bottom: 1px solid var(--wb-divider);
    }

    .rail-width {
        flex: none;
        align-self: stretch;
        width: var(--wb-rail-width);
    }

    .icon-button {
        display: grid;
        place-items: center;
        padding: 0;
        background: transparent;
        color: inherit;
        cursor: pointer;
        border-radius: 0.3rem;

        &:hover {
            background-color: var(--secondary);
        }
    }

    .title {
        font-size: 1.05rem;
        font-weight: bold;
        min-width: 3rem;
        margin: 0;
    }
</style>
