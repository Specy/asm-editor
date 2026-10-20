<script lang="ts">
    /**
     * A Markdown text being written, as the **Exam** builder's instructions and prompts are: the
     * text in Monaco's Markdown mode, and beside it or behind a Text · Preview switch the text as the
     * Exam session will show it ([ADR 0053](../../../../../../docs/adr/0053-markdown-is-rendered-by-our-own-synchronous-pipeline.md)).
     */
    import Editor from '#cmp/specific/project/Editor.svelte'
    import SegmentedControl from '#cmp/specific/project/cpu/SegmentedControl.svelte'
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
         * The text and the preview side by side (`split`), one at a time behind a switch
         * (`switch`), or side by side only when the editor itself is at least 768px wide (`auto`),
         * as a full-width box is and a half-width column is not.
         */
        layout?: 'split' | 'switch' | 'auto'
        /** Configure preview line numbers in code; this does not add a UI toggle. */
        lineNumbers?: boolean
        /** Reserve editor gutter spacing in the Markdown preview. Off by default. */
        gutterSpacing?: boolean
    } = $props()

    const VIEWS = [
        { id: 'text', label: 'Text', title: 'Show the Markdown text', icon: FaAlignLeft },
        { id: 'preview', label: 'Preview', title: 'Show the text as it will read', icon: FaEye }
    ] as const

    let view = $state<'text' | 'preview'>('text')
</script>

<div class="markdown-editor" class:split={layout === 'split'} class:auto={layout === 'auto'}>
    <div class="views">
        <SegmentedControl
            ariaLabel="View"
            options={VIEWS}
            selected={view}
            onSelect={(id) => (view = id as 'text' | 'preview')}
        />
    </div>
    <div class="panes">
        <div class="text" class:shown={view === 'text'}>
            <Editor language="markdown" bind:code={value} />
        </div>
        <div class="preview" class:shown={view === 'preview'}>
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

<style>
    .markdown-editor {
        container-type: inline-size;
        display: flex;
        flex: 1;
        flex-direction: column;
        gap: 0.4rem;
        min-width: 0;
        min-height: 0;
    }
    .views {
        display: flex;
    }
    .panes {
        display: flex;
        flex: 1;
        min-height: 0;
        border: var(--wb-card-edge, 1px solid color-mix(in srgb, var(--tertiary) 60%, transparent));
        border-radius: var(--wb-radius, 0.4rem);
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
    .preview {
        flex-direction: column;
        padding: 0.6rem 0.8rem;
        overflow: auto;
        background-color: var(--background);
    }
    .shown {
        display: flex;
    }

    /* side by side: no switch, both panes, a line between them */
    .split .views {
        display: none;
    }
    .split .text,
    .split .preview {
        display: flex;
    }
    .split .preview {
        border-left: var(
            --wb-card-edge,
            1px solid color-mix(in srgb, var(--tertiary) 60%, transparent)
        );
    }
    @container (min-width: 768px) {
        .auto .views {
            display: none;
        }
        .auto .text,
        .auto .preview {
            display: flex;
        }
        .auto .preview {
            border-left: var(
                --wb-card-edge,
                1px solid color-mix(in srgb, var(--tertiary) 60%, transparent)
            );
        }
    }
</style>
