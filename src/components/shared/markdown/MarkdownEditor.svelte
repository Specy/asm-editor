<script lang="ts">
    import './md.scss'
    import { Carta, MarkdownEditor } from 'carta-md'
    import DOMPurify from 'isomorphic-dompurify'
    import rehypeRaw from 'rehype-raw'
    import remarkGfm from 'remark-gfm'
    import '@cartamd/plugin-code/default.css'
    import type { Plugin } from 'carta-md'
    import { code as codeExt } from '@cartamd/plugin-code'

    let {
        value = $bindable()
    }: {
        value?: string
    } = $props()

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
        extensions: [ext, codeExt({ langs: ['mips', 'riscv', 'asm'] })],
        rehypeOptions: {
            allowDangerousHtml: true
        }
    })
</script>

<MarkdownEditor {carta} bind:value theme="github" />
