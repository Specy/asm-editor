<script lang="ts">
    import { inlineMarkdown } from './inlineMarkdown'

    interface Props {
        source: string
    }

    let { source }: Props = $props()
</script>

<!-- eslint-disable-next-line svelte/no-at-html-tags -- escaped first, see inlineMarkdown.ts -->
<span class="inline-markdown">{@html inlineMarkdown(source)}</span>

<style>
    .inline-markdown :global(code) {
        font-family: 'Fira Code', monospace;
        font-size: 0.9em;
        padding: 0.05rem 0.3rem;
        border-radius: 0.3rem;
        background-color: var(--tertiary);
        color: var(--tertiary-text);
    }
    .inline-markdown :global(a) {
        color: var(--accent);
        text-decoration: underline;
    }
</style>
