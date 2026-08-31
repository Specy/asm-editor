<script lang="ts">
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'
    import { fly } from 'svelte/transition'
    import Console from '$cmp/shared/Console.svelte'
    import {
        type Diagnostic,
        formatDiagnostic
    } from '$lib/languages/commonLanguageFeatures.svelte'
    interface Props {
        stdOut: string
        diagnostics?: Diagnostic[]
        info?: string
    }

    let { stdOut, diagnostics = [], info = '' }: Props = $props()
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
    <div>
        <Console value={`${diagnostics.map(formatDiagnostic).join('\n')}${separator}${stdOut}`} />
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
    .info {
        position: fixed;
        bottom: 0.8rem;
        right: 1.2rem;
        color: var(--hint);
        font-size: 0.9rem;
    }
</style>
