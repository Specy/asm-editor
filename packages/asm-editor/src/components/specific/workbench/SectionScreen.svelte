<script lang="ts">
    /**
     * The Screen's folding section, in the Sections arrangement and on tablets and phones: a fixed
     * height in a column that scrolls, which the handle under the section drags taller or shorter.
     * The handle takes the place of the gap between this card and the next, as the column's other
     * splitters do, and is there while the section is open. The height is the person's, kept with
     * the rest of the Workbench's layout, and a double click on the handle gives the section back
     * its own.
     */
    import Splitter from '#cmp/shared/layout/Splitter.svelte'
    import type { ScreenHeader } from '#cmp/specific/project/screen/screenHeader.ts'
    import { LAYOUT_LIMITS, workbenchLayout } from '#stores/workbenchLayoutStore.svelte.ts'
    import CollapsibleSection from './CollapsibleSection.svelte'
    import ScreenArea from './ScreenArea.svelte'

    interface Props {
        /** The section's id, under which its folding is kept. */
        id: string
        /** The height before it is dragged, as CSS. */
        defaultHeight: string
    }

    let { id, defaultHeight }: Props = $props()

    const layout = workbenchLayout.values
    const open = $derived(!workbenchLayout.isCollapsed(id, true))
    //the Screen's size and controls, which the section shows in its own header while it is open:
    //folded, the Screen is still built but has no size to fit and nothing to show
    let header: ScreenHeader | undefined = $state()
    //the default is CSS, so the handle reads what it measures to until the first drag
    let measured = $state(0)
    const height = $derived(
        layout.screenHeight === null ? defaultHeight : `${layout.screenHeight}px`
    )
</script>

<CollapsibleSection
    {id}
    title="Screen"
    defaultCollapsed
    info={open ? header?.info : undefined}
    actions={open ? header?.actions : undefined}
>
    <div class="screen-slot" bind:clientHeight={measured}>
        <ScreenArea
            style="height: {height}; flex: none; border-radius: 0;"
            headerless
            onHeader={(next) => (header = next)}
        />
    </div>
</CollapsibleSection>
{#if open}
    <!-- in the column's gap rather than beside it: the margins take back the gaps on either side,
         and the handle is as tall as the gap was, or the 1px rule of Lines -->
    <Splitter
        orientation="horizontal"
        size={layout.screenHeight ?? measured}
        min={LAYOUT_LIMITS.screenHeight.min}
        max={LAYOUT_LIMITS.screenHeight.max}
        automatic={layout.screenHeight === null}
        label="Resize the Screen"
        style="margin: calc(-1 * var(--wb-gap)) 0;"
        onResize={(size) => workbenchLayout.setScreenHeight(size)}
        onReset={() => workbenchLayout.setScreenHeight(null)}
    />
{/if}

<style>
    .screen-slot {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
</style>
