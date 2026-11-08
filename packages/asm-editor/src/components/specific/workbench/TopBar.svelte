<script lang="ts">
    /**
     * The top bar of a phone, on the page's own background: the drawer button (as wide as a rail)
     * and the title with Save. The execution controls have their own bar under the editor. A
     * desktop and a tablet have no top bar: Back and Save are in their rail.
     */
    import Icon from '#cmp/shared/layout/Icon.svelte'
    import Button from '#cmp/shared/button/Button.svelte'
    import IconButton from '#cmp/shared/button/IconButton.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import FaSave from '~icons/fa-solid/save'
    import FaBars from '~icons/fa-solid/bars'
    import { useWorkbench } from './workbenchContext'

    const context = useWorkbench()
    const { session, ui } = context
</script>

<header class="top-bar">
    <IconButton
        size="lg"
        class="rail-width"
        label="Open the menu"
        {@attach tooltip('Open the menu')}
        aria-expanded={ui.drawerOpen}
        onClick={() => (ui.drawerOpen = !ui.drawerOpen)}
    >
        <Icon size="lead">
            <FaBars />
        </Icon>
    </IconButton>
    <h1 class="title ellipsis" title={context.title}>{context.title}</h1>
    {#if context.onSave && context.unsaved}
        <Button
            bg="var(--accent2)"
            color="var(--accent2-text)"
            size="sm"
            style="gap: 0.4rem; flex: none;"
            {@attach tooltip('Save the Project')}
            onClick={() => session.save()}
        >
            <Icon size="small">
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

    /* the whole of the bar's height, as wide as the rail under it */
    .top-bar :global(.rail-width) {
        align-self: stretch;
        width: var(--wb-rail-width);
        height: auto;
    }

    .title {
        font-size: var(--fs-prose);
        font-weight: 700;
        min-width: 3rem;
        margin: 0;
    }
</style>
