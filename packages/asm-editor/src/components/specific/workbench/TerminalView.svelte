<script lang="ts">
    /**
     * The Terminal tab: an x86 program's Command line, then the Emulator's runtime errors and the
     * program's output, with a caret where a read waits for what is typed. It follows the end as the
     * program writes. The Command line stays above the transcript rather than scrolling with it,
     * and the transcript does not repeat it.
     */
    import TerminalConsole from '#cmp/shared/terminal/TerminalConsole.svelte'
    import type { Terminal } from '#lib/languages/peripherals/Terminal.svelte.ts'
    import type { CommandLineState } from '#lib/workbench/WorkbenchSession.svelte.ts'
    import CommandLine from './CommandLine.svelte'

    interface Props {
        terminal: Terminal
        /** The Emulator's runtime errors, shown before what the program wrote. */
        errors?: string
        /**
         * Whether its tab is the one shown: a hidden view has no height to scroll, and is no
         * console to type in.
         */
        visible?: boolean
        /** Whether a program is built and has not ended, so that typing reaches it. */
        interactive?: boolean
        /** Whether the output's escape sequences are drawn: the x86 Target's. */
        escapes?: boolean
        /** The Command line above the transcript, for a Target whose programs take Arguments. */
        commandLine?: CommandLineState
        onCommandLineChange?: (text: string) => void
        /** A change asks the Command line for the keyboard. */
        commandLineFocus?: number
    }

    let {
        terminal,
        errors = '',
        visible = true,
        interactive = false,
        escapes = false,
        commandLine,
        onCommandLineChange = () => {},
        commandLineFocus = 0
    }: Props = $props()
</script>

{#if commandLine}
    <CommandLine {commandLine} onChange={onCommandLineChange} focusRequest={commandLineFocus} />
{/if}

<TerminalConsole
    {terminal}
    prefix={errors ? `${errors}\n` : ''}
    {visible}
    {interactive}
    {escapes}
    placeholder="What the program writes appears here."
    style="--terminal-padding: var(--wb-output-padding);"
/>
