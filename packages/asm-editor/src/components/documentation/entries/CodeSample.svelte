<script lang="ts">
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { tokenizeAssembly } from '#lib/content/assemblyHighlight.ts'
    import { assemblyTokenClass } from '#lib/content/assemblyPalette.ts'
    import { codeBlockStyle } from '#lib/content/codeBlockStyle.ts'
    import { codeLineNumbers } from '#lib/content/codeBlocks.ts'
    import '#cmp/shared/markdown/codeBlocks.css'

    /** A short code sample of an entry: an instruction's forms, a syscall's call. */
    interface Props {
        code: string
        label?: string
        language?: AvailableLanguages
        /** Fill the instruction editor's card, including its line-number gutter. */
        fill?: boolean
        lineNumbers?: boolean
        /** Reserve the editor's glyph and decoration margins beside the line numbers. */
        gutterSpacing?: boolean
    }

    let {
        code,
        label,
        language,
        fill = false,
        lineNumbers = fill,
        gutterSpacing = false
    }: Props = $props()
    const newline = '\n'
    const lines = $derived.by(() => {
        if (!language) return undefined
        return tokenizeAssembly(code, language).map((tokens) =>
            tokens.map((token) => ({
                text: token.text,
                className: assemblyTokenClass(token, language)
            }))
        )
    })
    const codeStyle = $derived(codeBlockStyle())
</script>

<figure class="code-sample" class:fill style={codeStyle}>
    {#if label}
        <figcaption>{label}</figcaption>
    {/if}
    <pre
        class="code-block"
        class:code-block-fill={fill}
        class:code-gutter-spacing={gutterSpacing}><code
            >{#if lines}{#each lines as tokens, index (index)}{#if index > 0}{newline}{/if}{#each tokens as token, tokenIndex (tokenIndex)}{#if token.className}<span
                                class={token.className}>{token.text}</span
                            >{:else}{token.text}{/if}{/each}{/each}{:else}{code}{/if}</code
        >{#if lineNumbers}<span class="code-gutter" aria-hidden="true">{codeLineNumbers(code)}</span
            >{/if}</pre>
</figure>

<style>
    .code-sample {
        display: flex;
        flex-direction: column;
        gap: 0.2rem;
        margin: 0;
        min-width: 0;
    }
    figcaption {
        font-size: 0.8rem;
        color: var(--background-text-muted);
    }
    .fill {
        flex: 1;
        width: 100%;
        min-height: 0;
        overflow: hidden;
    }
</style>
