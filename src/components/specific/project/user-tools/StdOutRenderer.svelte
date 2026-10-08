<script lang="ts">
    /**
     * The Interactive editor's console: the compiler's diagnostics and the runtime errors, then the
     * Terminal with a caret where a read waits for what is typed.
     */
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'
    import { fly } from 'svelte/transition'
    import TerminalConsole from '$cmp/shared/terminal/TerminalConsole.svelte'
    import ProblemsList from './ProblemsList.svelte'
    import type { Terminal } from '$lib/languages/peripherals/Terminal.svelte'
    import { type Diagnostic, formatDiagnostic } from '$lib/languages/commonLanguageFeatures.svelte'
    interface Props {
        terminal: Terminal
        /** The Emulator's runtime errors, shown before what the program wrote. */
        errors?: string
        diagnostics?: Diagnostic[]
        info?: string
        /** Whether a program is built and has not ended, so that typing reaches it. */
        interactive?: boolean
        /** Whether the output's escape sequences are drawn: the x86 Target's. */
        escapes?: boolean
        onDiagnosticSelect?: (diagnostic: Diagnostic) => void
    }

    let {
        terminal,
        errors = '',
        diagnostics = [],
        info = '',
        interactive = false,
        escapes = false,
        onDiagnosticSelect
    }: Props = $props()
    let areDiagnosticsShown = $state(false)

    let hasErrors = $derived(diagnostics.some((d) => d.severity === 'error'))
    let listsDiagnostics = $derived(!!onDiagnosticSelect && diagnostics.length > 0)
    //the diagnostics as text when they are not listed, then a blank line, then the errors
    let prefix = $derived.by(() => {
        const listed = listsDiagnostics ? '' : diagnostics.map(formatDiagnostic).join('\n')
        return `${listed}${listed ? '\n\n' : ''}${errors ? `${errors}\n` : ''}`
    })
</script>

<div class="std-out">
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
        {#if listsDiagnostics && onDiagnosticSelect}
            <div class="problems">
                <ProblemsList {diagnostics} {onDiagnosticSelect} />
            </div>
        {/if}
        <TerminalConsole {terminal} {prefix} {interactive} {escapes} />
    </div>
    <div class="info">
        {info}
    </div>
</div>

<style lang="scss">
    .floating-std-icon {
        position: absolute;
        z-index: 1;
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
    /* the console scrolls inside, so the box keeps its height and the icon its corner */
    .std-out {
        min-height: 4rem;
        max-height: 8rem;
        position: relative;
        border-radius: 0.5rem;
        overflow: hidden;
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
        display: flex;
        flex-direction: column;
        min-width: 0;
        min-height: 0;
        width: 100%;
    }
    .problems {
        flex: none;
        max-height: 50%;
        overflow: auto;
    }
    .info {
        position: fixed;
        bottom: 0.8rem;
        right: 1.2rem;
        color: var(--hint);
        font-size: 0.9rem;
    }
</style>
