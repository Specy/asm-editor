<script lang="ts">
    import Splitter from '$cmp/shared/layout/Splitter.svelte'
    import EditorPane from './EditorPane.svelte'
    import SourceMapConnections from './SourceMapConnections.svelte'
    import { useWorkbench } from './workbenchContext'

    //Tabs remain visible in compact layouts so both groups can be navigated and closed.
    let {
        controls = false,
        fill = false,
        style = ''
    }: { controls?: boolean; fill?: boolean; style?: string } = $props()
    const { session } = useWorkbench()
    let frameWidth = $state(0)
    const gutterWidth = $derived(session.groups.length < 2 ? 0 : session.mappingPair ? 48 : 4)
    const paneWidth = $derived(Math.max(0, frameWidth - gutterWidth))
    const minPaneWidth = $derived(Math.min(160, paneWidth / 2))
    const leftWidth = $derived(
        Math.min(paneWidth - minPaneWidth, Math.max(minPaneWidth, paneWidth * session.editorRatio))
    )
    const leftShare = $derived(paneWidth > 0 ? leftWidth / paneWidth : 0.5)
    const activeLocation = $derived(session.mappingSelection ?? session.executionSourceLocation)
</script>

{#snippet divider()}
    <Splitter
        orientation="vertical"
        size={leftWidth}
        min={minPaneWidth}
        max={paneWidth - minPaneWidth}
        label="Resize file editors"
        style="--splitter-size: 0.25rem; --splitter-line: transparent;"
        onResize={(width) => {
            if (paneWidth > 0) session.editorRatio = width / paneWidth
        }}
        onReset={() => (session.editorRatio = 0.5)}
    />
{/snippet}

<div class="editor-area" class:split={session.groups.length > 1} {style}>
    <div
        class="editor-frame"
        bind:clientWidth={frameWidth}
        class:failed={session.emulator.errors.length > 0}
        class:split={session.groups.length > 1}
    >
        {#each session.groups as group, index (group.id)}
            {#if index === 1}
                {#if session.mappingPair && session.mappingColors}
                    <SourceMapConnections
                        sourceEditor={session.mappingPair.source.editor}
                        assemblyEditor={session.mappingPair.assembly.editor}
                        sourceOnLeft={session.mappingPair.source === session.groups[0]}
                        sourcePath={session.mappingPair.source.displayedPath}
                        coloring={session.mappingColors}
                        {activeLocation}
                        {divider}
                    />
                {:else}
                    <div class="plain-divider">{@render divider()}</div>
                {/if}
            {/if}
            <EditorPane
                {group}
                {controls}
                {fill}
                share={session.groups.length === 1 ? 1 : index === 0 ? leftShare : 1 - leftShare}
            />
        {/each}
    </div>
</div>

<style lang="scss">
    .editor-area {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        background: var(--secondary);
        border-radius: var(--wb-radius);
        border: var(--wb-card-edge);
        overflow: hidden;
    }
    .editor-frame {
        position: relative;
        display: flex;
        flex: 1;
        min-height: 0;
    }
    .plain-divider {
        position: relative;
        display: flex;
        flex: 0 0 4px;
        background: var(--secondary);
        //The band beside the file tabs continues the tab strip, and the separator starts below it.
        &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 2.25rem;
            box-sizing: border-box;
            border-bottom: 1px solid var(--wb-line);
            background: var(--wb-strip);
        }
        > :global(*) {
            margin-top: 2.25rem;
            box-shadow: inset 1px 0 0 var(--wb-line);
        }
    }
    .editor-area :global(.monaco-editor .scroll-decoration) {
        display: none;
    }
    .editor-frame.split :global(.editor) {
        box-shadow: none;
    }
    //The connector ribbons run slightly under the right editor to hide the join; the left editor
    //stays below the gutter, whose bridges cover its scrollbar.
    .editor-frame :global(.connector-gutter + .editor-pane) {
        z-index: 2;
    }
    .editor-area :global(.monaco-editor),
    .editor-area :global(.monaco-editor .overflow-guard) {
        border-radius: 0;
    }
    .failed::after {
        position: absolute;
        z-index: 4;
        content: '';
        inset: 0;
        border: 0.2rem solid var(--red);
        pointer-events: none;
    }
    @media (max-width: 700px) {
        .editor-area.split {
            min-height: 28rem;
        }
        .editor-frame.split {
            flex-direction: column;
        }
        .plain-divider {
            display: none;
        }
        .editor-frame.split :global(.editor-pane) {
            flex: 1 !important;
            min-height: 12rem;
        }
    }
</style>
