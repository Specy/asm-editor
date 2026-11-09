<script lang="ts">
    import { inlineMarkdown } from './inlineMarkdown'

    interface Props {
        source: string
        /**
         * Its code in the accent on the secondary fill, as a Markdown page's inline code is
         * (MarkdownRenderer), where a reference entry's is in the tertiary's colours: a language's
         * documentation hub's introduction.
         */
        accentCode?: boolean
    }

    let { source, accentCode = false }: Props = $props()
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped first, see inlineMarkdown.ts -->
<span class="inline-markdown" class:accent-code={accentCode}>{@html inlineMarkdown(source)}</span>

<style>
    .inline-markdown :global(code) {
        font-family: var(--font-mono);
        font-size: 0.9em;
        padding: 0.05rem 0.3rem;
        border-radius: var(--r-chip);
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    .inline-markdown.accent-code :global(code) {
        background-color: var(--secondary);
        color: var(--accent);
    }
    .inline-markdown :global(a) {
        color: var(--accent);
        text-decoration: underline;
    }
</style>
