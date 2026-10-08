<script lang="ts">
    /**
     * The Terminal tab: the Emulator's runtime errors, then the program's output, with a caret
     * where a read waits for what is typed. It follows the end as the program writes.
     */
    import TerminalConsole from '$cmp/shared/terminal/TerminalConsole.svelte'
    import type { Terminal } from '$lib/languages/peripherals/Terminal.svelte'

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
    }

    let {
        terminal,
        errors = '',
        visible = true,
        interactive = false,
        escapes = false
    }: Props = $props()
</script>

<TerminalConsole
    {terminal}
    prefix={errors ? `${errors}\n` : ''}
    {visible}
    {interactive}
    {escapes}
    placeholder="What the program writes appears here."
    style="--terminal-padding: var(--wb-output-padding);"
/>
