<script lang="ts">
    import type monaco from 'monaco-editor'
    import Editor from '$cmp/specific/project/Editor.svelte'
    import { editorFileLanguage } from '$lib/sourceCompilation/records'
    import { useWorkbench } from './workbenchContext'

    const { session } = useWorkbench()
    let editor = $state.raw<monaco.editor.IStandaloneCodeEditor>()
    const path = $derived(session.mappedSourcePath)
    const file = $derived(session.project.files[path])
    const paths = $derived(
        Object.keys(session.displayedCompilation?.inputs ?? {}).filter(
            (input) => session.project.files[input]?.encoding === 'plain'
        )
    )
    const selection = $derived(
        session.mappingSelection?.path === path && session.mappingSelection.line >= 0
            ? [session.mappingSelection.line]
            : []
    )
    $effect(() => {
        if (selection.length) editor?.revealLineInCenter(selection[0] + 1)
    })
</script>

<section class="source-pane" aria-label="Mapped source">
    <div class="source-heading">
        <label>
            Source
            <select
                aria-label="Mapped source File"
                value={path}
                onchange={(event) => {
                    session.mappingSelection = { path: event.currentTarget.value, line: -1 }
                }}
            >
                {#each paths as input (input)}
                    <option value={input}>{input}</option>
                {/each}
            </select>
        </label>
    </div>
    <div class="source-code">
        <Editor
            bind:editor
            code={file?.content ?? ''}
            source={{ key: `mapped:${path}`, value: file?.content ?? '' }}
            language={editorFileLanguage(path, session.project.language)}
            disabled={session.editorDisabled}
            breakpointsEditable={false}
            diagnostics={session.sourceDiagnostics.filter((item) => item.file === path)}
            highlightedLine={session.executionSourceLocation?.path === path
                ? session.executionSourceLocation.line
                : -1}
            mappedLines={selection}
            lineColoring={session.mappingColors?.source.get(path)}
            on:change={(event) => session.fileEdited(path, event.detail)}
            on:lineSelect={(event) => session.selectMappedSourceLine(path, event.detail)}
        />
    </div>
</section>

<style lang="scss">
    .source-pane {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
        min-height: 0;
        border-right: 1px solid var(--wb-line);
    }
    .source-heading {
        padding: 0.4rem 0.65rem;
        border-bottom: 1px solid var(--wb-line);
        font-size: 0.75rem;
        background: var(--wb-strip);
    }
    label {
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    select {
        min-width: 0;
        flex: 1;
        color: var(--secondary-text);
        background: var(--secondary);
        padding: 0.15rem;
    }
    .source-code {
        display: flex;
        position: relative;
        flex: 1;
        min-height: 0;
    }
    @media (max-width: 700px) {
        .source-pane {
            border-right: 0;
            border-bottom: 1px solid var(--wb-line);
            min-height: 12rem;
        }
    }
</style>
