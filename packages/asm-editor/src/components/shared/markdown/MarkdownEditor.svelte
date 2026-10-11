<script lang="ts">
    import './md.scss'
    import { Carta, MarkdownEditor } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    import remarkGfm from 'remark-gfm'
    import '@cartamd/plugin-code/default.css'
    import type { Plugin } from 'carta-md'
    import { code as codeExt } from '@cartamd/plugin-code'
    import { codeBlocks } from '#lib/content/codeBlocks.ts'
    import { assemblyPaletteStyle } from '#lib/content/assemblyPalette.ts'
    import { ThemeStore } from '#stores/themeStore.svelte.ts'
    import { EDITOR_FONT } from '#lib/monaco/editorFont.ts'
    import './codeBlocks.css'

    let {
        value = $bindable(),
        lineNumbers = true,
        gutterSpacing = false
    }: {
        value?: string
        /** Configure preview line numbers in code; this does not add a UI toggle. */
        lineNumbers?: boolean
        /** Reserve editor gutter spacing in the Markdown preview. Off by default. */
        gutterSpacing?: boolean
    } = $props()

    const isDark = $derived(ThemeStore.isColorDark(ThemeStore.theme.secondary.color))
    const palette = $derived(assemblyPaletteStyle(isDark))

    const ext: Plugin = {
        transformers: [
            {
                execution: 'sync',
                type: 'rehype',
                transform({ processor }) {
                    processor.use(remarkGfm).use(rehypeRaw)
                }
            }
        ]
    }

    const carta = new Carta({
        sanitizer: (html) => {
            return DOMPurify.sanitize(html, {
                ADD_TAGS: ['iframe']
            })
        },
        extensions: [ext, codeExt({ langs: ['mips', 'riscv', 'asm'] }), codeBlocks()],
        rehypeOptions: {
            allowDangerousHtml: true
        }
    })
</script>

<div
    class="markdown-editor"
    class:dark-code={isDark}
    class:code-gutter-spacing={gutterSpacing}
    style={palette}
    style:--code-block-gutter-display={lineNumbers ? 'block' : 'none'}
    style:--example-font-family={EDITOR_FONT.fontFamily}
    style:--example-font-size={`${EDITOR_FONT.fontSize}px`}
    style:--example-line-height={`${EDITOR_FONT.lineHeight}px`}
>
    <MarkdownEditor {carta} bind:value theme="github" />
</div>

<style>
    .markdown-editor {
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
    }
    .markdown-editor :global(.carta-editor) {
        min-width: 0;
    }
    .dark-code :global(pre.shiki > code span) {
        color: var(--shiki-dark) !important;
    }
</style>
