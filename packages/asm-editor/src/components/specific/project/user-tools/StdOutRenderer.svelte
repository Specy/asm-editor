<script lang="ts">
    /**
     * The Interactive editor's console: the compiler's diagnostics and the runtime errors, then the
     * Terminal with a caret where a read waits for what is typed.
     */
    import FaExclamationTriangle from '~icons/fa-solid/exclamation-triangle'
    import { fly } from 'svelte/transition'
    import TerminalConsole from '#cmp/shared/terminal/TerminalConsole.svelte'
    import ProblemsList from './ProblemsList.svelte'
    import { tooltip } from '#cmp/shared/floating/tooltip.svelte.ts'
    import type { Terminal } from '#lib/languages/peripherals/Terminal.svelte.ts'
    import {
        type Diagnostic,
        formatDiagnostic
    } from '#lib/languages/commonLanguageFeatures.svelte.ts'
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

    let hasErrors = $derived(diagnostics.some((d) => d.severity === 'error'))
    let listsDiagnostics = $derived(!!onDiagnosticSelect && diagnostics.length > 0)
    //the diagnostics as text when they are not listed, then a blank line, then the errors
    let prefix = $derived.by(() => {
        const listed = listsDiagnostics ? '' : diagnostics.map(formatDiagnostic).join('\n')
        return `${listed}${listed ? '\n\n' : ''}${errors ? `${errors}\n` : ''}`
    })
</script>

<div class="std-out">
    <!-- a mark of what the compiler found, which the console already shows: listed above the
         output, or as its first lines -->
    {#if diagnostics.length}
        <span
            class="floating-std-icon"
            role="img"
            in:fly|global={{ duration: 300 }}
            out:fly|global={{ duration: 200 }}
            class:warningOnly={!hasErrors}
            {@attach tooltip(hasErrors ? 'Compiler errors' : 'Compiler warnings')}
            aria-label={hasErrors ? 'Compiler errors' : 'Compiler warnings'}
        >
            <FaExclamationTriangle />
        </span>
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
        display: flex;
        background-color: var(--red);
        color: var(--red-text);
        padding: 0.2rem;
        right: 0.4rem;
        border-radius: 0.2rem;
        width: 1.4rem;
        height: 1.4rem;
        transition: all 0.3s;
        bottom: 0.4rem;
    }
    /* a single-class selector after the icon's, so source order lets it win */
    .warningOnly {
        background-color: #d19a3f;
        color: #181818;
    }
    /* the console scrolls inside, so the box keeps its height and the icon its corner. A card like
       the code and the registers around it, inside the same 1px edge */
    .std-out {
        min-height: 4rem;
        max-height: 8rem;
        position: relative;
        border: var(--wb-card-edge, 1px solid color-mix(in srgb, var(--tertiary) 60%, transparent));
        border-radius: var(--wb-radius, 0.4rem);
        overflow: hidden;
        display: flex;
        flex: 1;
        background-color: var(--wb-surface, var(--secondary));
        color: var(--secondary-text);
        @media screen and (max-width: 1000px) {
            width: 100%;
            max-height: 10rem;
        }
    }
    /* Draw the focus ring on the rounded panel so its clipped contents cannot cut off the corners. */
    .std-out:has(:global(.terminal-console.focused)) {
        outline: 1px solid var(--accent);
        outline-offset: -1px;
    }
    .std-out :global(.terminal-console.focused) {
        outline: none;
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
