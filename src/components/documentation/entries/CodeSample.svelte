<script lang="ts">
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import { tokenizeAssembly } from '$lib/content/assemblyHighlight'
    import { assemblyPalette } from '$lib/content/assemblyPalette'
    import { ScopedTheme, ThemeStore } from '$stores/themeStore.svelte'
    import { EXAMPLE_EDITOR_FONT } from '$lib/monaco/exampleFont'
    import { codeLineNumbers } from '$lib/content/codeBlocks'
    import '$cmp/shared/markdown/codeBlocks.css'

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
    const lines = $derived(language ? tokenizeAssembly(code, language) : undefined)
    const palette = $derived(
        assemblyPalette(
            ThemeStore.isColorDark(
                ScopedTheme.theme?.theme.secondary.color ?? ThemeStore.theme.secondary.color
            )
        )
    )
</script>

<figure
    class="code-sample"
    class:fill
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
    {#if label}
        <figcaption>{label}</figcaption>
    {/if}
    <pre
        class="code-block"
        class:code-block-fill={fill}
        class:code-gutter-spacing={gutterSpacing}><code
            >{#if lines}{#each lines as tokens, index (index)}{#if index > 0}{newline}{/if}{#each tokens as token, tokenIndex (tokenIndex)}{#if token.kind === 'plain'}{token.text}{:else}<span
                                class={`asm-${token.kind}`}>{token.text}</span
                            >{/if}{/each}{/each}{:else}{code}{/if}</code
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
