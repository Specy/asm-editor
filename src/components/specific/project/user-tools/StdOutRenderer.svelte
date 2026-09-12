<script lang="ts">
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'
    import { fly } from 'svelte/transition'
    import Console from '$cmp/shared/Console.svelte'
    import { type Diagnostic, formatDiagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
    interface Props {
        stdOut: string
        diagnostics?: Diagnostic[]
        info?: string
        onDiagnosticSelect?: (diagnostic: Diagnostic) => void
    }

    let { stdOut, diagnostics = [], info = '', onDiagnosticSelect }: Props = $props()
    let areDiagnosticsShown = $state(false)
    let el: HTMLDivElement | undefined = $state()

    let separator = $derived(diagnostics.length ? '\n\n' : '')
    let hasErrors = $derived(diagnostics.some((d) => d.severity === 'error'))
    $effect(() => {
        if (el && stdOut) el.scrollTop = el.scrollHeight
    })
</script>

<div class="std-out" bind:this={el}>
    {#if diagnostics.length}
        <button
            class="floating-std-icon"
            in:fly|global={{ duration: 300 }}
            out:fly|global={{ duration: 200 }}
            class:warningOnly={!hasErrors}
            class:diagnosticsShown={areDiagnosticsShown}
            title={hasErrors ? 'Show compiler errors' : 'Show compiler warnings'}
            onclick={() => (areDiagnosticsShown = !areDiagnosticsShown)}
        >
            <FaExclamationTriangle />
        </button>
    {/if}
    <div class="output-content">
        {#if onDiagnosticSelect && diagnostics.length}
            <div class="diagnostics">
                {#each diagnostics as diagnostic, index (index)}
                    <div class="diagnostic-group">
                        <button
                            class:error={diagnostic.severity === 'error'}
                            onclick={() => onDiagnosticSelect?.(diagnostic)}
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
                                    onDiagnosticSelect?.({
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
            {#if stdOut}<Console value={stdOut} />{/if}
        {:else}
            <Console
                value={`${diagnostics.map(formatDiagnostic).join('\n')}${separator}${stdOut}`}
            />
        {/if}
    </div>
    <div class="info">
        {info}
    </div>
</div>

<style lang="scss">
    .floating-std-icon {
        position: absolute;
        background-color: var(--red);
        color: var(--red-text);
        padding: 0.2rem;
        right: 0.4rem;
        border-radius: 0.2rem;
        width: 1.4rem;
        height: 1.4rem;
        cursor: pointer;
        transition: all 0.3s;
        bottom: 0.4rem;
        &:hover {
            filter: brightness(1.2);
        }
    }
    /* single-class selectors so source order decides: .diagnosticsShown must still win while open */
    .warningOnly {
        background-color: #d19a3f;
        color: #181818;
    }
    .diagnosticsShown {
        background-color: var(--accent2);
        color: var(--accent2-text);
    }
    .std-out {
        min-height: 4rem;
        max-height: 8rem;
        position: relative;
        border-radius: 0.5rem;
        overflow-y: auto;
        display: flex;
        flex: 1;
        background-color: var(--secondary);
        color: var(--secondary-text);
        @media screen and (max-width: 1000px) {
            width: 100%;
            max-height: 10rem;
        }
    }
    .output-content {
        min-width: 0;
        width: 100%;
    }
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
    .info {
        position: fixed;
        bottom: 0.8rem;
        right: 1.2rem;
        color: var(--hint);
        font-size: 0.9rem;
    }
</style>
