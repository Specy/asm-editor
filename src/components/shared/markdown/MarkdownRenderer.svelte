<script lang="ts">
    import type { Plugin } from 'carta-md'
    import { Carta, Markdown } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    const ext: Plugin = {
        transformers: [{
            execution: 'sync',
            type: 'rehype',
            transform({ processor }) {
                processor.use(rehypeRaw)
            }
        }]
    }
    export let source: any

    const carta = new Carta({
        sanitizer: DOMPurify.sanitize,
        extensions: [ext],
				rehypeOptions: {
					allowDangerousHtml: true
				}
    })
</script>

<div class="_markdown">
	{#key source}
		<Markdown value={source} {carta} />
	{/key}
</div>

<style lang="scss">

  ._markdown {
    display: flex;
    flex-direction: column;
  }

  :global(._markdown table) {
    border-radius: 0.4rem;
    border-collapse: collapse;
    border-style: hidden;
    overflow: hidden;
    margin: 0.5rem 0;
  }

  :global(._markdown table:last-child) {
    margin-bottom: 0;
  }

  :global(._markdown thead) {
    background-color: var(--accent2);
    color: var(--accent2-text);
  }

  :global(._markdown thead th) {
    padding: 0.4rem;
    border: 0.1rem solid var(--secondary);
  }

  :global(._markdown tbody) {
    background-color: var(--tertiary);
  }

  :global(._markdown td) {
    border: 0.1rem solid var(--secondary);
    padding: 0.2rem 0.4rem;
  }

  :global(._markdown p) {
    white-space: pre-line;
  }
</style>
