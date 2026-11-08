<script lang="ts">
    /**
     * A Markdown text being written, as the **Exam** builder's instructions and prompts are: the
     * text in Monaco's Markdown mode, and beside it or behind Text · Preview tabs on the editor's
     * top edge (`TabStrip`'s `strip` look) the text as the Exam session will show it
     * ([ADR 0053](../../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
     */
    import Editor from '#cmp/specific/project/Editor.svelte'
    import TabStrip from '#cmp/shared/input/TabStrip.svelte'
    import FaAlignLeft from '~icons/fa-solid/align-left'
    import FaEye from '~icons/fa-solid/eye'
    import MarkdownRenderer from './MarkdownRenderer.svelte'

    let {
        value = $bindable(''),
        layout = 'auto',
        lineNumbers = true,
        gutterSpacing = false
    }: {
        value?: string
        /**
         * The text and the preview side by side (`split`), one at a time behind tabs (`switch`),
         * or side by side only when the editor itself is at least 768px wide (`auto`), as a
         * full-width box is and a half-width column is not.
         */
        layout?: 'split' | 'switch' | 'auto'
        /** Configure preview line numbers in code; this does not add a UI toggle. */
        lineNumbers?: boolean
        /** Reserve editor gutter spacing in the Markdown preview. Off by default. */
        gutterSpacing?: boolean
    } = $props()

    const VIEWS = [
        { id: 'text', label: 'Text', icon: FaAlignLeft },
        { id: 'preview', label: 'Preview', icon: FaEye }
    ] as const

    let view = $state<'text' | 'preview'>('text')

    //each tab names the pane it shows, for a screen reader
    const panes = $props.id()
    const paneId = (id: string) => `${panes}-${id}`
    //side by side there are no tabs, so the panes are not their panels
    const tabbed = $derived(layout !== 'split')
</script>

<div class="markdown-editor" class:split={layout === 'split'} class:auto={layout === 'auto'}>
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
            role={tabbed ? 'tabpanel' : undefined}
            aria-label={tabbed ? 'Text' : undefined}
        >
            <Editor language="markdown" bind:code={value} />
        </div>
        <div
            class="preview"
            class:shown={view === 'preview'}
            id={paneId('preview')}
            role={tabbed ? 'tabpanel' : undefined}
            aria-label={tabbed ? 'Preview' : undefined}
        >
            <MarkdownRenderer
                source={value}
                disableLinks
                monacoColors
                centered={false}
                {lineNumbers}
                {gutterSpacing}
            />
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
        container-type: inline-size;
        display: flex;
        flex: 1;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        border: 1px solid var(--line);
        border-radius: var(--r-control);
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

    /* side by side: no tabs, both panes, a line between them */
    @mixin side-by-side {
        .views {
            display: none;
        }
        .text,
        .preview {
            display: flex;
        }
        .preview {
            border-left: 1px solid var(--line);
        }
    }
    .split {
        @include side-by-side;
    }
    @container (min-width: 768px) {
        .auto {
            @include side-by-side;
        }
    }
</style>
