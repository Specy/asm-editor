<script lang="ts">
    import type { AvailableLanguages } from '$lib/Project.svelte'
    import CodeSample from '../entries/CodeSample.svelte'
    import '$cmp/specific/workbench/workbench.css'
    import './instructionExample.css'

    interface Props {
        code: string
        language: AvailableLanguages
    }

    let { code, language }: Props = $props()
</script>

<div class="instruction-example playground">
    <div class="top-row">
        <div class="editor preview-editor">
            <div class="source-card">
                <CodeSample {code} {language} fill gutterSpacing />
            </div>
        </div>
    </div>
</div>

<style>
    .preview-editor {
        height: var(--instruction-row-min-height);
    }
    .source-card {
        display: flex;
        flex: 1;
        min-width: 0;
        min-height: 0;
        overflow: hidden;
        border: var(--wb-card-edge);
        border-radius: var(--wb-radius);
        background: var(--secondary);
    }
</style>
