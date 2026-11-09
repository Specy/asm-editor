<script lang="ts">
    /**
     * A Markdown text being written, as the **Exam** builder's instructions and prompts are: the
     * text in Monaco's Markdown mode, and behind Text · Preview tabs on the editor's top edge
     * (`TabStrip`'s `strip` look) the text as the Exam session will show it, its code numbered
     * ([ADR 0053](../../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
     */
    import Editor from '#cmp/specific/project/Editor.svelte'
    import TabStrip from '#cmp/shared/input/TabStrip.svelte'
    import FaAlignLeft from '~icons/fa-solid/align-left'
    import FaEye from '~icons/fa-solid/eye'
    import MarkdownRenderer from './MarkdownRenderer.svelte'

    let { value = $bindable('') }: { value?: string } = $props()

    const VIEWS = [
        { id: 'text', label: 'Text', icon: FaAlignLeft },
        { id: 'preview', label: 'Preview', icon: FaEye }
    ] as const

    let view = $state<'text' | 'preview'>('text')

    //each tab names the pane it shows, for a screen reader
    const panes = $props.id()
    const paneId = (id: string) => `${panes}-${id}`
</script>

<div class="markdown-editor">
    <div class="views">
        <TabStrip
            ariaLabel="View"
            tabs={VIEWS}
            selected={view}
            panelId={paneId}
            onselect={(id) => (view = id as 'text' | 'preview')}
        >
            {#snippet tab(item)}
                <span class="tab-face">
                    <span class="tab-icon"><item.icon /></span>
                    {item.label}
                </span>
            {/snippet}
        </TabStrip>
    </div>
    <div class="panes">
        <div
            class="text"
            class:shown={view === 'text'}
            id={paneId('text')}
            role="tabpanel"
            aria-label="Text"
        >
            <Editor language="markdown" bind:code={value} />
        </div>
        <div
            class="preview"
            class:shown={view === 'preview'}
            id={paneId('preview')}
            role="tabpanel"
            aria-label="Preview"
        >
            <MarkdownRenderer source={value} disableLinks monacoColors centered={false} />
        </div>
    </div>
</div>

<style lang="scss">
    /* one edge round the tabs and the editor together, the Card's edge as the C starter code's
       editor beside it has, so that the first tab sits against it with no second line: the tabs a
       strip of the page's colour over the editor, the picked tab in the editor's colour and open
       onto it, as a Workbench pane's tabs are */
    .markdown-editor {
        --wb-strip: var(--background);
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        overflow: hidden;
    }

    /* a tab is its icon and its name, as the bottom panel's are */
    .tab-face {
        display: flex;
        align-items: center;
        gap: 0.45rem;
    }
    .tab-icon {
        display: grid;
        place-items: center;
        width: var(--fs-small);
        height: var(--fs-small);
    }

    /* the editor under the strip's rule, inside the edge round both */
    .panes {
        display: flex;
        flex: 1;
        min-height: 0;
        background-color: var(--secondary);
        overflow: hidden;
    }
    .text,
    .preview {
        display: none;
        flex: 1;
        min-width: 0;
        min-height: 0;
    }
    .text {
        position: relative;
    }
    /* in the editor's colour, which the picked tab is drawn in, as the Workbench's Preview is */
    .preview {
        flex-direction: column;
        padding: 0.6rem 0.8rem;
        overflow: auto;
        background-color: var(--secondary);
    }
    .shown {
        display: flex;
    }

    /* the editor's corners are its edge's; Monaco's own would only nick them */
    .text :global(.monaco-editor),
    .text :global(.monaco-editor .overflow-guard) {
        border-radius: 0;
    }
</style>
