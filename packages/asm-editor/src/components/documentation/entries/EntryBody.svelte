<script lang="ts">
    /**
     * What a **Documentation entry** shows when it is read: an expanded row in the Documentation
     * panel, or the entry on its Chapter's page. One renderer per kind of view.
     */
    import MarkdownRenderer from '#cmp/shared/markdown/MarkdownRenderer.svelte'
    import type { DocumentationEntry } from '#lib/documentation/entries.ts'
    import CodeSample from './CodeSample.svelte'
    import InlineMarkdown from './InlineMarkdown.svelte'
    import InstructionDocumentView from '../instruction/InstructionDocumentView.svelte'

    interface Props {
        entry: DocumentationEntry
        /** Off in an Exam: links into the Documentation stay, as marks the panel follows. */
        disableLinks?: boolean
        /** An instruction's toggles drawn as folding headers: the Workbench's panel's. */
        foldingToggles?: boolean
    }

    let { entry, disableLinks = false, foldingToggles = false }: Props = $props()

    const view = $derived(entry.view)

    /**
     * The language an entry's example is highlighted as: an instruction's program, a directive in
     * use, a port's program or a library function's call are all assembly of the entry's language.
     */
    const EXAMPLE_LANGUAGES = {
        m68k: 'M68K',
        mips: 'MIPS',
        'risc-v': 'RISC-V',
        x86: 'X86',
        z80: 'Z80'
    } as const
</script>

<div class="entry-body">
    {#if view.type === 'instruction'}
        <InstructionDocumentView
            document={view.document}
            density="panel"
            {disableLinks}
            {foldingToggles}
            language={EXAMPLE_LANGUAGES[entry.language]}
        >
            {#snippet example()}
                {#if entry.instructionContent?.example}
                    <CodeSample
                        code={entry.instructionContent.example.code}
                        language={entry.instructionContent.example.target}
                    />
                {:else if view.example}
                    <CodeSample code={view.example} language={EXAMPLE_LANGUAGES[entry.language]} />
                {/if}
            {/snippet}
        </InstructionDocumentView>
    {/if}
    {#if view.type !== 'instruction' && entry.instructionContent?.description}
        <MarkdownRenderer
            source={entry.instructionContent.description}
            linksInNewTab
            {disableLinks}
            centered={false}
            simpleCode
        />
    {/if}
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
            <CodeSample
                code={view.example}
                label="Example"
                language={EXAMPLE_LANGUAGES[entry.language]}
            />
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
    {/if}
    {#if view.type !== 'instruction' && entry.instructionContent?.example}
        <CodeSample
            code={entry.instructionContent.example.code}
            language={entry.instructionContent.example.target}
        />
    {/if}
</div>

<style>
    /* The text's size is --entry-text-size where the entry's place sets one, --fs-small otherwise:
       a Chapter's page reads its cards a step larger, at --fs-body, and so does an entry expanded
       in the Workbench's Documentation panel (EntryRow), where the panel's other rows stay dense
       (owner, 2026-11-08). The code samples keep their own size */
    .entry-body {
        /* Keep positioned entry content beneath the sticky chapter and category headings. */
        isolation: isolate;
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
        font-family: var(--font-ui);
        font-weight: 400;
        font-size: var(--entry-text-size, var(--fs-small));
        width: 100%;
        margin: 0;
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
        border-left: 3px solid var(--accent);
        border-radius: 0.3rem;
        background-color: color-mix(in srgb, var(--accent) 8%, transparent);
    }
    /* a table's own size where the entry's place sets one: a Chapter's page reads every table at
       --fs-body, its prose entries' as well as its cards' (owner, 2026-11-08) */
    .entry-body :global(._markdown table) {
        font-size: var(--entry-table-size, var(--entry-text-size, var(--fs-small)));
    }
    .entry-body :global(._markdown td),
    .entry-body :global(._markdown th) {
        font-family: var(--font-ui);
    }
    .fields {
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.3rem 0.8rem;
        margin: 0;
        font-size: var(--fs-body);
    }
    dt {
        font-family: var(--font-mono);
        font-size: var(--entry-text-size, var(--fs-small));
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
        font-family: var(--font-mono);
        font-size: var(--entry-text-size, var(--fs-small));
        color: var(--background-text-prose);
    }
</style>
