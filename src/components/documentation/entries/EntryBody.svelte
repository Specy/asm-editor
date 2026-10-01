<script lang="ts">
    /**
     * What a **Documentation entry** shows when it is read: an expanded row in the Documentation
     * panel, or the entry on its Chapter's page. One renderer per kind of view.
     */
    import MarkdownRenderer from '$cmp/shared/markdown/MarkdownRenderer.svelte'
    import type { DocumentationEntry } from '$lib/documentation/entries'
    import CodeSample from './CodeSample.svelte'
    import InlineMarkdown from './InlineMarkdown.svelte'
    import M68KInstructionView from './M68KInstructionView.svelte'
    import MarsInstructionView from './MarsInstructionView.svelte'
    import X86InstructionView from './X86InstructionView.svelte'
    import Z80InstructionView from './Z80InstructionView.svelte'

    interface Props {
        entry: DocumentationEntry
        /** Off in an Exam: links into the Documentation stay, as marks the panel follows. */
        disableLinks?: boolean
    }

    let { entry, disableLinks = false }: Props = $props()

    const view = $derived(entry.view)
</script>

<div class="entry-body">
    {#if view.type === 'markdown'}
        <MarkdownRenderer
            source={view.markdown}
            linksInNewTab
            {disableLinks}
            centered={false}
            simpleCode
        />
    {:else if view.type === 'fields'}
        {#if view.markdown}
            <MarkdownRenderer
                source={view.markdown}
                linksInNewTab
                {disableLinks}
                centered={false}
                simpleCode
            />
        {/if}
        {#if view.fields.length > 0}
            <dl class="fields">
                {#each view.fields as field, index (index)}
                    <dt>{field.label}</dt>
                    <dd><InlineMarkdown source={field.value} /></dd>
                {/each}
            </dl>
        {/if}
        {#if view.example}
            <CodeSample code={view.example} label="Example" />
        {/if}
        {#if view.after && view.after.length > 0}
            <dl class="fields">
                {#each view.after as field, index (index)}
                    <dt>{field.label}</dt>
                    <dd><InlineMarkdown source={field.value} /></dd>
                {/each}
            </dl>
        {/if}
    {:else if view.type === 'swatches'}
        {#if view.markdown}
            <MarkdownRenderer
                source={view.markdown}
                linksInNewTab
                {disableLinks}
                centered={false}
                simpleCode
            />
        {/if}
        <ul class="swatches">
            {#each view.swatches as swatch (swatch.name)}
                <li>
                    <span class="swatch" style:background-color={swatch.color}></span>
                    <span class="swatch-name">{swatch.name}</span>
                    <code>{swatch.value}</code>
                </li>
            {/each}
        </ul>
    {:else if view.type === 'm68k-instruction'}
        <M68KInstructionView instruction={view.instruction} {disableLinks} />
    {:else if view.type === 'mips-instruction' || view.type === 'riscv-instruction'}
        <MarsInstructionView variants={view.variants} {disableLinks} />
    {:else if view.type === 'x86-instruction'}
        <X86InstructionView instruction={view.instruction} {disableLinks} />
    {:else if view.type === 'z80-instruction'}
        <Z80InstructionView variants={view.variants} {disableLinks} />
    {/if}
</div>

<style>
    .entry-body {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
        min-width: 0;
        line-height: 1.45;
    }
    /* An entry is reference, read in a side panel as often as on a page: the app's own text font
       and compact code, where a Lecture's markdown uses a serif and wide, shadowed blocks. */
    .entry-body :global(._markdown p),
    .entry-body :global(._markdown ul),
    .entry-body :global(._markdown ol) {
        font-family: inherit;
        font-weight: normal;
        font-size: 0.92rem;
        width: 100%;
        margin: 0;
    }
    .entry-body :global(._markdown pre:has(code)) {
        min-width: 0;
        max-width: 100%;
        margin: 0.3rem 0;
        box-shadow: none;
    }
    .entry-body :global(a),
    .entry-body :global(.doc-link) {
        color: var(--accent);
        text-decoration: underline;
    }
    .entry-body :global(.doc-link) {
        cursor: pointer;
    }
    .entry-body :global(blockquote) {
        margin: 0.2rem 0;
        padding: 0.4rem 0.7rem;
        border-left: 0.2rem solid var(--accent);
        border-radius: 0.3rem;
        background-color: color-mix(in srgb, var(--accent) 8%, transparent);
    }
    .entry-body :global(._markdown table) {
        font-size: 0.85rem;
    }
    .entry-body :global(._markdown td),
    .entry-body :global(._markdown th) {
        font-family: inherit;
    }
    .fields {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.3rem 0.8rem;
        margin: 0;
        font-size: 0.95rem;
    }
    dt {
        font-family: 'Fira Code', monospace;
        font-size: 0.9rem;
        color: var(--accent);
        white-space: nowrap;
    }
    dd {
        margin: 0;
        min-width: 0;
        overflow-wrap: anywhere;
    }
    .swatches {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(11rem, 1fr));
        gap: 0.4rem 0.8rem;
        margin: 0;
        padding: 0;
        list-style: none;
    }
    .swatches li {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        min-width: 0;
    }
    .swatch {
        flex: none;
        width: 1.1rem;
        height: 1.1rem;
        border-radius: 0.25rem;
        border: 1px solid var(--wb-line, var(--tertiary));
    }
    .swatch-name {
        flex: 1;
        min-width: 0;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .swatches code {
        font-family: 'Fira Code', monospace;
        font-size: 0.85rem;
        color: var(--background-text-muted);
    }
</style>
