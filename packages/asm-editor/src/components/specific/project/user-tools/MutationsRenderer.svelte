<script lang="ts">
    import MutationStep from './MutationStep.svelte'
    import type { ExecutionStep } from '#lib/languages/commonLanguageFeatures.svelte.ts'
    import type { AvailableLanguages } from '#lib/Project.svelte.ts'
    interface Props {
        steps: ExecutionStep[]
        statusRegisterNames: string[]
        /** The Target, which names the widths a written mutation reports. */
        language: AvailableLanguages
        /**
         * Fill a section on its surface, with contrasting entries and height left to the section.
         */
        docked?: boolean
        /** "Undo to here" was pressed on row `index`: the `index` Undos of the rows above it. */
        onUndo?: (index: number) => void
        /** "Go to line" was pressed on a row. */
        onHighlight?: (step: ExecutionStep) => void
    }

    let {
        steps,
        statusRegisterNames,
        language,
        docked = false,
        onUndo,
        onHighlight
    }: Props = $props()

    /**
     * "Undo to here" takes the program back to just after a row ran: on row i, the i Undos of the
     * rows above it. Why it cannot on a row, or undefined when it can: the newest row is where the
     * program already is, and Undo stops at a row above whose effects are not recorded.
     */
    function undoBlocked(i: number): string | undefined {
        if (i === 0) return 'The program is already here'
        if (steps.slice(0, i).some((row) => row.undoable === false))
            return 'Undo stops before effects that are not recorded'
    }
</script>

<div class="column tab" class:docked>
    {#if steps.length === 0}
        <div class="row" style="justify-content: center; padding: {docked ? '0.3rem' : '0.4rem'}">
            No mutations
        </div>
    {/if}
    {#each steps as step, i (i)}
        <MutationStep
            {docked}
            {language}
            flags={statusRegisterNames}
            {step}
            undoBlocked={undoBlocked(i)}
            onUndo={() => onUndo?.(i)}
            {onHighlight}
        />
    {/each}
</div>

<style lang="scss">
    /* on the floating window's own tray, which tints and blurs what is beneath, as the Stack
       pointer is: no fill, corner or shadow of its own, the window's body clipping it */
    .tab {
        color: var(--primary-text);
        padding: 0.4rem;
        gap: 0.4rem;
        /* the floating window's bottom edge sets it, when it has been dragged */
        max-height: var(--floating-body-max-height, 30rem);
        width: 12rem;
        overflow-y: auto;
    }
    .tab.docked {
        padding: 0.3rem;
        gap: 0.3rem;
        width: auto;
        max-height: none;
        background-color: var(--wb-surface, var(--secondary));
        color: var(--secondary-text);
    }
</style>
