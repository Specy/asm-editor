<script lang="ts">
    /**
     * The Diagnostics as clickable source locations, each followed by the locations related to it.
     * The Workbench's Problems tab lists them; the Interactive editor's console shows them above the
     * program's output.
     */
    import { type Diagnostic, formatDiagnostic } from '$lib/languages/commonLanguageFeatures.svelte'

    interface Props {
        diagnostics: Diagnostic[]
        onDiagnosticSelect: (diagnostic: Diagnostic) => void
    }

    let { diagnostics, onDiagnosticSelect }: Props = $props()
</script>

<div class="diagnostics">
    {#each diagnostics as diagnostic, index (index)}
        <div class="diagnostic-group">
            <button
                class:error={diagnostic.severity === 'error'}
                onclick={() => onDiagnosticSelect(diagnostic)}
                title="Open source location"
            >
                {diagnostic.file
                    ? `${diagnostic.file}:${diagnostic.lineIndex + 1}: `
                    : ''}{formatDiagnostic(diagnostic)}
            </button>
            {#each diagnostic.related ?? [] as related, relatedIndex (`${index}:${relatedIndex}`)}
                <button
                    class="related-location"
                    onclick={() =>
                        onDiagnosticSelect({
                            ...diagnostic,
                            file: related.file,
                            lineIndex: related.lineIndex,
                            column: related.column,
                            endColumn: related.endColumn,
                            message: related.message,
                            formatted: related.message,
                            related: []
                        })}
                    title="Open related source location"
                >
                    ↳ {related.file}:{related.lineIndex + 1}: {related.message}
                </button>
            {/each}
        </div>
    {/each}
</div>

<style lang="scss">
    .diagnostics {
        display: flex;
        flex-direction: column;
        padding: 0.35rem;
        gap: 0.2rem;

        .diagnostic-group {
            display: flex;
            flex-direction: column;
            gap: 0.1rem;
        }

        button {
            padding: 0.2rem 0.35rem;
            border: 0;
            border-radius: 0.2rem;
            color: #181818;
            background: #d19a3f;
            font: inherit;
            font-size: 0.78rem;
            text-align: left;
            cursor: pointer;
        }

        button.error {
            color: var(--red-text);
            background: var(--red);
        }

        button.related-location {
            margin-left: 1rem;
            color: var(--secondary-text);
            background: color-mix(in srgb, var(--secondary-text) 12%, transparent);
        }
    }
</style>
