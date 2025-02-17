<script lang="ts" module>
    import type { Plugin } from 'carta-md'
    import { Carta } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    import rehypeExternalLinks from 'rehype-external-links'
    import '@cartamd/plugin-code/default.css'
    import { code } from '@cartamd/plugin-code'

    let isDark = $derived(ThemeStore.isColorDark(ThemeStore.theme.background.color))

    let theme = $derived(isDark ? ('one-dark-pro' as const) : ('one-light' as const))

    const ext: Plugin = {
        transformers: [
            {
                execution: 'async',
                type: 'rehype',
                async transform({ carta }) {
                    const highlighter = await carta.highlighter()
                    await highlighter.loadTheme(theme)
                }
            },
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(rehypeRaw)
                }
            }
        ]
    }
    const extWithExternalLins: Plugin = {
        transformers: [
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(rehypeExternalLinks, {
                        target: '_blank'
                    })
                }
            }
        ]
    }
    const cartaNormal = new Carta({
        sanitizer: DOMPurify.sanitize,
        extensions: [ext, code({ theme, langs: ['mips'] })],
        rehypeOptions: {
            allowDangerousHtml: true
        }
    })
    const cartaWithExternalLins = new Carta({
        sanitizer: DOMPurify.sanitize,
        extensions: [extWithExternalLins, code({ theme, langs: ['mips'] })],
        rehypeOptions: {
            allowDangerousHtml: true
        }
    })
</script>

<script lang="ts">
    import { Markdown } from 'carta-md'
    import { ThemeStore } from '$stores/themeStore.svelte'

    interface Props {
        source: string
        linksInNewTab?: boolean
        style?: string
    }

    let { source, linksInNewTab, style }: Props = $props()

    const carta = linksInNewTab ? cartaWithExternalLins : cartaNormal
</script>

<div class="_markdown" {style}>
    {#key source + theme}
        <Markdown value={source} {carta} />
    {/key}
</div>

<style lang="scss">
    ._markdown {
        display: flex;
        flex-direction: column;
    }

    :global(.shiki) {
        padding: 0.5rem;
        overflow-x: auto;
        border-radius: 0.3rem;
        width: 100%;
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

    :global(._markdown ul, ._markdown ol) {
        padding-left: 1rem;
    }
    :global(._markdown li:not(:last-child)) {
        margin-bottom: 0.5rem;
    }
    :global(._markdown p) {
        white-space: pre-line;
    }
</style>
