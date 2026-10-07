<script lang="ts">
    import './md.scss'
    import { Carta, MarkdownEditor } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    import remarkGfm from 'remark-gfm'
    import '@cartamd/plugin-code/default.css'
    import type { Plugin } from 'carta-md'
    import { code as codeExt } from '@cartamd/plugin-code'
    import { codeBlocks } from '$lib/content/codeBlocks'
    import { assemblyPalette } from '$lib/content/assemblyPalette'
    import { ThemeStore } from '$stores/themeStore.svelte'
    import { EXAMPLE_EDITOR_FONT } from '$lib/monaco/exampleFont'
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
    const palette = $derived(assemblyPalette(isDark))

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
    style:--code-block-gutter-display={lineNumbers ? 'block' : 'none'}
    style:--asm-comment={palette.comment}
    style:--asm-mnemonic={palette.mnemonic}
    style:--asm-directive={palette.directive}
    style:--asm-number={palette.number}
    style:--asm-string={palette.string}
    style:--asm-register={palette.register}
    style:--example-font-family={EXAMPLE_EDITOR_FONT.fontFamily}
    style:--example-font-size={`${EXAMPLE_EDITOR_FONT.fontSize}px`}
    style:--example-line-height={`${EXAMPLE_EDITOR_FONT.lineHeight}px`}
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
