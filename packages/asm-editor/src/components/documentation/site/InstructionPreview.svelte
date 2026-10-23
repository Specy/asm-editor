<script lang="ts">
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    import CodeSample from '../entries/CodeSample.svelte'
    import '#cmp/specific/workbench/workbench.css'
    import './instructionExample.css'

    interface Props {
        code: string
        language: AvailableLanguages
        /** Whether the loaded editor has a console, so the preview reserves its room. */
        showConsole?: boolean
    }

    let { code, language, showConsole = false }: Props = $props()
</script>

<!-- Invisible stand-ins for what the loaded editor shows before a Build, the code and the console,
     laid out by the same rules: its memory and registers wait for the program. The source spans
     both, so the editor takes the room the preview had and nothing below it moves when it loads. -->
<div class="instruction-example playground preview">
    <div class="top-row" aria-hidden="true">
        <div class="editor"></div>
    </div>
    {#if showConsole}
        <div class="console" aria-hidden="true"></div>
    {/if}
    <div class="source-card">
        <CodeSample {code} {language} fill gutterSpacing />
    </div>
</div>

<style>
    .preview {
        position: relative;
    }
    .top-row,
    .console {
        visibility: hidden;
    }
    /* StdOutRenderer's empty height */
    .console {
        height: 4rem;
    }
    .source-card {
        position: absolute;
        inset: 0;
        display: flex;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        background: var(--secondary);
    }
</style>
