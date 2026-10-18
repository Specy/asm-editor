<script lang="ts">
    /**
     * A few lines of assembly highlighted the way the editor highlights them, for the forms and
     * expansions of an opened row. The colours come from the palette the instruction view sets.
     */
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import { tokenizeAssembly } from '#lib/content/assemblyHighlight.ts'
    import { assemblyTokenClass } from '#lib/content/assemblyPalette.ts'
    import '#cmp/shared/markdown/codeBlocks.css'

    interface Props {
        code: string
        language?: AvailableLanguages
    }

    let { code, language }: Props = $props()

    const newline = '\n'
    let lines = $derived(
        language
            ? tokenizeAssembly(code, language).map((tokens) =>
                  tokens.map((token) => ({
                      text: token.text,
                      className: assemblyTokenClass(token, language)
                  }))
              )
            : undefined
    )
</script>

<code class="asm-code asm-highlight"
    >{#if lines}{#each lines as tokens, index (index)}{#if index > 0}{newline}{/if}{#each tokens as token, tokenIndex (tokenIndex)}{#if token.className}<span
                        class={token.className}>{token.text}</span
                    >{:else}{token.text}{/if}{/each}{/each}{:else}{code}{/if}</code
>

<style>
    .asm-code {
        font-family: 'Fira Code', monospace;
        font-variant-ligatures: none;
        white-space: pre;
    }
</style>
