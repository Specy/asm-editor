<script lang="ts">
    /**
     * The code of an editor whose Monaco is still loading, drawn as Monaco will draw it: the same
     * font, colours, line numbers, gutter and indentation guides, so nothing moves when the editor
     * takes its place ([workbench-loading-plan.md](../../../../../docs/design/workbench-loading-plan.md),
     * Stage 3). It can be read and scrolled, not edited, and a small spinner in its corner says the
     * editor is still on its way.
     */
    import {
        AVAILABLE_LANGUAGES,
        type AvailableLanguages,
        type AvailableProgrammingLanguages
    } from '#lib/Project.svelte.ts'
    import type { TextFileLanguage } from '#lib/textFileLanguages.ts'
    import { tokenizeAssembly } from '#lib/content/assemblyHighlight.ts'
    import { tokenizeCpp } from '#lib/content/cppHighlight.ts'
    import { assemblyTokenClass, cppTokenClass } from '#lib/content/assemblyPalette.ts'
    import { codeBlockStyle } from '#lib/content/codeBlockStyle.ts'
    import { indentGuideLevels } from '#lib/content/codeBlocks.ts'
    import Spinner from '#cmp/shared/misc/Spinner.svelte'
    import '#cmp/shared/markdown/codeBlocks.css'

    interface Props {
        code: string
        language: AvailableLanguages | AvailableProgrammingLanguages | TextFileLanguage
    }

    let { code, language }: Props = $props()

    /** More than a screen holds: the rest shows once the editor has loaded, a moment later. */
    const SHOWN_LINES = 200

    /** The text up to the end of its `SHOWN_LINES`th line, found without splitting the whole File. */
    const shown = $derived.by(() => {
        let end = -1
        for (let line = 0; line < SHOWN_LINES; line++) {
            end = code.indexOf('\n', end + 1)
            if (end < 0) return code
        }
        return code.slice(0, end)
    })
    const lines = $derived.by<{ text: string; className?: string }[][]>(() => {
        if ((AVAILABLE_LANGUAGES as readonly string[]).includes(language)) {
            const assembly = language as AvailableLanguages
            return tokenizeAssembly(shown, assembly).map((tokens) =>
                tokens.map((token) => ({
                    text: token.text,
                    className: assemblyTokenClass(token, assembly)
                }))
            )
        }
        if (language === 'c' || language === 'cpp')
            return tokenizeCpp(shown).map((tokens) =>
                tokens.map((token) => ({ text: token.text, className: cppTokenClass(token) }))
            )
        return shown.split('\n').map((text) => [{ text }])
    })
    /** Monaco's indentation guides: one mark per run of lines at each level. */
    const guides = $derived.by(() => {
        const levels = indentGuideLevels(shown)
        const marks: { from: number; lines: number; level: number }[] = []
        const deepest = Math.max(0, ...levels)
        for (let level = 1; level <= deepest; level++) {
            let start = -1
            for (let line = 0; line <= levels.length; line++) {
                const inside = line < levels.length && levels[line] >= level
                if (inside && start < 0) start = line
                if (!inside && start >= 0) {
                    marks.push({ from: start, lines: line - start, level: level - 1 })
                    start = -1
                }
            }
        }
        return marks
    })
    /** Every line's number, as Monaco numbers them: the empty line after a final newline too. */
    const lineNumbers = $derived(lines.map((_, index) => index + 1).join('\n'))
    const style = $derived(codeBlockStyle())
    const newline = '\n'
</script>

<div class="editor-preview" {style} data-code-preview>
    <pre class="code-block code-block-fill code-gutter-spacing"><code
            >{#each lines as tokens, index (index)}{#if index > 0}{newline}{/if}{#each tokens as token, tokenIndex (tokenIndex)}{#if token.className}<span
                            class={token.className}>{token.text}</span
                        >{:else}{token.text}{/if}{/each}{/each}<span
                class="code-indent-guides"
                aria-hidden="true"
                >{#each guides as guide, index (index)}<i
                        style="--from: {guide.from}; --lines: {guide.lines}; --level: {guide.level}"
                    ></i>{/each}</span
            ></code
        ><span class="code-gutter" aria-hidden="true">{lineNumbers}</span></pre>
    <div class="loading">
        <!-- not announced: a page's own wait is, where there is one -->
        <Spinner label="Loading editor…" announce={false} />
    </div>
</div>

<style>
    .editor-preview {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        overflow: hidden;
        cursor: progress;
    }
    .editor-preview pre {
        overflow: auto;
        background: transparent;
    }
    .loading {
        position: absolute;
        top: 0.5rem;
        right: 1.5rem;
        display: flex;
        font-size: var(--fs-small);
        color: var(--hint);
    }
</style>
